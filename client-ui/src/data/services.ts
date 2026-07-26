import type { ServiceDirection, ServiceRequestRecord } from '../types';

export const serviceDirections: ServiceDirection[] = [
    {
        id: 'cash-service',
        title: 'Обслуживание онлайн-кассы',
        description: 'Диагностика, настройка и восстановление работы ККТ.',
        timing: 'от 30 минут',
        icon: 'ReceiptText',
    },
    {
        id: 'software',
        title: 'Кассовое программное обеспечение',
        description: 'Настройка Frontol, 1С, драйверов и обмена данными.',
        timing: 'от 1 часа',
        icon: 'Settings2',
    },
    {
        id: 'registration',
        title: 'Регистрация и перерегистрация',
        description: 'Подготовим документы и проведём регистрацию в ФНС.',
        timing: '1–2 рабочих дня',
        icon: 'FileCheck2',
    },
    {
        id: 'fn',
        title: 'Замена фискального накопителя',
        description: 'Подберём ФН, закроем архив и перерегистрируем кассу.',
        timing: 'от 1 часа',
        icon: 'RefreshCw',
    },
    {
        id: 'ofd',
        title: 'Подключение ОФД',
        description: 'Активируем договор ОФД и проверим передачу чеков.',
        timing: 'от 30 минут',
        icon: 'CloudCog',
    },
    {
        id: 'integration',
        title: 'Интеграция с учётной системой',
        description: 'Свяжем кассу с 1С, МойСклад или другим решением.',
        timing: 'от 2 часов',
        icon: 'Workflow',
    },
    {
        id: 'repair',
        title: 'Ремонт оборудования',
        description: 'Диагностика и компонентный ремонт касс и периферии.',
        timing: 'от 1 рабочего дня',
        icon: 'Wrench',
    },
    {
        id: 'remote',
        title: 'Удалённая поддержка',
        description: 'Специалист подключится и решит проблему дистанционно.',
        timing: 'в течение 30 минут',
        icon: 'MonitorCog',
    },
    {
        id: 'visit',
        title: 'Выезд специалиста',
        description: 'Приедем в торговую точку по Красноярску и краю.',
        timing: 'от 2 часов',
        icon: 'MapPin',
    },
    {
        id: 'consultation',
        title: 'Консультация',
        description: 'Поможем выбрать оборудование и схему автоматизации.',
        timing: 'бесплатно',
        icon: 'MessagesSquare',
    },
    {
        id: 'other',
        title: 'Другая проблема',
        description: 'Опишите ситуацию — определим специалиста и план работ.',
        timing: 'ответим за 15 минут',
        icon: 'CircleHelp',
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
