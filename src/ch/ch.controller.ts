import { Controller, Get, Header, Logger, Param, Req, Res } from '@nestjs/common'
import { Response, Request } from 'express'

import { ZvvController } from '../zvv/zvv.controller'
import { DbService } from '../db/db.service'
import { DeparturesError, DeparturesType, DepartureType } from './ch.type'
import { OstController } from '../ost/ost.controller'
import { BltController } from '../blt/blt.controller'
import moment from 'moment-timezone'
import { OUTPUT_DATE_FORMAT, stripId } from './ch.service'
import { HelpersService } from '../helpers/helpers.service'
import { OpendataController } from '../opendata/opendata.controller'
import { SearchController } from '../search/search.controller'
import { Cache } from '../helpers/helpers.cache'

const NOTEXISTING_IDS = [
    '8595033',
    '8573851',
    '8591026',
    '82',
    '8589565',
    '8594932',
    '8591055',
    '8508652',
]
const connectionsBaseUrl = 'http://transport.opendata.ch/v1/connections?limit=5&direct=1&'

@Controller('')
export class ChController {
    constructor(
        private zvvController: ZvvController,
        private ostController: OstController,
        private bltController: BltController,
        private opendataController: OpendataController,
        private searchController: SearchController,
        private dbService: DbService,
        private helpersService: HelpersService,
    ) {}
    private readonly logger = new Logger(ChController.name)

    @Get('/api/ch/stationboard/:id')
    @Header('Cache-Control', 'public, max-age=29')
    async stationboard(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
        id = stripId(id)

        // send 59s cache-control to non timeforcoffee clients, that's enough
        if (!req.header('user-agent').includes('offee')) {
            //coffee or Coffee
            res.setHeader('Cache-Control', 'public, max-age=59')
        }

        const data = await this.stationboardCached(id)
        if (!('error' in data)) {
            const nextScheduled = data.departures?.[0]?.departure.scheduled
            if (nextScheduled) {
                const nextScheduledUnix = moment(nextScheduled, OUTPUT_DATE_FORMAT).unix()
                const now = +new Date() / 1000
                const CUT_TIME = 1200
                // If first schedule is more than 21 minutes away, set cache time to 20 minutes before that
                if (nextScheduledUnix - now > CUT_TIME + 60) {
                    res.setHeader(
                        'Cache-Control',
                        'public, max-age=' + Math.floor(nextScheduledUnix - now - CUT_TIME),
                    )
                }
            }
        }
        res.send(data)
    }

    @Cache({ ttl: 29 })
    async stationboardCached(id: string): Promise<DeparturesType | DeparturesError> {
        const data = await this.getData(id)
        if ('error' in data) {
            this.logger.error(`${id} returned errror: ${data.error}`)
        }
        return data
    }

    async getData(id: string): Promise<DeparturesType | DeparturesError> {
        const api = await this.dbService.getApiKey(id)
        if (NOTEXISTING_IDS.includes(id)) {
            return {
                meta: {
                    station_id: id,
                    station_name: `${api.name}. Station does not exist anymore`,
                },
                departures: [],
            }
        }
        switch (api.apikey) {
            case 'ost':
                return this.combine(
                    api.id,
                    this.ostController.stationboard(api.apiid),
                    api.apikey,
                    api.name,
                )
            case 'blt':
                return this.combine(
                    api.id,
                    this.bltController.stationboard(api.apiid),
                    api.apikey,
                    api.name,
                )
            case 'odp':
            case 'vbl':
            case 'bvb':
            case 'gva':
            case 'search':
                return this.combine(
                    api.id,
                    this.searchController.stationboard(api.id),
                    api.apikey,
                    api.name,
                )
            default:
                const zvvAnswer = this.checkForError(
                    await this.zvvController.stationboard(api.id),
                    api.id,
                    api.name,
                )
                if ('error' in zvvAnswer) {
                    this.logger.error(`zvv failed for ${api.id}, fall back to search`)
                    return this.checkForError(
                        await this.searchController.stationboard(api.id),
                        api.id,
                        api.name,
                    )
                }
                return zvvAnswer
        }
    }

    checkForError(response: DeparturesType | DeparturesError, id: string, stationName: string) {
        if ('error' in response && response.code === 'NOTFOUND') {
            this.logger.warn(`${stationName} not found in backends`)
            return {
                meta: { station_id: id, station_name: `${stationName}. Station not found` },
                departures: [],
            }
        }
        return response
    }

    async combine(
        id: string,
        stationboardPromise: Promise<DeparturesType>,
        apikey: string,
        stationName: string,
    ): Promise<DeparturesType | DeparturesError> {
        const responses: (DeparturesType | DeparturesError)[] = await Promise.all([
            this.zvvController.stationboard(id).catch(
                (e): DeparturesError => {
                    return { error: e.message, source: 'zvv' }
                },
            ),
            stationboardPromise.catch(
                (e): DeparturesError => {
                    return { error: e.message, source: apikey }
                },
            ),
        ])

        if ('error' in responses[0] || !(responses[0].departures.length > 0)) {
            return this.checkForError(responses[1], id, stationName)
        }
        if ('error' in responses[1] || !(responses[1].departures.length > 0)) {
            return this.checkForError(responses[0], id, stationName)
        }

        const zvv = responses[0]
        const other = responses[1]

        const otherHashmap: DepartureType[] = []
        for (let i = 0; i < other.departures.length; i++) {
            const dept = other.departures[i]
            otherHashmap[dept.name + '-' + dept.departure.scheduled] = dept
        }
        for (let i = 0; i < zvv.departures.length; i++) {
            const dept = zvv.departures[i]
            const hash = dept.name + '-' + dept.departure.scheduled
            if (otherHashmap[hash]) {
                const otherDept: DepartureType = otherHashmap[hash]
                if (otherDept.accessible) {
                    dept.accessible = true
                    dept.source += ', accessible: ' + otherDept.source
                }
                if (otherDept.platform) {
                    dept.platform = otherDept.platform
                    dept.source += ', platform: ' + otherDept.source
                }
                if (otherDept.name && !dept.name) {
                    dept.name = otherDept.name
                    dept.source += ', name: ' + otherDept.source
                }
                if (
                    otherDept.colors &&
                    dept.colors.fg === '#000000' &&
                    dept.colors.bg.toLowerCase() === '#ffffff'
                ) {
                    dept.colors = otherDept.colors
                    dept.source += ', colors: ' + otherDept.source
                }
                if (otherDept.departure.realtime) {
                    dept.departure.realtime = otherDept.departure.realtime
                    dept.source += ', realtime: ' + otherDept.source
                }
            } else {
                dept.source += ', nomatch'
            }
            dept.dt = dept.departure.realtime || dept.departure.scheduled
            zvv.departures[i] = dept
        }

        return zvv
    }

    @Get('/api/ch/connections/:from/:to/:datetime/:arrivaldatetime')
    @Header('Cache-Control', 'public, max-age=60')
    @Cache({ ttl: 60 })
    async connectionsWithArrival(
        @Param('from') from: string,
        @Param('to') to: string,
        @Param('datetime') datetime: string,
        @Param('arrivaldatetime') arrivaldatetime: string | null,
    ) {
        const datetimeObj = moment.tz(datetime, 'YYYY-MM-DDTHH:mm', 'Europe/Zurich')
        const datetimeArrivalObj = arrivaldatetime
            ? moment.tz(arrivaldatetime, 'YYYY-MM-DDTHH:mm', 'Europe/Zurich')
            : null

        const datetimeMinus10 = datetimeObj.clone().subtract('10', 'minutes')
        const date = datetimeMinus10.format('YYYY-MM-DD')
        const time = datetimeMinus10.format('HH:mm')
        const url = `${connectionsBaseUrl}&from=${from}&to=${to}&date=${date}&time=${time}`

        const data = await this.helpersService.callApi(url)

        if (data.error) {
            return data
        }
        return this.extractData(data, from, to, datetimeObj, datetimeArrivalObj)
    }

    @Get('/api/ch/connections/:from/:to/:datetime')
    @Header('Cache-Control', 'public, max-age=60')
    @Cache({ ttl: 30 })
    async connections(
        @Param('from') from: string,
        @Param('to') to: string,
        @Param('datetime') datetime: string,
    ) {
        return this.connectionsWithArrival(from, to, datetime, null)
    }

    private extractData(data, from: string, to: string, datetimeObj, datetimeArrivalObj) {
        const result = {
            passlist: data.connections
                .filter(connection => {
                    const firstRealSection = connection.sections.find(section => {
                        return section.journey !== null
                    })
                    if (datetimeArrivalObj) {
                        return (
                            firstRealSection.departure?.departureTimestamp === datetimeObj.unix() &&
                            firstRealSection.arrival?.arrivalTimestamp === datetimeArrivalObj.unix()
                        )
                    }
                    return firstRealSection.departure?.departureTimestamp === datetimeObj.unix()
                })
                .map(connection => {
                    const firstRealSection = connection.sections.find(section => {
                        return section.journey !== null
                    })
                    return firstRealSection.journey.passList.map(pass => {
                        return {
                            name: pass.station.name,
                            id: stripId(pass.station.id),
                            location: {
                                lat: pass.station.coordinate.x,
                                lng: pass.station.coordinate.y,
                            },
                            departure: {
                                scheduled: pass.departure,
                                realtime: pass.prognosis?.departure || null,
                            },
                            arrival: {
                                scheduled: pass.arrival,
                                realtime: pass.prognosis?.arrival || null,
                            },
                        }
                    })
                }),
        }
        // if nothing found with enddate, fallback to without
        if (datetimeArrivalObj && result.passlist.length === 0) {
            return this.extractData(data, from, to, datetimeObj, null)
        }
        return result
    }

    @Get('/api/:api/stationboard/:id/:starttime')
    @Header('Cache-Control', 'public, max-age=59')
    @Cache({ ttl: 59 })
    async stationboardStarttime(
        @Param('id') id: string,
        @Param('starttime') starttime: string,
    ): Promise<DeparturesType | DeparturesError> {
        return this.zvvController.stationboardStarttime(id, starttime)
    }
}
