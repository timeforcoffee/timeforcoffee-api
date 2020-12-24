import { Test, TestingModule } from '@nestjs/testing';
import { ZvvController } from './zvv.controller';

describe('ZvvController', () => {
  let controller: ZvvController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ZvvController],
    }).compile();

    controller = module.get<ZvvController>(ZvvController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
