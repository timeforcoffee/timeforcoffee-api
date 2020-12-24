import { Module } from '@nestjs/common'
import { StationsModule } from './stations/stations.module'
import { DbModule } from './db/db.module'
import { ZvvModule } from './zvv/zvv.module'
import { OpendataModule } from './opendata/opendata.module'

@Module({
    imports: [StationsModule, DbModule, ZvvModule, OpendataModule],
    controllers: [],
    providers: [],
})
export class AppModule {}
