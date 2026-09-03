import {
    BriefcaseBusiness,
    ClipboardList,
    FileText,
    MessageSquare,
    ShoppingBag,
    Building2,
    Package,
    KeyRound,
    BookOpen,
    Layers,
    Activity,
    RefreshCw,
    Settings,
    Users,
    Bell,
    ScrollText,
} from 'lucide-react';

export const navigation = [
    {
        title: 'Работа',
        items: [
            {
                label: 'Моя работа',
                icon: BriefcaseBusiness,
                permissions: [
                    'serviceRequests.read.all',
                    'serviceRequests.read.assigned',
                    'registrations.read',
                    'registrations.read.assigned',
                    'tickets.read',
                    'orders.read.all',
                ],
                target: '/admin/work',
            },
        ],
    },
    {
        title: 'Обращения',
        items: [
            {
                label: 'Сервисные заявки',
                icon: ClipboardList,
                permissions: [
                    'serviceRequests.read.all',
                    'serviceRequests.read.assigned',
                ],
                target: '/admin/requests/service',
                reference: '/service-requests',
            },
            {
                label: 'Регистрации ККТ',
                icon: FileText,
                permissions: [
                    'registrations.read',
                    'registrations.read.assigned',
                ],
                target: '/admin/requests/registrations',
            },
            {
                label: 'Вопросы и переписка',
                icon: MessageSquare,
                permissions: ['tickets.read'],
                target: '/admin/requests/tickets',
            },
        ],
    },
    {
        title: 'Продажи',
        items: [
            {
                label: 'Заказы',
                icon: ShoppingBag,
                permissions: ['orders.read.all'],
                target: '/admin/sales/orders',
            },
        ],
    },
    {
        title: 'Клиенты',
        items: [
            {
                label: 'Организации',
                icon: Building2,
                permissions: ['organizations.read'],
                target: '/admin/customers/organizations',
            },
            {
                label: 'Оборудование',
                icon: Package,
                permissions: ['assets.read'],
                target: '/admin/customers/equipment',
            },
            {
                label: 'Доступ представителей',
                icon: KeyRound,
                permissions: ['organizationAccess.read'],
                target: '/admin/customers/access',
            },
        ],
    },
    {
        title: 'Каталог и материалы',
        items: [
            {
                label: 'Товары и категории',
                icon: Layers,
                permissions: ['catalog.read'],
                target: '/admin/catalog/products',
            },
            {
                label: 'Поддержка',
                icon: Settings,
                permissions: ['support.read'],
                target: '/admin/catalog/support',
            },
            {
                label: 'База знаний',
                icon: BookOpen,
                permissions: ['knowledge.read'],
                target: '/admin/catalog/knowledge',
            },
        ],
    },
    {
        title: 'Интеграции',
        items: [
            {
                label: 'Сигналы',
                icon: Activity,
                permissions: ['opportunities.read'],
                target: '/admin/integrations/signals',
            },
            {
                label: 'Синхронизации',
                icon: RefreshCw,
                permissions: ['integrations.read'],
                target: '/admin/integrations/runs',
            },
        ],
    },
    {
        title: 'Настройки',
        items: [
            {
                label: 'Сотрудники',
                icon: Users,
                permissions: ['staff.roles.manage'],
                target: '/admin/settings/staff',
            },
            {
                label: 'Уведомления',
                icon: Bell,
                permissions: [],
                target: '/admin/settings/notifications',
            },
            {
                label: 'Журнал действий',
                icon: ScrollText,
                permissions: ['audit.read'],
                target: '/admin/settings/audit',
            },
        ],
    },
];

export function visibleNavigation(permissions: string[]) {
    return navigation
        .map((group) => ({
            ...group,
            items: group.items.filter(
                (item) =>
                    !item.permissions.length ||
                    item.permissions.some((permission) =>
                        permissions.includes(permission),
                    ),
            ),
        }))
        .filter((group) => group.items.length);
}
