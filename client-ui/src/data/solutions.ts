export interface BusinessSolution {
    id: string;
    title: string;
    audience: string;
    description: string;
    results: string[];
    categoryId: string;
    serviceType: string;
    icon: 'store' | 'cafe' | 'warehouse' | 'services';
}

export const businessSolutions: BusinessSolution[] = [
    {
        id: 'retail',
        title: 'Розничный магазин',
        audience: 'Для магазина у дома, бутика и торговой сети',
        description:
            'Касса, сканер, эквайринг и товароучётная система в едином рабочем контуре.',
        results: [
            'готовое рабочее место кассира',
            'учёт остатков и продаж',
            'поддержка маркировки',
        ],
        categoryId: 'kits',
        serviceType: 'integration',
        icon: 'store',
    },
    {
        id: 'cafe',
        title: 'Кафе и общепит',
        audience: 'Для кафе, бара, столовой и точки быстрого питания',
        description:
            'Фронт кассира, печать заказов, эквайринг и связка с учётной программой.',
        results: [
            'быстрое обслуживание гостей',
            'печать чеков на кухне',
            'контроль выручки и смен',
        ],
        categoryId: 'pos',
        serviceType: 'software',
        icon: 'cafe',
    },
    {
        id: 'marketplace',
        title: 'Склад и маркировка',
        audience: 'Для склада, оптовой торговли и продавцов маркетплейсов',
        description:
            'Сбор данных, печать этикеток и проверка кодов без ручного переноса информации.',
        results: [
            'приёмка и инвентаризация',
            'печать штрихкодов',
            'работа с Честным ЗНАКом',
        ],
        categoryId: 'terminals',
        serviceType: 'integration',
        icon: 'warehouse',
    },
    {
        id: 'services',
        title: 'Услуги и небольшая точка',
        audience: 'Для салона, мастерской, офиса и выездной торговли',
        description:
            'Компактная касса с понятным запуском и без лишнего оборудования.',
        results: [
            'касса под требования 54-ФЗ',
            'подключение ОФД',
            'регистрация и обучение',
        ],
        categoryId: 'online-cash',
        serviceType: 'registration',
        icon: 'services',
    },
];

export const servicePackages = [
    {
        id: 'one-time',
        title: 'Разовая помощь',
        label: 'Для конкретной проблемы',
        description:
            'Диагностика и решение одной задачи без обязательного договора на сопровождение.',
        features: [
            'удалённо, на выезде или в сервисе',
            'стоимость согласуем до работ',
            'история обращения сохраняется',
        ],
    },
    {
        id: 'support',
        title: 'Сопровождение',
        label: 'Для работающей организации',
        description:
            'Регулярная поддержка кассового контура и контроль критичных сроков.',
        features: [
            'единая карточка организации',
            'плановые проверки оборудования',
            'напоминания о сроках ФН и ОФД',
        ],
    },
    {
        id: 'launch',
        title: 'Запуск под ключ',
        label: 'Для новой торговой точки',
        description:
            'Подбор, поставка, регистрация и настройка оборудования одной командой.',
        features: [
            'комплектация под формат бизнеса',
            'регистрация кассы и подключение ОФД',
            'обучение и поддержка после запуска',
        ],
    },
] as const;
