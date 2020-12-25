import { Module } from '@nestjs/common'
import { StationsController } from './stations.controller'
import { HelpersModule } from '../helpers/helpers.module'

@Module({
    imports: [HelpersModule],
    controllers: [StationsController],
})
export class StationsModule {}
