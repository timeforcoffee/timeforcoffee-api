import { Module } from '@nestjs/common'
import { OpentransportdataController } from './opentransportdata.controller'
import { HelpersModule } from '../helpers/helpers.module'
import { DbModule } from '../db/db.module'

@Module({
    controllers: [OpentransportdataController],
    imports: [HelpersModule, DbModule],
    exports: [OpentransportdataController],
    providers: [OpentransportdataController],
})
export class OpentransportdataModule {}
