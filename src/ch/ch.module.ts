import { Module } from '@nestjs/common'
import { ChController } from './ch.controller'
import { ZvvModule } from '../zvv/zvv.module'
import { DbModule } from '../db/db.module'
import { OstModule } from '../ost/ost.module'
import { BltModule } from '../blt/blt.module'

@Module({
    controllers: [ChController],
    imports: [ZvvModule, OstModule, BltModule, DbModule],
})
export class ChModule {}
