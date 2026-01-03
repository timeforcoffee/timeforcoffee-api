import { Module } from '@nestjs/common'
import { OstController } from './ost.controller'
import { ZvvModule } from '../zvv/zvv.module'

@Module({
    controllers: [OstController],
    providers: [OstController],
    imports: [ZvvModule],
    exports: [OstController],
})
export class OstModule {}
