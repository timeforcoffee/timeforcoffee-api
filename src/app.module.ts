import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { StationsModule } from './stations/stations.module'
import { ZvvController } from './zvv/zvv.controller';

@Module({
    imports: [StationsModule],
    controllers: [AppController, ZvvController],
    providers: [AppService],
})
export class AppModule {}
