import { AppService } from './app.service';
import { Action, Ctx, InjectBot, Message, On, Start, Update } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { creditsButtons, menuButtons } from './app.buttons';
import type { Context } from './context.interface';
import { showRegs } from './app.utils';
import { message } from 'telegraf/filters';

const regs = [{
  id: 1,
  chatId: '',
  currentStep: 3,
  orgName: 'ИП 1',
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
  isFilled: true,
  pdfLink: 'https://docs.google.com/open?id=1fkun88i5lpqcg8-buM7DL1Vovsj5yBAL-O77-9Lm5QQ',
  isStopped: false,
  isProcessed: true
}, {
  id: 2,
  chatId: '',
  currentStep: 3,
  orgName: 'ИП 2',
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
  isFilled: true,
  pdfLink: 'https://docs.google.com/open?id=1fkun88i5lpqcg8-buM7DL1Vovsj5yBAL-O77-9Lm5QQ',
  isStopped: false,
  isProcessed: true
}, {
  id: 3,
  chatId: '',
  currentStep: 3,
  orgName: 'ИП 3',
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
  isFilled: false,
  pdfLink: 'https://docs.google.com/open?id=1fkun88i5lpqcg8-buM7DL1Vovsj5yBAL-O77-9Lm5QQ',
  isStopped: false,
  isProcessed: true
}]

const user = [{
  chatId: '401218967',
  talkingTo: '458834668',
  fmDate: '14.10.2025',
  name: 'Данила',
  username: 'cMHEavLMRmrHJKv',
  sendNews: true,
  sendImportant: true
}
]

const ticket = [{
  id: 1,
  chatId: '401218967',
  dateCreated: '25.09.2025',
  username: 'cMHEavLMRmrHJKv',
  ticketText: 'Как у кого дела',
  answerText: 'Все нормально'
}]

const admin = [{
  name: 'Данила',
  chatId: '401218967',
  talkingTo: '458834668',
  isAdmin: true,
  isOperator: true
}]


@Update()
export class AppUpdate {
  constructor(
    @InjectBot() private readonly bot: Telegraf<Context>, private readonly appService: AppService) { }

  @Start()
  async startCommand(ctx: Context) {
    await ctx.reply('Я чат-бот компании ВитмаМаркет, чем могу вам помочь?', menuButtons())

    const regsFromDb = await this.appService.getAll()
    ctx.reply(showRegs(regsFromDb))
  }

  @Action('credits')
  async sendCredits(ctx: Context) {
    await ctx.editMessageText('Наши страницы:', creditsButtons());
  }

  @Action('main_menu')
  async sendMainMenu(ctx: Context) {
    await ctx.editMessageText('Я чат-бот компании ВитмаМаркет, чем могу вам помочь?', menuButtons())
  }

  @Action('registration')
  async doneReg(ctx: Context) {
    ctx.session.type = 'done'
    await ctx.reply('Напишите ID заявки');
  }

  @Action('create_ticket')
  async editReg(ctx: Context) {
    ctx.session.type = 'edit'
    await ctx.reply('Напишите ID заявки и новое название организации через пробел');
  }

  @Action('faq_root')
  // async removeReg(ctx: Context) {
  //   ctx.session.type = 'remove'
  //   await ctx.reply('Напишите ID заявки');
  // }
  async createReg(ctx: Context) {
    ctx.session.type = 'create'
    await ctx.reply('Напишите название организации');
  }

  @On('text')
  async getMessage(@Message('text') msgText: string, @Ctx() ctx: Context) {
    if (!ctx.session.type) return

    if (ctx.session.type === 'done') {
      const reg = regs.find(r => r.id === Number(msgText))
      const response = await this.appService.doneReg(Number(msgText))

      if (!reg) {
        ctx.reply('Нет такой регистрации')
        return
      }

      reg.isFilled = !reg.isFilled
      await ctx.reply(showRegs(regs))
    }

    if (ctx.session.type === 'edit') {

      const [regId, orgName] = msgText.split(' ')
      const reg = regs.find(r => r.id === Number(regId))

      if (!reg) {
        ctx.reply('Нет такой регистрации')
        return
      }

      reg.orgName = orgName
      ctx.reply(showRegs(regs))
    }

    if (ctx.session.type === 'remove') {
      const reg = regs.find(r => r.id === Number(msgText))

      if (!reg) {
        ctx.reply('Нет такой регистрации')
        return
      }

      await ctx.reply(showRegs(regs.filter(r => r.id !== Number(msgText))))
    }

    if (ctx.session.type === 'create') {
      const regs1 = await this.appService.createReg(msgText)
      await ctx.reply(showRegs(regs1))
    }
  }
}