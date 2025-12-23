import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { TelegramModule } from './telegram/telegram.module';
import { RegistrationsModule } from './registrations/registrations.module';
import { UsersModule } from './users/users.module';
import { TicketsModule } from './tickets/tickets.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { validationSchema } from './app.config';
import { TelegrafModule } from 'nestjs-telegraf';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      database: 'db',
      username: 'user',
      password: 'pass',
      autoLoadEntities: true,
      synchronize: true
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema,
    }),
    TelegrafModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const token = config.get<string>('BOT_TOKEN');
        if (!token) {
          throw new Error('BOT_TOKEN is not defined in environment variables');
        }
        return { token };
      },
    }),
    RegistrationsModule,
    TelegramModule,
    UsersModule,
    TicketsModule,
    AiModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }