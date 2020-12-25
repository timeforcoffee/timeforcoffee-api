import { Module } from '@nestjs/common'
import { StationsModule } from './stations/stations.module'
import { DbModule } from './db/db.module'
import { ZvvModule } from './zvv/zvv.module'
import { OpendataModule } from './opendata/opendata.module'
import { ChModule } from './ch/ch.module';
import { OstModule } from './ost/ost.module';
import { WmlModule } from './wml/wml.module';
import { BltModule } from './blt/blt.module';
import { HelpersModule } from './helpers/helpers.module';
import { SearchModule } from './search/search.module';
import { FrontendModule } from './frontend/frontend.module';

@Module({
    imports: [StationsModule, DbModule, ZvvModule, OpendataModule, ChModule, OstModule, WmlModule, BltModule, HelpersModule, SearchModule, FrontendModule],
    controllers: [],
    providers: [],
})
export class AppModule {}
