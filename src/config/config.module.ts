import { Module } from '@nestjs/common'
import { AppConfigService } from './config.service'
import { ConfigModule } from '@nestjs/config'

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
        }),
    ],
    providers: [AppConfigService],
    exports: [AppConfigService],
})
export class AppConfigModule {}
