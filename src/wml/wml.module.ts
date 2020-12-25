import { Module } from '@nestjs/common'
import { WmlService } from './wml.service'
import { HelpersModule } from '../helpers/helpers.module'

@Module({
    providers: [WmlService],
    exports: [WmlService],
    imports: [HelpersModule],
})
export class WmlModule {}
