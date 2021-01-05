import { Controller, Get, Header, Param } from '@nestjs/common'
import { redisClient } from './helpers.cache'

@Controller('api/helpers')
export class HelpersController {
    /**
     * Gets the current station limits to be inserted into the DB for redis restarts.
     * So that we have some decent default values for station limits (and not for example
     * get many 20 limit requests on busy station on an empty redis)
     */
    @Get('stationlimits')
    @Header('Content-Type', 'text/plain')
    async stationlimits(): Promise<string> {
        const keys: string[] = await new Promise(resolve =>
            redisClient.keys('station:limit:*', (err, keys) => resolve(keys)),
        )
        const values: { key: string; value: string }[] = []
        for (let i = 0; i < keys.length; i++) {
            const key: string = keys[i]
            const value = await new Promise<string>(resolve =>
                redisClient.get(key, (err, keys) => resolve(keys)),
            )
            values.push({ key, value })
        }
        return values
            .map(value => {
                const id = value.key.replace('station:limit:', '')
                return `UPDATE ZTFCSTATIONMODEL SET ZLIMIT = ${value.value} WHERE ZID = ${id};`
            })
            .join('\n')
    }
}
