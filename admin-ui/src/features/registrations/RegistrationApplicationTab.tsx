const groups: Array<{ title: string; fields: Array<[string, string]> }> = [
    {
        title: 'Организация',
        fields: [
            ['orgName', 'Наименование'],
            ['innKpp', 'ИНН / КПП'],
            ['ogrn', 'ОГРН'],
            ['urAdress', 'Юридический адрес'],
            ['bankReqs', 'Банковские реквизиты'],
        ],
    },
    {
        title: 'Установка и оборудование',
        fields: [
            ['kktAdress', 'Адрес установки'],
            ['kktName', 'Место установки'],
            ['kktModel', 'Модель ККТ'],
            ['ofd', 'Оператор фискальных данных'],
        ],
    },
    {
        title: 'Контакт',
        fields: [
            ['phone', 'Телефон'],
            ['phoneToCall', 'Телефон для связи'],
            ['email', 'Email'],
        ],
    },
    {
        title: 'Настройки',
        fields: [
            ['taxSystem', 'Система налогообложения'],
            ['nds', 'НДС'],
            ['excise', 'Подакцизные товары'],
            ['markirovka', 'Маркировка'],
            ['services', 'Услуги'],
            ['strictReporting', 'Бланки строгой отчётности'],
        ],
    },
];
export function RegistrationApplicationTab({
    application,
}: {
    application: Record<string, string | null>;
}) {
    return (
        <div className="reg-application">
            {groups.map((group) => (
                <section key={group.title}>
                    <h2>{group.title}</h2>
                    <dl className="reg-facts">
                        {group.fields.map(([key, label]) => (
                            <div key={key}>
                                <dt>{label}</dt>
                                <dd>{application[key] || 'Не указано'}</dd>
                            </div>
                        ))}
                    </dl>
                </section>
            ))}
        </div>
    );
}
