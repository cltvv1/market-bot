import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApplication } from './app.bootstrap';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  configureApplication(app);

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
