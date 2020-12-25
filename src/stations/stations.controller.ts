import { Controller, Get, Param } from '@nestjs/common'
import { HelpersService } from '../helpers/helpers.service'

const stationURL =
    'http://online.fahrplan.zvv.ch/bin/ajax-getstop.exe/dny?start=1&tpl=suggest2json&REQ0JourneyStopsS0A=7&getstop=1&noSession=yes&REQ0JourneyStopsB=25&REQ0JourneyStopsS0G='

@Controller('/')
export class StationsController {
    constructor(private helpersService: HelpersService) {}
    @Get('api/ch/stations/:name')
    async findStation(@Param('name') name: string) {
        const response = await this.helpersService.callApi(`${stationURL}${name.replace(' ', '+')}`)
        if (response.error) {
            return response
        }
        const json = (response as string)
            .replace(';SLs.showSuggestion();', '')
            .replace('SLs.sls=', '')
        const data = JSON.parse(json)

        return {
            stations: data.suggestions
                ?.filter(station => station.type === '1')
                .map(station => {
                    return {
                        id: station.extId,
                        name: station.value,
                        location: {
                            lon: station.xcoord / 1000000,
                            lat: station.ycoord / 1000000,
                        },
                    }
                }),
        }
    }
}
