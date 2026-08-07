import type { ServiceDirection, ServiceRequestRecord } from '../types';

export const serviceDirections: ServiceDirection[] = [
    {
        id: 'fn_replacement',
        title: 'Замена фискального накопителя',
        description: 'Подберём ФН, закроем архив и перерегистрируем кассу.',
        timing: 'от 1 часа',
        icon: 'RefreshCw',
    },
    {
        id: 'firmware_update',
        title: 'Обновление прошивки',
        description: 'Обновим прошивку кассы и проверим её работу.',
        timing: 'срок уточнит оператор',
        icon: 'Settings2',
    },
    {
        id: 'kkt_remote_work',
        title: 'Удалённые работы с ККТ',
        description: 'Настроим или продиагностируем кассу удалённо.',
        timing: 'срок уточнит оператор',
        icon: 'MonitorCog',
    },
];

export const demoRequests: ServiceRequestRecord[] = [
    {
        number: 'SR-240721-1042',
        createdAt: '21.07.2026, 10:42',
        status: 'diagnostics',
        title: 'Онлайн-касса не передаёт чеки в ОФД',
        contactName: 'Анна Петрова',
        history: [
            {
                status: 'accepted',
                title: 'Заявка принята',
                date: '21.07, 10:42',
            },
            {
                status: 'assigned',
                title: 'Назначен специалист',
                date: '21.07, 10:51',
                note: 'Инженер Михаил С.',
            },
            {
                status: 'diagnostics',
                title: 'Проводится диагностика',
                date: '21.07, 11:20',
                note: 'Проверяем настройки ОФД и сетевое подключение',
            },
        ],
    },
    {
        number: 'SR-240718-0871',
        createdAt: '18.07.2026, 09:16',
        status: 'completed',
        title: 'Замена фискального накопителя',
        contactName: 'Игорь Соколов',
        history: [
            {
                status: 'accepted',
                title: 'Заявка принята',
                date: '18.07, 09:16',
            },
            {
                status: 'assigned',
                title: 'Назначен специалист',
                date: '18.07, 09:30',
            },
            {
                status: 'diagnostics',
                title: 'Касса принята в работу',
                date: '18.07, 11:00',
            },
            {
                status: 'completed',
                title: 'Работа выполнена',
                date: '18.07, 13:45',
                note: 'ФН заменён, касса перерегистрирована',
            },
        ],
    },
    {
        number: 'SR-240715-0644',
        createdAt: '15.07.2026, 14:08',
        status: 'waiting',
        title: 'Ремонт принтера этикеток',
        contactName: 'Мария Белова',
        history: [
            {
                status: 'accepted',
                title: 'Заявка принята',
                date: '15.07, 14:08',
            },
            {
                status: 'assigned',
                title: 'Назначен специалист',
                date: '15.07, 14:35',
            },
            {
                status: 'diagnostics',
                title: 'Диагностика завершена',
                date: '16.07, 10:10',
            },
            {
                status: 'waiting',
                title: 'Ожидается запчасть',
                date: '16.07, 10:25',
                note: 'Срок поставки печатающей головки — 3–5 дней',
            },
        ],
    },
];
