import { Controller, Get, Logger, Param } from '@nestjs/common'
import moment from 'moment-timezone'
import { OUTPUT_DATE_FORMAT, stripId } from '../ch/ch.service'
import { HelpersService } from '../helpers/helpers.service'
import { DeparturesType, DepartureType } from '../ch/ch.type'

const stationBaseUrl = 'http://transport.opendata.ch/v1/stationboard'

const ODP_TIME_FORMAT = 'YYYY-MM-DDTHH:mm:ssZ'

function getTimeFormatted(departure?: string): string | null {
    if (!departure) {
        return null
    }
    return moment.tz(departure, ODP_TIME_FORMAT, 'Europe/Zurich').format(OUTPUT_DATE_FORMAT)
}

function mapType(category: string): string {
    switch (category) {
        case 'B':
            return 'bus'
        case 'S':
        case 'IC':
        case 'IR':
        case 'RE':
            return 'train'
        default:
            return category
    }
}

function mapNumber(category: string, number: string): string {
    switch (category) {
        case 'S':
            return `${category}${number}`
        case 'IC':
        case 'IR':
            return `${category}`
        default:
            return number
    }
}

@Controller('/api/odp/')
export class OpendataController {
    constructor(private helpersService: HelpersService) {}
    @Get('stationboard/:id')
    async stationboard(@Param('id') id: string): Promise<DeparturesType> {
        id = stripId(id)

        const data = await this.helpersService.callApi(`${stationBaseUrl}?id=${id}`)
        return {
            meta: { station_name: data.station.name, station_id: data.station.id },
            departures: data.stationboard.map(board => {
                const scheduled = getTimeFormatted(board.stop.departure)

                const arrivalStation = board.passList[board.passList.length - 1]
                const foo: DepartureType = {
                    platform: board.stop.platform,
                    source: 'odp',
                    accessible: null,
                    departure: {
                        scheduled,
                        realtime: getTimeFormatted(board.stop.prognosis.departure),
                    },
                    arrival: { scheduled: getTimeFormatted(arrivalStation.arrival) },
                    to: board.to,
                    type: mapType(board.category),
                    name: mapNumber(board.category, board.number),
                    dt: board.stop.departure,
                    colors: { fg: '#000000', bg: '#ffffff' },
                    id: arrivalStation.station.id,
                }
                return foo
            }),
        }
    }
}
