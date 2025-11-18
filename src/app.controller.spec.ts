import { Test, TestingModule } from '@nestjs/testing';
import { AppUpdate } from './app.update';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppUpdate;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppUpdate],
      providers: [AppService],
    }).compile();
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
    });
  });
});
