import { Test, TestingModule } from '@nestjs/testing';
import { OpendataController } from './opendata.controller';

describe('OpendataController', () => {
  let controller: OpendataController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OpendataController],
    }).compile();

    controller = module.get<OpendataController>(OpendataController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
