import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getBotToken } from 'nestjs-telegraf';
import request, { Response } from 'supertest';
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

    it('serves React entries and nested SPA routes', async () => {
        for (const path of [
            '/site',
            '/site/service/request',
            '/admin',
            '/admin/registrations/42',
        ]) {
            const response = await request(app.getHttpServer())
                .get(path)
                .expect(200);
            expect(response.headers['content-type']).toMatch(/^text\/html/);
            expect(response.text).toContain('<div id="root"></div>');
        }
    });

    it('does not use SPA fallback for API, health, or file routes', async () => {
        const responses: Response[] = [];
        for (const path of [
            '/api/client/service-requests/types',
            '/admin/api/me',
            '/admin/api/ticket-messages/1/file',
            '/health/live',
            '/health/ready',
        ]) {
            responses.push(await request(app.getHttpServer()).get(path));
        }

        expect(responses.map((response) => response.status)).toEqual([
            401, 401, 401, 200, 200,
        ]);
        for (const response of responses) {
            expect(response.headers['content-type']).not.toMatch(/^text\/html/);
        }
    });

    it('returns an API 404 instead of React HTML for unknown admin API paths', async () => {
        const response = await request(app.getHttpServer())
            .get('/admin/api/not-a-route')
            .expect(404);

        expect(response.headers['content-type']).not.toMatch(/^text\/html/);
    });
});
