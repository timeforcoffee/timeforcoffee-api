import { Controller, Get, Header, Param } from '@nestjs/common'
import { HelpersService } from '../helpers/helpers.service'
import { Cache } from '../helpers/helpers.cache'

const stationURL =
    'https://online.fahrplan.zvv.ch/bin/ajax-getstop.exe/dny?tpl=suggest2json&encoding=utf-8&REQ0JourneyStopsS0A=7&getstop=1&noSession=yes&REQ0JourneyStopsB=20&REQ0JourneyStopsF=distinguishStationAttribute;ZH&js=true&REQ0JourneyStopsS0G='
@Controller('/')
export class StationsController {
    constructor(private helpersService: HelpersService) {}
    @Get('api/:api/stations/:name')
    @Header('Cache-Control', 'public, max-age=3600')
    @Cache({ ttl: 86400 })
    async findStation(@Param('name') name: string) {
        const response = await this.helpersService.callApi(
            `${stationURL}${name.replace(' ', '+').replace('*', '%3F')}`,
        )
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
