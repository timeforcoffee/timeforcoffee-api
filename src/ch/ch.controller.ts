import { Controller, Get, Param } from '@nestjs/common'
import { ZvvController } from '../zvv/zvv.controller'
import { DbService } from '../db/db.service'
import { DeparturesError, DeparturesType, DepartureType } from './ch.type'
import { OstController } from '../ost/ost.controller'
import { BltController } from '../blt/blt.controller'

@Controller('/api/ch/')
export class ChController {
    constructor(
        private zvvController: ZvvController,
        private ostController: OstController,
        private bltController: BltController,
        private dbService: DbService,
    ) {}
    @Get('stationboard/:id')
    async stationboard(@Param('id') id: string): Promise<DeparturesType | DeparturesError> {
        const api = await this.dbService.getApiKey(id)

        switch (api.apikey) {
            case 'ost':
                return this.combine(id, this.ostController.stationboard(api.apiid))
            case 'blt':
                return this.combine(id, this.bltController.stationboard(api.apiid))
            default:
                return this.zvvController.stationboard(id)
        }
    }

    async combine(
        id: string,
        stationboardPromise: Promise<DeparturesType>,
    ): Promise<DeparturesType | DeparturesError> {
        const responses: (DeparturesType | DeparturesError)[] = await Promise.all([
            this.zvvController.stationboard(id).catch(
                (e): DeparturesError => {
                    return { error: e.message }
                },
            ),
            stationboardPromise.catch(
                (e): DeparturesError => {
                    return { error: e.message }
                },
            ),
        ])

        if ('error' in responses[0] || !(responses[0].departures.length > 0)) {
            return responses[1]
        }
        if ('error' in responses[1] || !(responses[1].departures.length > 0)) {
            return responses[0]
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
                    dept.source += ', name: ' + otherDept.name
                }
                if (
                    otherDept.departure.realtime &&
                    otherDept.departure.realtime !== otherDept.departure.scheduled
                ) {
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
}
