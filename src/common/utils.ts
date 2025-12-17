export const wantToRegisterMsg = (fields) =>
    `Вот данные, которые вам необходимо будет ввести: \n\n${fields
        .map(field => (`·${field.label}`))
        .join('\n')}\n
Убедитесь, что вы владеете всеми перечисленными данными, перед началом заполнения заявки. \n
Продолжая заполнение заявки на регистрацию вы подтверждаете, что согласны с обработкой персональных данных(ОПД).`

export const showFields = (fields) =>
    `Все поля заявки: \n\n${fields
        .map(field => (`·${field.label} | ${field.step}`))
        .join('\n')}`

export const formatTicket = (ticket) =>
    `Новый тикет #${ticket.id}\n\n` +
    `• Пользователь: ${ticket.username ? `@${ticket.username}` : 'не указан'}\n` +
    `• Имя: ${ticket.name ?? 'не указано'}\n` +
    `• Создан: ${ticket.createdAt.toLocaleDateString()}\n\n` +
    `Текст вопроса:\n\n${ticket.text}`;

export const formatRegistrationRequest = (reg) =>
    `Заявка на регистрацию #${reg.id}\n\n` +
    `• Создана: ${reg.createdAt.toLocaleDateString()}\n\n` +

    `Организация:\n` +
    `• Название: ${reg.orgName ?? 'не указано'}\n` +
    `• ОГРН: ${reg.ogrn ?? 'не указано'}\n` +
    `• ИНН/КПП: ${reg.innKpp ?? 'не указано'}\n` +
    `• Юр. адрес: ${reg.urAdress ?? 'не указано'}\n` +
    `• Адрес установки ККТ: ${reg.kktAdress ?? 'не указано'}\n` +
    `• Модель ККТ: ${reg.kktModel ?? 'не указано'}\n` +
    `• Наименование ККТ: ${reg.kktName ?? 'не указано'}\n\n` +

    `Контакты:\n` +
    `• Телефон: ${reg.phone ?? 'не указано'}\n` +
    `• Телефон для связи: ${reg.phoneToCall ?? 'не указано'}\n` +
    `• Email: ${reg.email ?? 'не указан'}\n\n` +

    `Налогообложение и параметры:\n` +
    `• Система налогообложения: ${reg.taxSystem ?? 'не указано'}\n` +
    `• НДС: ${reg.nds ?? 'не указано'}\n` +
    `• Акциз: ${reg.excise ?? 'не указано'}\n` +
    `• Маркировка: ${reg.markirovka ?? 'не указано'}\n` +
    `• Услуги: ${reg.services ?? 'не указано'}\n` +
    `• БСО (строгая отчётность): ${reg.strictReporting ?? 'не указано'}\n` +
    `• ОФД: ${reg.ofd ?? 'не указан'}\n\n` +

    `Банковские реквизиты:\n` +
    `${reg.bankReqs ?? 'не указаны'}\n\n`

export const formatRegistrationDone = (reg) => `Заявка на регистрацию #${reg.id} от ${reg.orgName ?? 'не указано'} обработана\n\n`
