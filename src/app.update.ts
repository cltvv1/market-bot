import { AppService } from './app.service';
import { Action, InjectBot, Start, Update } from 'nestjs-telegraf';
import { Context, Telegraf } from 'telegraf';
import { creditsButtons, menuButtons } from './app.buttons';

const reg = [{
  id: 1,
  chatId: '',
  currentStep: 3,
  orgName: 'ИП Монтьев Ива',
  ogrn: '323385000075952',
  innKpp: '381914650612',
  urAdress: 'Иркутская область, Усольский район РП Тельма ул Фабричная д4 кв4',
  kktAdress: 'Город усолье-сибирское ул, Менделеева 75 Индекс 665462',
  kktName: 'Хозяин, нам сюда.',
  phone: '+79500689533',
  email: 'imontev@mail.ru',
  nds: 'Нет',
  excise: 'Нет',
  markirovka: 'Нет',
  services: 'Нет',
  strictReporting: 'Нет',
  taxSystem: 'Патент',
  kktModel: 'АТОЛ 1Ф',
  bankReqs: `Расчётный счёт: 
    40802810020000570590 
    Название банка:
    ООО ""Банк Точка"" 
    БИК: 
    044525104 
    Корреспондентский счёт:
    30101810745374525104`,
  ofd: 'Платформа ОФД',
  isDone: true,
  pdfLink: 'https://docs.google.com/open?id=1fkun88i5lpqcg8-buM7DL1Vovsj5yBAL-O77-9Lm5QQ',
}]


@Update()
export class AppUpdate {
  constructor(
    @InjectBot() private readonly bot: Telegraf<Context>, private readonly appService: AppService) { }
  @Start()
  async startCommand(ctx: Context) {
    await ctx.reply('Я чат-бот компании ВитмаМаркет, чем могу вам помочь?', menuButtons())
  }

  @Action('credits')
  async sendCredints(ctx: Context) {
    await ctx.sendMessage('Наши страницы:', creditsButtons());
  }
}