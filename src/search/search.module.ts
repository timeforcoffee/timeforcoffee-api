import { Module } from '@nestjs/common'
import { SearchController } from './search.controller'
import { HelpersModule } from '../helpers/helpers.module'

@Module({
    controllers: [SearchController],
    imports: [HelpersModule],
    providers: [SearchController],
    exports: [SearchController],
})
export class SearchModule {}
