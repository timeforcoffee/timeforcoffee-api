import { Module } from '@nestjs/common'
import { SlackService } from './slack.service'
import { AppConfigModule } from '../config/config.module'

@Module({
    imports: [AppConfigModule],
    providers: [SlackService],
    exports: [SlackService],
})
export class SlackModule {}
