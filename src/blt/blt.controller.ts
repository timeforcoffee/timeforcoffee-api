import { Controller, Get, Param } from '@nestjs/common'
import { WmlService } from '../wml/wml.service'
import { DeparturesError, DeparturesType } from '../ch/ch.type'
import { ZvvController } from '../zvv/zvv.controller'
import { DEFAULT_DEPARTURES_LIMIT } from '../helpers/helpers.service'

@Controller('/api/blt/')
export class BltController {
    constructor(private zvvController: ZvvController) {}
    @Get('stationboard/:id')
    async stationboard(
        @Param('id') id: string,
        defaultLimit: number | null = DEFAULT_DEPARTURES_LIMIT,
    ): Promise<DeparturesType | DeparturesError> {
        return this.zvvController.stationboard(id, defaultLimit)
    }
}
