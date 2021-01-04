import { Controller, Get, Header, Logger, Param } from '@nestjs/common'
import { decode } from 'html-entities'
import moment from 'moment-timezone'
import { Moment } from 'moment-timezone'
import { DbService } from '../db/db.service'
import { DeparturesError, DeparturesType, DepartureType } from '../ch/ch.type'
import { OUTPUT_DATE_FORMAT, stripId } from '../ch/ch.service'
import { HelpersService } from '../helpers/helpers.service'
import { Cache } from '../helpers/helpers.cache'

const stationBaseUrl =
    'http://online.fahrplan.zvv.ch/bin/stboard.exe/dny?dirInput=&boardType=dep&start=1&tpl=stbResult2json&input='

const stationLimit = (id: string): string => {
    id = stripId(id)
    switch (id) {
        case '8503000': // Zürich HB
        case '8507000': // bern
        case '8507785': // Bern Hauptbahnof
        case '8500010': //Basel SBB
        case '22': //Basel
        case '8505000': //Luzern
            return '200'
        default:
            return '100'
    }
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
        const url = `${stationBaseUrl}${id}&maxJourneys=${stationLimit(id)}`

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

        return {
            meta: { station_id: id, station_name: decode(data.station?.name) },
            departures: await this.getConnections(data.connections as any[]),
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

        const url = `${stationBaseUrl}${id}&maxJourneys=${stationLimit(
            id,
        )}&date=${datetimeObj.format('DD.MM.YY')}&time=${datetimeObj.format('HH:mm')}`

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
