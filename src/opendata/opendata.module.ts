import { Module } from '@nestjs/common'
import { OpendataController } from './opendata.controller'
import { HelpersModule } from '../helpers/helpers.module'

@Module({
    controllers: [OpendataController],
    imports: [HelpersModule],
})
export class OpendataModule {}
