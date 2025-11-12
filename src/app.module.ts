import { Module } from '@nestjs/common';
import { AppUpdate } from './app.update';
import { AppService } from './app.service';
import { TelegrafModule } from 'nestjs-telegraf';
import LocalSession from 'telegraf-session-local';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { regEntity } from './reg.entity';


const sessions = new LocalSession({ database: 'session_db.json' })

@Module({
  imports: [
    TelegrafModule.forRoot({
      middlewares: [sessions.middleware()],
      token: '8364484557:AAHLoYQLKbp-581JlNr23hakNi2f6JFPu88'
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      database: 'db',
      username: 'user',
      password: 'pass',
      entities: [join(__dirname, '**', '*.entity.{ts,js}')],
      migrations: [join(__dirname, '**', '*.migrations.{ts,js}')],
      synchronize: true
    }),
    TypeOrmModule.forFeature([regEntity])
  ],
  providers: [AppService, AppUpdate],
})
export class AppModule { }