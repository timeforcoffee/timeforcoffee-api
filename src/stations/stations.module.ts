import { Module } from '@nestjs/common'
import { StationsController } from './stations.controller'

@Module({
    controllers: [StationsController],
})
export class StationsModule {}
