import { Module } from '@nestjs/common'
import { OstController } from './ost.controller'
import { WmlModule } from '../wml/wml.module'

@Module({
    controllers: [OstController],
    providers: [OstController],
    imports: [WmlModule],
    exports: [OstController],
})
export class OstModule {}
