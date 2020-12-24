import { Controller, Get, Param } from '@nestjs/common'
import { ZvvController } from '../zvv/zvv.controller'
import { DbService } from '../db/db.service'
import { DeparturesError, DeparturesType } from './ch.type'
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
        console.log(api)
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
        return responses[1]
    }
}
