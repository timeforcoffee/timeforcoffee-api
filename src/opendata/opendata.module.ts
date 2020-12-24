import { Module } from '@nestjs/common';
import { OpendataController } from './opendata.controller';

@Module({
  controllers: [OpendataController]
})
export class OpendataModule {}
