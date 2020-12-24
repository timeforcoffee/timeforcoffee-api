import { Controller, Get, Param } from '@nestjs/common'
import { WmlService } from '../wml/wml.service'
import { DeparturesType } from '../ch/ch.type'

@Controller('/api/blt/')
export class BltController {
    constructor(private wmlService: WmlService) {}
    @Get('stationboard/:id')
    async stationboard(@Param('id') id: string): Promise<DeparturesType> {
        const url = 'http://data.wemlin.com/rest/v0/networks/blt/stations/DI-0000'
        return this.wmlService.stationboard(id, url)
    }
}
