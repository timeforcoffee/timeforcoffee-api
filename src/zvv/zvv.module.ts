import { Module } from '@nestjs/common'
import { ZvvController } from './zvv.controller'
import { DbModule } from '../db/db.module'

@Module({
    controllers: [ZvvController],
    imports: [DbModule],
    providers: [ZvvController],
    exports: [ZvvController],
})
export class ZvvModule {}
