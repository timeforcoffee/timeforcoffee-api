import { Controller, Get, Header, UseGuards } from '@nestjs/common'
import { redisClient } from './helpers.cache'
import { HelpersTokenGuard } from './helpers-token.guard'

// The station id is used as a SQLite integer primary key (ZID). Only accept
// plain integers so nothing attacker-controlled can be interpolated into SQL.
const isNumericId = (id: string): boolean => /^\d+$/.test(id)
// ZLASTACCESS is an ISO-8601 timestamp we generated ourselves; validate it
// before interpolating, so a poisoned Redis value can't break out of the string.
const isIsoDate = (value: string): boolean =>
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value)

/**
 * Collect all keys matching a pattern using SCAN (non-blocking) instead of KEYS,
 * which blocks the shared Redis instance for the whole scan.
 */
async function scanKeys(pattern: string): Promise<string[]> {
    const found: string[] = []
    let cursor = '0'
    do {
        const [nextCursor, keys]: [string, string[]] = await new Promise(resolve =>
            redisClient.scan(cursor, 'MATCH', pattern, 'COUNT', '500', (err, res) =>
                resolve(err ? ['0', []] : (res as unknown as [string, string[]])),
            ),
        )
        cursor = nextCursor
        found.push(...keys)
    } while (cursor !== '0')
    return found
}

function getValue(key: string): Promise<string> {
    return new Promise<string>(resolve => redisClient.get(key, (err, value) => resolve(value)))
}

@Controller('api/helpers')
@UseGuards(HelpersTokenGuard)
export class HelpersController {
    /**
     * Gets the current station limits to be inserted into the DB for redis restarts.
     * So that we have some decent default values for station limits (and not for example
     * get many 20 limit requests on busy station on an empty redis)
     */
    @Get('stationlimits')
    @Header('Content-Type', 'text/plain')
    async stationlimits(): Promise<string> {
        const keys = await scanKeys('station:limit:*')
        const lines: string[] = []
        for (const key of keys) {
            const id = key.replace('station:limit:', '')
            const value = await getValue(key)
            if (!isNumericId(id) || !isNumericId(value)) {
                continue
            }
            lines.push(`UPDATE ZTFCSTATIONMODEL SET ZLIMIT = ${value} WHERE ZID = ${id};`)
        }
        return lines.join('\n')
    }

    @Get('stationlastaccess')
    @Header('Content-Type', 'text/plain')
    async stationlastaccess(): Promise<string> {
        const keys = await scanKeys('station:lastAccess:*')
        const lines: string[] = []
        for (const key of keys) {
            const id = key.replace('station:lastAccess:', '')
            const value = await getValue(key)
            if (!isNumericId(id) || !isIsoDate(value)) {
                continue
            }
            lines.push(`UPDATE ZTFCSTATIONMODEL SET ZLASTACCESS = "${value}" WHERE ZID = ${id};`)
        }
        return lines.join('\n')
    }
}
