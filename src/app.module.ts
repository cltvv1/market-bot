import { Module } from '@nestjs/common';
import { AppUpdate } from './app.update';
import { AppService } from './app.service';
import { TelegrafModule } from 'nestjs-telegraf';
import LocalSession from 'telegraf-session-local';


const sessions = new LocalSession({ database: 'session_db.json' })

@Module({
  imports: [
    TelegrafModule.forRoot({
      middlewares: [sessions.middleware()],
      token: '8364484557:AAHLoYQLKbp-581JlNr23hakNi2f6JFPu88'
    })
  ],
  providers: [AppService, AppUpdate],
})
export class AppModule { }