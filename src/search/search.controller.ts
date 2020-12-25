import { Controller, Get, Logger, Param } from '@nestjs/common'
import { HelpersService } from '../helpers/helpers.service'
import { DeparturesError, DeparturesType, DepartureType } from '../ch/ch.type'
import { OUTPUT_DATE_FORMAT, stripId } from '../ch/ch.service'
import * as moment from 'moment-timezone'
import { Moment } from 'moment-timezone'

const stationBaseUrl = 'https://timetable.search.ch/api/stationboard?show_delays=1&stop='

function colorConvert(color: string): string {
    if (color.length === 3) {
        return color[0] + color[0] + color[1] + color[1] + color[2] + color[2]
    }
    return color
}

function getColors(color: string) {
    const colors = color.split('~')
    if (colors.length < 2) {
        return { bg: '#ffffff', fg: '#000000' }
    }

    return { bg: '#' + colorConvert(colors[0]), fg: '#' + colorConvert(colors[1]) }
}

const TIME_FORMAT = 'YYYY-MM-DD HH:mm:ss'
function getTimeFormatted(departure?: string): string | null {
    if (!departure) {
        return null
    }
    return moment(departure, TIME_FORMAT, 'Europe/Zurich').format(OUTPUT_DATE_FORMAT)
}

function getTime(time?: string): Moment {
    if (!time) {
        return null
    }
    return moment(time, TIME_FORMAT, 'Europe/Zurich')
}

@Controller('api/search/')
export class SearchController {
    constructor(private helpersService: HelpersService) {}
    private readonly logger = new Logger(SearchController.name)
    @Get('stationboard/:id')
    async stationboard(@Param('id') id: string): Promise<any> {
        id = stripId(id)
        const url = `${stationBaseUrl}${id}`
        const data = await this.helpersService.callApi(url)
        if (data.error) {
            return data
        }

        const foo: DeparturesType = {
            meta: { station_id: id, station_name: data.stop.name },
            departures: data.connections.map(
                (connection): DepartureType => {
                    const scheduled = getTimeFormatted(connection.time)
                    const realtime = connection.dep_delay
                        ? getTime(connection.time)
                              ?.add(connection.dep_delay, 'minutes')
                              .format(OUTPUT_DATE_FORMAT)
                        : null
                    return {
                        id: connection.terminal.id,
                        type: connection.type,
                        colors: getColors(connection.color),
                        departure: { scheduled, realtime },
                        dt: scheduled || realtime,
                        arrival: { scheduled: null },
                        accessible: null,
                        source: 'search',
                        platform: null,
                        name: connection.line,
                        to: connection.terminal.name,
                    }
                },
            ),
        }

        return foo
    }
}
