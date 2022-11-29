import { Controller, Get, Logger, Param } from '@nestjs/common'
import { DEFAULT_DEPARTURES_LIMIT, HelpersService } from '../helpers/helpers.service'
import { DepartureType } from '../ch/ch.type'
import { OUTPUT_DATE_FORMAT, stripId } from '../ch/ch.service'
import moment, { Moment } from 'moment-timezone'

const stationBaseUrl = 'https://timetable.search.ch/api/stationboard?show_delays=1'

function colorConvert(color: string): string {
    if (color.length === 3) {
        return color[0] + color[0] + color[1] + color[1] + color[2] + color[2]
    }
    return color
}

function getColors(color: string) {
    const colors = color.split('~')

    if (colors.length < 2 || colors[0].length === 0) {
        return { bg: '#ffffff', fg: '#000000' }
    }

    return { bg: '#' + colorConvert(colors[0]), fg: '#' + colorConvert(colors[1]) }
}

const TIME_FORMAT = 'YYYY-MM-DD HH:mm:ss'
function getTimeFormatted(departure?: string): string | null {
    if (!departure) {
        return null
    }
    return moment.tz(departure, TIME_FORMAT, 'Europe/Zurich').format(OUTPUT_DATE_FORMAT)
}

function getTime(time?: string): Moment {
    if (!time) {
        return null
    }
    return moment.tz(time, TIME_FORMAT, 'Europe/Zurich')
}

@Controller('api/search/')
export class SearchController {
    constructor(private helpersService: HelpersService) {}
    private readonly logger = new Logger(SearchController.name)
    @Get('stationboard/:id')
    async stationboard(
        @Param('id') id: string,
        defaultLimit: number | null = DEFAULT_DEPARTURES_LIMIT,
    ): Promise<any> {
        id = stripId(id)
        const url = `${stationBaseUrl}&limit=${await this.helpersService.stationLimit(
            id,
            defaultLimit,
        )}&stop=${id}`
        const data = await this.helpersService.callApi(url)
        if (data.error) {
            return data
        }
        if (!data.stop) {
            return { error: `Station ${id} not found in backend`, source: url, code: 'NOTFOUND' }
        }
        return {
            meta: { station_id: id, station_name: data.stop.name },
            departures: data.connections
                ? data.connections.map((connection): DepartureType => {
                      //console.log(connection.dep_delay)
                      const scheduled = getTimeFormatted(connection.time)
                      const realtime = connection.dep_delay
                          ? getTime(connection.time)
                                ?.add(connection.dep_delay, 'minutes')
                                .format(OUTPUT_DATE_FORMAT)
                          : getTimeFormatted(connection.time)
                      return {
                          id: connection.terminal.id,
                          type: connection.type,
                          colors: connection.type === 'strain' ? null : getColors(connection.color),
                          departure: { scheduled, realtime },
                          dt: scheduled || realtime,
                          arrival: { scheduled: null },
                          accessible: null,
                          source: 'search',
                          platform: null,
                          name: connection.line,
                          to: connection.terminal.name,
                      }
                  })
                : [],
        }
    }
}
