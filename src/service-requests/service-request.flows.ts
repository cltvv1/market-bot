import type { ServiceTypeFlow } from './entities/service-type.entity';

export interface ServiceRequestStep {
    key: string;
    label: string;
    type: 'text' | 'select';
    options?: Array<{ value: string; label: string }>;
}

export const serviceRequestFlows: Record<ServiceTypeFlow, ServiceRequestStep[]> = {
    simple: [
        { key: 'problemDescription', label: 'Кратко опишите, что нужно сделать', type: 'text' },
        { key: 'contactForCall', label: 'Укажите телефон для связи', type: 'text' },
    ],
    fn_replacement: [
        { key: 'inn', label: 'Укажите ИНН организации', type: 'text' },
        { key: 'cashRegisterIdentity', label: 'Пришлите заводской номер кассы или описание фото шильдика', type: 'text' },
        {
            key: 'fiscalDriveTerm',
            label: 'На какой срок нужен фискальный накопитель?',
            type: 'select',
            options: [
                { value: '15', label: '15 месяцев' },
                { value: '36', label: '36 месяцев' },
            ],
        },
        { key: 'contactForCall', label: 'Укажите телефон для связи', type: 'text' },
    ],
};

export const defaultServiceTypes = [
    {
        code: 'fn_replacement',
        title: 'Замена фискального накопителя',
        description: 'Сбор данных по кассе, расчет стоимости, счет и контроль оплаты.',
        flow: 'fn_replacement' as const,
        settings: {
            prices: {
                '15': 15900,
                '36': 22900,
            },
        },
    },
    {
        code: 'kkt_remote_work',
        title: 'Удаленные работы с ККТ',
        description: 'Разовая заявка на удаленную настройку или диагностику кассы.',
        flow: 'simple' as const,
        settings: null,
    },
    {
        code: 'firmware_update',
        title: 'Обновление прошивки',
        description: 'Заявка на обновление прошивки кассового оборудования.',
        flow: 'simple' as const,
        settings: null,
    },
];
