import { Module } from '@nestjs/common'
import { ZvvController } from './zvv.controller'
import { DbModule } from '../db/db.module'
import { HelpersModule } from '../helpers/helpers.module'

@Module({
    controllers: [ZvvController],
    imports: [DbModule, HelpersModule],
    providers: [ZvvController],
    exports: [ZvvController],
})
export class ZvvModule {}
