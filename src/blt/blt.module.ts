import { Module } from '@nestjs/common'
import { BltController } from './blt.controller'
import { WmlModule } from '../wml/wml.module'
import { ZvvModule } from '../zvv/zvv.module'

@Module({
    imports: [ZvvModule],
    controllers: [BltController],
    exports: [BltController],
    providers: [BltController],
})
export class BltModule {}
