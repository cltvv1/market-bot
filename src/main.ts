import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('VitmaMarket Bot API')
    .setDescription('API для клиентского сайта, админки, организаций, сервисных заявок и ботов.')
    .setVersion('0.1.0')
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-admin-token',
        in: 'header',
        description: 'Токен оператора для /admin/api/*',
      },
      'admin-token',
    )
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument, {
    jsonDocumentUrl: 'api/docs-json',
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
