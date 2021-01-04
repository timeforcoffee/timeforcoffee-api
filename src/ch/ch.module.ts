import { Module } from '@nestjs/common'
import { ChController } from './ch.controller'
import { ZvvModule } from '../zvv/zvv.module'
import { DbModule } from '../db/db.module'
import { OstModule } from '../ost/ost.module'
import { BltModule } from '../blt/blt.module'
import { HelpersModule } from '../helpers/helpers.module'
import { OpendataModule } from '../opendata/opendata.module'
import { SearchModule } from '../search/search.module'
import { OpentransportdataModule } from '../opentransportdata/opentransportdata.module'
import { SlackModule } from '../slack/slack.module'

@Module({
    controllers: [ChController],
    imports: [
        ZvvModule,
        OstModule,
        BltModule,
        OpendataModule,
        SearchModule,
        DbModule,
        HelpersModule,
        OpentransportdataModule,
        SlackModule,
    ],
})
export class ChModule {}
