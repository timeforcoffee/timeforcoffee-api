import { Module } from '@nestjs/common'
import { BltController } from './blt.controller'
import { WmlModule } from '../wml/wml.module'

@Module({
    imports: [WmlModule],
    controllers: [BltController],
    exports: [BltController],
    providers: [BltController],
})
export class BltModule {}
