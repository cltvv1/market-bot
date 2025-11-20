export const showRegs = (regs) =>
    `Ваши заявки:\n\n${regs
        .map(reg => (reg.isFilled ? 'DA' : 'NET') + ' ' + reg.orgName + '\n')
        .join('')}`

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