import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
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
import { AdminModule } from './admin/admin.module';
import { ClientModule } from './client/client.module';
import { AssetsModule } from './assets/assets.module';
import { SiteModule } from './site/site.module';
import { CustomerActivityModule } from './customer-activity/customer-activity.module';
import { ServiceRequestsModule } from './service-requests/service-requests.module';
import { WebSessionModule } from './web-session/web-session.module';
import { HealthModule } from './health/health.module';
import { RateLimitGuard } from './security/rate-limit';
import { FilesModule } from './files/files.module';
import { AuditModule } from './audit/audit.module';
import { UiServingModule } from './ui/ui-serving.module';
import { IntegrationsModule } from './integrations/integrations.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const test = config.get<string>('NODE_ENV') === 'test';
        return {
          type: 'postgres',
          host: test ? config.get<string>('TEST_DB_HOST') || config.get<string>('DB_HOST') : config.get<string>('DB_HOST'),
          port: test ? config.get<number>('TEST_DB_PORT') || config.get<number>('DB_PORT') : config.get<number>('DB_PORT'),
          database: test ? config.get<string>('TEST_DB_NAME') : config.get<string>('DB_NAME'),
          username: test ? config.get<string>('TEST_DB_USER') || config.get<string>('DB_USER') : config.get<string>('DB_USER'),
          password: test ? config.get<string>('TEST_DB_PASS') || config.get<string>('DB_PASS') : config.get<string>('DB_PASS'),
          autoLoadEntities: true,
          synchronize: false,
          migrationsRun: false,
        };
      },
    }),
    TelegrafModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const token = config.get<string>('BOT_TOKEN');
        if (!token) {
          throw new Error('BOT_TOKEN is not defined in environment variables');
        }
        const pollingEnabled = config.get<boolean>('BOT_POLLING_ENABLED') ?? true;
        return {
          token,
          launchOptions: pollingEnabled ? undefined : false,
        };
      },
    }),
    RegistrationsModule,
    DatabaseSeedModule,
    TelegramModule,
    MaxModule,
    WebSessionModule,
    AdminModule,
    ClientModule,
    AssetsModule,
    SiteModule,
    CustomerActivityModule,
    ServiceRequestsModule,
    HealthModule,
    UsersModule,
    TicketsModule,
    FilesModule,
    AuditModule,
    UiServingModule, IntegrationsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
  ],
})
export class AppModule { }
