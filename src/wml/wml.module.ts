import { Module } from '@nestjs/common'
import { WmlService } from './wml.service'

@Module({
    providers: [WmlService],
    exports: [WmlService],
})
export class WmlModule {}
