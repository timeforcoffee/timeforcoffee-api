import { Controller, Get, Header, Logger, Param } from '@nestjs/common'
import { decode } from 'html-entities'
import moment from 'moment-timezone'
import { Moment } from 'moment-timezone'
import { DbService } from '../db/db.service'
import { DeparturesError, DeparturesType, DepartureType } from '../ch/ch.type'
import { OUTPUT_DATE_FORMAT, stripId } from '../ch/ch.service'
import { DEFAULT_DEPARTURES_LIMIT, HelpersService } from '../helpers/helpers.service'
import { Cache } from '../helpers/helpers.cache'

const stationBaseUrl = 'https://zvv.hafas.cloud/restproxy/departureBoard'

const buildUrl = (id: string, limit: string, datetimeObj: Moment): string => {
    const params = new URLSearchParams({
        format: 'json',
        accessId: 'OFPubique',
        type: 'DEP_STATION',
        duration: '1439',
        id: id,
        date: datetimeObj.format('YYYY-MM-DD'),
        time: datetimeObj.format('HH:mm'),
        passlist: '1',
        maxJourneys: limit,
        baim: '1',
    })
    return `${stationBaseUrl}?${params.toString()}`
}

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

const getDateTime = (date: string, time: string): Moment | null => {
    if (date && time) {
        return moment.tz(`${date} ${time}`, 'YYYY-MM-DD HH:mm:ss', 'Europe/Zurich')
    }
    return null
}
const getFormattedDateTime = (date: string, time: string): string | null => {
    return getDateTime(date, time)?.format(OUTPUT_DATE_FORMAT)
}

const mapType = (catOut: string): string => {
    const cat = catOut?.toLowerCase()
    switch (cat) {
        case 'tram':
            return 'tram'
        case 'bus':
            return 'bus'
        case 'bat':
        case 'boat':
            return 'boat'
        default:
            return 'train'
    }
}

const hasAccessible = (notes?: { key?: string; value?: string }[]): boolean => {
    if (!notes || !Array.isArray(notes)) {
        return false
    }
    // baim notes indicate accessibility info is available
    return notes.some(note => note.key?.startsWith('baim'))
}

@Controller('/api/zvv/')
export class ZvvController {
    constructor(private dbService: DbService, private helpersService: HelpersService) {}
    private readonly logger = new Logger(ZvvController.name)

    getDeparture = async (departure: {
        ProductAtStop: {
            name: string
            catOut: string
            icon?: { foregroundColor?: { hex: string }; backgroundColor?: { hex: string } }
        }
        direction: string
        date: string
        time: string
        rtDate?: string
        rtTime?: string
        depPlatform?: string
        rtDepPlatform?: string
        Stops?: { Stop?: any[] }
        Notes?: { Note?: { key?: string; value?: string }[] }
    }): Promise<DepartureType> => {
        const product = departure.ProductAtStop
        const stops = departure.Stops?.Stop || []
        const lastStop = stops.length > 0 ? stops[stops.length - 1] : null

        const scheduled = getFormattedDateTime(departure.date, departure.time)
        const realtime =
            departure.rtDate && departure.rtTime
                ? getFormattedDateTime(departure.rtDate, departure.rtTime)
                : null

        const arrivalScheduled = lastStop
            ? getFormattedDateTime(lastStop.arrDate, lastStop.arrTime)
            : null
        const arrivalRealtime =
            lastStop?.rtArrDate && lastStop?.rtArrTime
                ? getFormattedDateTime(lastStop.rtArrDate, lastStop.rtArrTime)
                : undefined

        return {
            departure: {
                scheduled,
                realtime,
            },
            arrival: {
                scheduled: arrivalScheduled,
                realtime: arrivalRealtime,
            },
            type: mapType(product.catOut),
            name: sanitizeLine(product.name),
            dt: realtime || scheduled,
            colors: {
                fg: product.icon?.foregroundColor?.hex || '#000000',
                bg: product.icon?.backgroundColor?.hex || '#ffffff',
            },
            source: 'zvv',
            id: await this.dbService.zvvToSbbId(lastStop?.extId),
            accessible: hasAccessible(departure.Notes?.Note),
            platform: departure.rtDepPlatform || departure.depPlatform || null,
            to: decode(departure.direction),
        }
    }
    @Get('stationboard/:id')
    @Header('Cache-Control', 'public, max-age=29')
    async stationboard(
        @Param('id') id: string,
        defaultLimit: number | null = DEFAULT_DEPARTURES_LIMIT,
    ): Promise<DeparturesType | DeparturesError> {
        id = stripId(id)
        const limit = await this.helpersService.stationLimit(id, defaultLimit)
        const datetimeObj = moment.tz('Europe/Zurich')
        const url = buildUrl(id, limit, datetimeObj)

        const data = await this.helpersService.callApi(url)
        if (data.error) {
            return data
        }

        if (!data.Departure || !Array.isArray(data.Departure)) {
            // Check if it's an error response or empty
            if (data.errorCode || data.errorText) {
                return {
                    error: `Station ${id} not found in backend`,
                    source: url,
                    code: 'NOTFOUND',
                }
            }
            return { error: 'Wrong data format from data provider' }
        }

        const departures = await this.getConnections(data.Departure as any[])

        // Get station name from first departure's first stop, or fallback to DB
        let stationName = ''
        if (data.Departure.length > 0) {
            const firstStop = data.Departure[0].Stops?.Stop?.[0]
            stationName = firstStop?.name || ''
        }
        if (!stationName) {
            const stationInfo = await this.dbService.getApiKey(id)
            stationName = stationInfo.name
        }

        if (departures.length > 0) {
            const lastScheduled = moment(departures[departures.length - 1].departure.scheduled)
            const firstScheduled = moment(departures[0].departure.scheduled)

            // if first and last scheduled are more than 4 hours away, we may have asked for too many
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
            meta: { station_id: id, station_name: decode(stationName) },
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
        const url = buildUrl(id, limit, datetimeObj)

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
        if (!data.Departure || !Array.isArray(data.Departure)) {
            if (data.errorCode || data.errorText) {
                return {
                    error: `Station ${id} not found in backend`,
                    source: url,
                    code: 'NOTFOUND',
                }
            }
            return { error: 'Wrong data format from data provider' }
        }

        // Get station name from first departure's first stop, or fallback to DB
        let stationName = ''
        if (data.Departure.length > 0) {
            const firstStop = data.Departure[0].Stops?.Stop?.[0]
            stationName = firstStop?.name || ''
        }
        if (!stationName) {
            const stationInfo = await this.dbService.getApiKey(id)
            stationName = stationInfo.name
        }

        return {
            meta: { station_id: id, station_name: decode(stationName) },
            departures: await this.getConnections(data.Departure as any[]),
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
