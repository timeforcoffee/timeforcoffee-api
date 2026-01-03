import { Controller, Get, Logger, Param } from '@nestjs/common'
import { DeparturesError, DeparturesType } from '../ch/ch.type'
import { WmlService } from '../wml/wml.service'
import { DEFAULT_DEPARTURES_LIMIT, HelpersService } from '../helpers/helpers.service'
import { ZvvController } from '../zvv/zvv.controller'

@Controller('/api/ost/')
export class OstController {
    constructor(private zvvController: ZvvController) {}
    @Get('stationboard/:id')
    async stationboard(
        @Param('id') id: string,
        defaultLimit: number | null = DEFAULT_DEPARTURES_LIMIT,
    ): Promise<DeparturesType | DeparturesError> {
        return this.zvvController.stationboard(id, defaultLimit)
    }
}
