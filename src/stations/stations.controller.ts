import { Controller, Get, Header, Param } from '@nestjs/common'
import { HelpersService } from '../helpers/helpers.service'
import { Cache } from '../helpers/helpers.cache'

const stationURL =
    'https://fpbe.zvv.ch/restproxy/location.name?format=json&accessId=OFPubique&type=S&input='
@Controller('/')
export class StationsController {
    constructor(private helpersService: HelpersService) {}
    @Get('api/:api/stations/:name')
    @Header('Cache-Control', 'public, max-age=3600')
    @Cache({ ttl: 86400 })
    async findStation(@Param('name') name: string) {
        const data = await this.helpersService.callApi(
            `${stationURL}${name.replace(' ', '+').replace('*', '%3F')}`,
        )
        if (data.error) {
            return data
        }

        return {
            stations: data.stopLocationOrCoordLocation
                ?.filter(station => station.StopLocation.extId)
                .map(station => {
                    const location = station.StopLocation
                    return {
                        id: location.extId,
                        name: location.name,
                        location: {
                            lon: location.lon,
                            lat: location.lat,
                        },
                    }
                }),
        }
    }
}
