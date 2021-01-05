import { Module } from '@nestjs/common'
import { HelpersService } from './helpers.service'
import { SlackModule } from '../slack/slack.module'
import { HelpersController } from './helpers.controller';

@Module({
    providers: [HelpersService],
    exports: [HelpersService],
    imports: [SlackModule],
    controllers: [HelpersController],
})
export class HelpersModule {}
