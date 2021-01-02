import { Module } from '@nestjs/common'
import { OpentransportdataController } from './opentransportdata.controller'
import { HelpersModule } from '../helpers/helpers.module'

@Module({
    controllers: [OpentransportdataController],
    imports: [HelpersModule],
})
export class OpentransportdataModule {}
