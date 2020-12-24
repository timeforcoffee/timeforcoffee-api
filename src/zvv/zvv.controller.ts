import { Controller, Get, Logger, Param } from '@nestjs/common'
import axios from 'axios'
import { AllHtmlEntities } from 'html-entities'
import * as moment from 'moment-timezone'
import { Moment } from 'moment-timezone'
import { DbService } from '../db/db.service'

const stationBaseUrl =
    'http://online.fahrplan.zvv.ch/bin/stboard.exe/dny?dirInput=&boardType=dep&start=1&tpl=stbResult2json&input='

const stationLimit = (id: string): string => {
    id = id.replace(/^0*/, '')
    switch (id) {
        case '8503000': // Zürich HB
        case '8507000': // bern
        case '8507785': // Bern Hauptbahnof
        case '8500010': //Basel SBB
        case '22': //Basel
        case '8505000': //Luzern
            return '200'
        default:
            return '10'
    }
}

const sanitizeLine = (line: string): string => {
    line = AllHtmlEntities.decode(line)
    return line
        .replace(/S( )+/, 'S')
        .replace(/SN( )+/, 'SN')
        .replace(/IC( )+.*/, 'IC')
        .replace(/IR( )+.*/, 'IR')
        .replace('Tro( )+', '')
        .replace('Trm( )+', '')
        .replace('Bus +', '')
        .replace(' +', ' ')
}

const getDateTime = (input: { date: string; time: string }): Moment | null => {
    if (input && input.date && input.time) {
        return moment(input.date + ' ' + input.time, 'DD.MM.YYYY hh:mm', 'Europe/Zurich')
    }
    return null
}
const getFormattedDateTime = (input: { date: string; time: string }): string | null => {
    return getDateTime(input)?.format(OUTPUT_DATE_FORMAT)
}

const OUTPUT_DATE_FORMAT = 'YYYY-MM-DDTHH:mm:ss.SSSZ'

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

export class DepartureType {
    dt: string
    accessible: boolean
    arrival: { scheduled: string; realtime?: string | null }
    name: string
    departure: { scheduled: string; realtime?: string | null }
    source: string
    id: string
    to: string
    colors: { fg: string; bg: string }
    platform: string
    type: string
}

export class MetaType {
    station_id: string
    station_name: string
}

export class DeparturesType {
    meta: MetaType
    departures: DepartureType[]
    original: any
}

function getRealtime(pass, deptOrArr) {
    const prognosis = pass.prognosis

    if (pass.realtimeAvailability === 'RT_BHF') {
    }
}

@Controller('/')
export class ZvvController {
    constructor(private dbService: DbService) {}
    private readonly logger = new Logger(ZvvController.name)

    getDeparture = async (connection: {
        product: any
        mainLocation: any
        locations: string | any[]
        attributes_bfr: { code: string | string[] }[]
    }): Promise<DepartureType> => {
        const product = connection.product
        const mainLocation = connection.mainLocation
        const lastLocation =
            connection.locations.length > 0
                ? connection.locations[connection.locations.length - 1]
                : null
        const scheduled = getFormattedDateTime(mainLocation)
        const realtime = getFormattedDateTime(mainLocation.realTime)
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
            name: sanitizeLine(product.line),
            dt: realtime || scheduled,
            colors: { fg: '#' + product.color?.fg, bg: '#' + product.color?.bg },
            source: 'zvv',
            id: await this.dbService.zvvToSbbId(lastLocation.location?.id),
            accessible: connection.attributes_bfr?.[0]?.code?.includes('NF') || false,
            platform: mainLocation.platform || '',
            to: AllHtmlEntities.decode(product.direction),
        }
    }
    @Get('api/zvv/stationboard/:id')
    async stationboard(@Param('id') id: string): Promise<DeparturesType> {
        id = id.replace(/^0*/, '')
        const url = `${stationBaseUrl}${id}&maxJourneys=${stationLimit(id)}`
        this.logger.debug(`Get ${url}`)
        const response = await axios.get(url)

        const data = response.data

        return {
            meta: { station_id: id, station_name: AllHtmlEntities.decode(data.station.name) },
            departures: await this.getConnections(data.connections as any[]),
            original: data,
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
