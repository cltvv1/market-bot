export const showRegs = (regs) =>
    `Ваши заявки:\n\n${regs
        .map(reg => (reg.isFilled ? 'DA' : 'NET') + ' ' + reg.name + '\n')
        .join('')}`
