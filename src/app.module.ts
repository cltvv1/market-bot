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
import { MaxModule } from './max/max.module';
import { DatabaseSeedModule } from './database/database-seed.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        database: config.get<string>('DB_NAME'),
        username: config.get<string>('DB_USER'),
        password: config.get<string>('DB_PASS'),
        autoLoadEntities: true,
        synchronize: true,
      }),
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
    DatabaseSeedModule,
    TelegramModule,
    MaxModule,
    UsersModule,
    TicketsModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
