import type { ServiceDirection } from '../types';

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
