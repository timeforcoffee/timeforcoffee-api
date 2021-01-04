import {
    Injectable,
    Logger,
    MiddlewareConsumer,
    Module,
    NestMiddleware,
    NestModule,
} from '@nestjs/common'
import { StationsModule } from './stations/stations.module'
import { DbModule } from './db/db.module'
import { ZvvModule } from './zvv/zvv.module'
import { OpendataModule } from './opendata/opendata.module'
import { ChModule } from './ch/ch.module'
import { OstModule } from './ost/ost.module'
import { WmlModule } from './wml/wml.module'
import { BltModule } from './blt/blt.module'
import { HelpersModule } from './helpers/helpers.module'
import { SearchModule } from './search/search.module'
import { FrontendModule } from './frontend/frontend.module'
import { Request, Response, NextFunction } from 'express'
import { OpentransportdataModule } from './opentransportdata/opentransportdata.module'
import { SlackModule } from './slack/slack.module'
import { AppConfigModule } from './config/config.module'

@Injectable()
export class AppLoggerMiddleware implements NestMiddleware {
    private logger = new Logger('HTTP')

    use(request: Request, response: Response, next: NextFunction): void {
        const { method, originalUrl: url } = request
        const userAgent = request.get('user-agent') || '-'

        const startTime = +new Date()
        const remoteAddr = request.get('x-real-ip') || '-'
        response.on('close', () => {
            if (!userAgent.includes('kube-probe') && remoteAddr !== '94.130.108.121') {
                const { statusCode } = response
                const curTime = new Date().getTime()
                this.logger.log(
                    `${method} ${url} ${statusCode} ${
                        (curTime - startTime) / 1000
                    } ${remoteAddr} ${userAgent.replace(/CFNetwork.*/, '')}`,
                )
            }
        })

        next()
    }
}

@Module({
    imports: [
        StationsModule,
        DbModule,
        ZvvModule,
        OpendataModule,
        ChModule,
        OstModule,
        WmlModule,
        BltModule,
        HelpersModule,
        SearchModule,
        FrontendModule,
        OpentransportdataModule,
        SlackModule,
        AppConfigModule,
    ],
    controllers: [],
    providers: [],
})
export class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(AppLoggerMiddleware).forRoutes('*')
    }
}
