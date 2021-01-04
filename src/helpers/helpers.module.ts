import { Module } from '@nestjs/common'
import { HelpersService } from './helpers.service'
import { SlackModule } from '../slack/slack.module'

@Module({
    providers: [HelpersService],
    exports: [HelpersService],
    imports: [SlackModule],
})
export class HelpersModule {}
