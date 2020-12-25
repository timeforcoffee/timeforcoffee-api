import { Controller, Get, Logger, Param } from '@nestjs/common'
import { DeparturesType } from '../ch/ch.type'
import { WmlService } from '../wml/wml.service'
import { HelpersService } from '../helpers/helpers.service'

@Controller('/api/ost/')
export class OstController {
    constructor(private wmlService: WmlService) {}
    @Get('stationboard/:id')
    async stationboard(@Param('id') id: string): Promise<DeparturesType> {
        const url = 'http://data.wemlin.com/rest/v0/networks/ostwind/stations/DI-0000'
        return this.wmlService.stationboard(id, url)
    }
}
