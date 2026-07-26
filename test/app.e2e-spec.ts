import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getBotToken } from 'nestjs-telegraf';
import request from 'supertest';
import { App } from 'supertest/types';
import { Telegraf } from 'telegraf';
import { AppModule } from './../src/app.module';
import { configureApplication } from './../src/app.bootstrap';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    configureApplication(app);
    await app.init();

    const telegramBot = app.get<Telegraf>(getBotToken());
    jest.spyOn(telegramBot, 'stop').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    await app.close();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Bot is running');
  });
});
