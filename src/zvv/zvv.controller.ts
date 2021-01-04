import { Controller, Get, Header, Logger, Param } from '@nestjs/common'
import { decode } from 'html-entities'
import moment from 'moment-timezone'
import { Moment } from 'moment-timezone'
import { DbService } from '../db/db.service'
import { DeparturesError, DeparturesType, DepartureType } from '../ch/ch.type'
import { OUTPUT_DATE_FORMAT, stripId } from '../ch/ch.service'
import { DEFAULT_DEPARTURES_LIMIT, HelpersService } from '../helpers/helpers.service'
import { Cache } from '../helpers/helpers.cache'

const stationBaseUrl =
    'http://online.fahrplan.zvv.ch/bin/stboard.exe/dny?dirInput=&boardType=dep&start=1&tpl=stbResult2json&input='

const sanitizeLine = (line: string): string => {
    line = decode(line)
    return line
        .replace(/^[S ]+/, 'S')
        .replace(/SN( )+/, 'SN')
        .replace(/IC.*/, 'IC')
        .replace(/IR.*/, 'IR')
        .replace(/Tro( )+/, '')
        .replace(/Trm( )+/, '')
        .replace(/Bus +/, '')
        .replace(/ +/, ' ')
}

const getDateTime = (input: { date: string; time: string }): Moment | null => {
    if (input && input.date && input.time) {
        return moment.tz(input.date + ' ' + input.time, 'DD.MM.YYYY HH:mm', 'Europe/Zurich')
    }
    return null
}
const getFormattedDateTime = (input: { date: string; time: string }): string | null => {
    return getDateTime(input)?.format(OUTPUT_DATE_FORMAT)
}

const mapType = (type: string): string => {
    switch (type) {
        case 'icon_tram':
            return 'tram'
        case 'icon_bus':
            return 'bus'
        case 'icon_boat':
            return 'boat'
        default:
            return 'train'
    }
}

const hasAccessible = (code?: string): boolean => {
    if (!code) {
        return false
    }
    return code.includes('NF') || code.includes('6') || code.includes('9')
}

@Controller('/api/zvv/')
export class ZvvController {
    constructor(private dbService: DbService, private helpersService: HelpersService) {}
    private readonly logger = new Logger(ZvvController.name)

    getDeparture = async (connection: {
        product: any
        mainLocation: any
        locations: string | any[]
        attributes_bfr: { code: string }[]
    }): Promise<DepartureType> => {
        const product = connection.product
        const mainLocation = connection.mainLocation
        const lastLocation =
            connection.locations.length > 0
                ? connection.locations[connection.locations.length - 1]
                : null
        const scheduled = getFormattedDateTime(mainLocation)
        const realtime = getFormattedDateTime(mainLocation.realTime) || null
        return {
            departure: {
                scheduled,
                realtime,
            },
            arrival: {
                scheduled: getFormattedDateTime(lastLocation),
                realtime: getFormattedDateTime(lastLocation.realTime) || undefined,
            },
            type: mapType(product.icon),
            name: sanitizeLine(product.name),
            dt: realtime || scheduled,
            colors: { fg: '#' + product.color?.fg, bg: '#' + product.color?.bg },
            source: 'zvv',
            id: await this.dbService.zvvToSbbId(lastLocation.location?.id),
            accessible: hasAccessible(connection.attributes_bfr?.[0]?.code) || false,
            platform: mainLocation.platform || null,
            to: decode(product.direction),
        }
    }
    @Get('stationboard/:id')
    @Header('Cache-Control', 'public, max-age=29')
    async stationboard(@Param('id') id: string): Promise<DeparturesType | DeparturesError> {
        id = stripId(id)
        const limit = await this.helpersService.stationLimit(id)
        const url = `${stationBaseUrl}${id}&maxJourneys=${limit}`

        const data = await this.helpersService.callApi(url)
        if (data.error) {
            return data
        }

        if (!data.station || !data.connections) {
            return { error: 'Wrong data format from data provider' }
        }
        if (data.station.name === '') {
            return { error: `Station ${id} not found in backend`, source: url, code: 'NOTFOUND' }
        }

        const departures = await this.getConnections(data.connections as any[])
        if (departures.length > 0) {
            const lastScheduled = moment(departures[departures.length - 1].departure.scheduled)
            const firstScheduled = moment(departures[0].departure.scheduled)

            // if first and last scheduled are more than four hours away, we may have asked for too many
            // decrease it (in case, we increase the limit for some station way too much)
            // and are on the same day (to avoid "over night" issues)
            if (
                parseInt(limit) >= DEFAULT_DEPARTURES_LIMIT + 10 &&
                lastScheduled.diff(firstScheduled, 'minutes') > 240 &&
                lastScheduled.format('YYYY-MM-DD') === firstScheduled.format('YYYY-MM-DD')
            ) {
                this.logger.warn(
                    `Too many departures for ${id}, last was at ${lastScheduled.format(
                        'YYYY-MM-DD HH:mm',
                    )}. Lower limit by 10`,
                )
                this.helpersService.setStationLimit(id, parseInt(limit) - 10)
            }
        }
        return {
            meta: { station_id: id, station_name: decode(data.station?.name) },
            departures,
        }
    }

    @Get('stationboard/:id/:starttime')
    @Header('Cache-Control', 'public, max-age=59')
    @Cache({ ttl: 59 })
    async stationboardStarttime(
        @Param('id') id: string,
        @Param('starttime') starttime: string,
    ): Promise<DeparturesType | DeparturesError> {
        id = stripId(id)
        const datetimeObj = moment.tz(starttime, 'YYYY-MM-DDTHH:mm', 'Europe/Zurich')
        const limit = await this.helpersService.stationLimit(id)
        const url = `${stationBaseUrl}${id}&maxJourneys=${limit}&date=${datetimeObj.format(
            'DD.MM.YY',
        )}&time=${datetimeObj.format('HH:mm')}`

        // set limit to 100, if someone got until here, makes sense to just deliver some more stations
        // in the first request later
        // and we ask for within an 120 minutes (that's what the App uses)
        const diffMinutes = datetimeObj.diff(moment(), 'minutes')
        // if negative, it's in the past, just return current...
        if (diffMinutes < 0) {
            return this.stationboard(id)
        }
        if (diffMinutes < 110) {
            const limitInt = parseInt(limit)
            if (limitInt < 100) {
                // if less than 60 minutes, we can add 30, otherwise add 10 to the limit
                if (diffMinutes < 30) {
                    this.helpersService.setStationLimit(id, Math.min(100, limitInt + 40))
                } else if (diffMinutes < 60) {
                    this.helpersService.setStationLimit(id, Math.min(100, limitInt + 30))
                } else {
                    this.helpersService.setStationLimit(id, limitInt + 10)
                }
            }
            // and if within 50 minutes, and less than 100 limit, we can set it to 200
            else if (datetimeObj.diff(moment(), 'minutes') < 50) {
                if (parseInt(limit) < 200) {
                    this.helpersService.setStationLimit(id, limitInt + 10)
                }
            }
        }

        const data = await this.helpersService.callApi(url)
        if (data.error) {
            return data
        }
        if (!data.station || !data.connections) {
            return { error: 'Wrong data format from data provider' }
        }

        return {
            meta: { station_id: id, station_name: decode(data.station.name) },
            departures: await this.getConnections(data.connections as any[]),
        }
    }

    private async getConnections(data: any[]) {
        const departures: DepartureType[] = []
        for (let i = 0; i < data.length; i++) {
            departures.push(await this.getDeparture(data[i]))
        }
        return departures
    }
}
