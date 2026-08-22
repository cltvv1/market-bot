# Аудит клиентского сайта

## Методика

Проверены код `client-ui`, production build, локальный NestJS с пустой test DB и пять viewport: 1440x900, 1280x800, 1024x768, 390x844, 360x800. Все backend-запросы выполнялись только к `vitma_reassessment_test`; screenshots содержат статический demo-каталог и не содержат клиентских данных.

## Карта страниц

| Route | Цель / основной CTA | Источник | Зрелость | Решение для итогового продукта |
|---|---|---|---|---|
| `/site/` | объяснить предложение; каталог или сервис | frontend arrays | Визуально развит, продуктово смешан | Сохранить назначение, пересобрать иерархию |
| `/site/search` | найти товар/услугу | локальные arrays | Работает только по demo content | Сохранить только вместе с реальным каталогом |
| `/site/solutions` | подобрать комплект по типу бизнеса | локальные solutions | Маркетинговая витрина | Сжать до проверенных решений/кейсов |
| `/site/catalog` | выбор оборудования | 24 hardcoded products | MOCK | Нужен; до Product API честно назвать каталогом-заявкой |
| `/site/catalog/:slug` | изучить/добавить товар | hardcoded product | MOCK | Нужен, но только с реальными фото/данными |
| `/site/cart` | собрать список | localStorage | LOCAL_ONLY | Нужен только при выбранной модели магазина |
| `/site/checkout` | оформить заказ | localStorage | LOCAL_ONLY | Нельзя публиковать как «заказ принят» без backend |
| `/site/service` | выбрать помощь | frontend content | Достаточно цельный | Нужен как самостоятельный верхнеуровневый путь |
| `/site/service/request` | создать заявку | реальный shared API | WORKING/PARTIAL | Сохранить логику, переработать mapping/schema/attachments |
| `/site/service/status` | статус своей заявки | current web-session list | PARTIAL | Нужен, но с events/assignee/comments и ясной identity model |
| `/site/cash-registration` | отправить анкету | реальный API | WORKING/PARTIAL | Нужен; добавить согласованный photo step |
| `/site/about` | доверие к компании | static copy | Требует фактов | Сохранить после редакторской проверки |
| `/site/delivery` | условия покупки | static copy | MOCK business content | Нужен при каталоге/заказе |
| `/site/warranty` | ожидания после покупки | static copy | MOCK business content | Нужен после юридической проверки |
| `/site/contacts` | связь/адрес/реквизиты | demo company config | MOCK | Обязателен, заменить все значения и карту |
| `/site/privacy` | правовая информация | demo text | MOCK | Обязателен, заменить утверждённым документом |
| `*` | восстановление из неверного URL | local component | WORKING | Сохранить; добавить H1 и page title |

Отдельных route категории, success и статуса заказа нет. Категория задаётся query на `/catalog`; checkout success живёт во внутреннем state и исчезает после reload.

## Продуктовая логика

### Что посетитель понимает

**Подтверждено browser:** первый экран ясно сообщает о кассовой технике и сервисе, показывает Красноярск, телефон и два основных действия. Связь магазина и ЦТО считывается.

**Проблемы:**

1. Каталог выглядит коммерчески готовым: цены, наличие, скидки, cart и checkout. Фактически все эти данные демонстрационные, а «принятый заказ» не видит ни backend, ни администратор.
2. Главная одинаково продвигает магазин, сервис и автоматизацию, затем повторяет эти направления секциями и CTA. Для нового посетителя нет единственного приоритетного действия.
3. «Ответ сервиса от 15 минут», наличие, гарантийные и delivery promises не связаны с утверждёнными правилами или server state. Это требует бизнес-подтверждения.
4. Сайт обещает единый post-sale опыт, но клиент не видит чат, документы, организации, кассы, ФН/ОФД или полную историю.
5. Callback создаёт обычный TicketMessage с составной строкой. Оператор получает обращение, но отдельного callback SLA/status нет.

### Тупики и ложные ожидания

- Checkout очищает корзину после записи только в localStorage (`services/client.ts`, `CheckoutPage.tsx`). Это самый опасный ложноположительный success.
- Страница service status обещает назначенного специалиста и комментарии, но mapper возвращает только один синтетический event и имя `Клиент сайта`.
- Web-регистрация сообщает о комплектности, но не предлагает загрузить photo, которое bot-flow требует перед завершением.
- Service form собирает organization/email/city/address/equipment/urgency/help format, но simple-flow получает одну объединённую строку; FN-flow теряет большинство этих полей.
- Контакты и privacy прямо помечены demo, но остальные информационные обещания визуально выглядят production-ready.

## Визуальный аудит

### Сильные стороны

- Иерархия первого экрана понятна, логотип и реальные предметные фото service/hero создают отраслевой контекст.
- Компоненты имеют единые базовые состояния, 4–7 px radii и умеренные тени; это лучше соответствует B2B, чем «пузырьковый» SaaS.
- Header, каталог, формы и footer не дали horizontal overflow на проверенных viewport.
- Карточки каталога хорошо сканируются на mobile, touch actions достаточно крупные.
- Есть skip-link, landmarks, labels, aria labels, visible focus rule, reduced-motion и полезные empty/loading states.

### Почему сайт всё ещё выглядит нецельно

1. **Конфликт бренда и темы.** В начале `styles.css` задан зелёный VITMA, затем `:root` переопределён зелёным ещё раз, а `html:root` превращает основной accent в серо-бежевый `#80766d`. Итоговый интерфейс почти монохромный и слабо связан с зелёным операционным образом компании.
2. **Слои редизайна вместо системы.** Один файл на 4369 строк содержит несколько повторных media blocks и поздние overrides с повышенной специфичностью (`body ...`, `html:root`). Непонятно, какой слой является каноническим.
3. **Слишком большой масштаб.** Desktop H1 достигает 70 px, mobile 41 px; каталожный контент начинается далеко ниже fold. На 390x844 hero вместе с header занимает первый экран целиком, следующая секция не видна.
4. **Недостаток реального объекта.** ProductVisual рисует абстрактное устройство с иконкой, брендом и SKU. Для оборудования, которое покупатель сравнивает по корпусу/портам/размеру, это не выполняет роль фото.
5. **Повторяемая маркетинговая композиция.** Eyebrow + большой H1 + длинная секция + grid cards + CTA используется на многих страницах. Для ЦТО важнее быстрый доступ к модели, неисправности, телефону, документу и статусу.

Это не делает отдельные приёмы плохими сами по себе. Проблема в том, что они придают демонстрационной витрине уверенность готового интернет-магазина и вытесняют конкретную сервисную информацию.

### Типографика, сетка и цвет

- `Segoe UI Variable Text`/`Segoe UI` хорошо читается, но не создаёт отличимого характера бренда.
- Шкала заголовков слишком экспрессивна относительно плотности B2B-каталога; служебный текст местами слишком мелкий (9–12 px).
- Контейнер 1320 px и карточная сетка стабильны; вертикальный ритм избыточен, особенно headings/hero/sections.
- Warm-neutral overrides ухудшают различимость primary action, stock/status и service context. Нужна палитра с нейтральной основой, фирменным зелёным и отдельными семантическими warning/error/success цветами.
- Фотография hero связана с предметом, но монохромный blend снижает информативность. Product imagery должна быть фактической, а не декоративной.

## Responsive evidence

| Viewport | Наблюдение |
|---|---|
| 1440x900 | Полный двухуровневый header; hero H1 доминирует; 5 видимых CTA/action включая floating callback |
| 1280x800 | Header ещё desktop; hero высотой ~737 px; товары каталога начинаются ниже первого viewport |
| 1024x768 | Mobile menu уже включено; сетка без overflow; длинные страницы становятся заметно выше |
| 390x844 | Header/hero стабильны, но hero ~791 px плюс header; fixed callback закрывает часть нижнего контента |
| 360x800 | Hero ~858 px; service form читаема, но первый step требует значительного scroll |

Screenshots:

- [Главная 1440x900](assets/home-1440x900.png)
- [Главная 390x844](assets/home-390x844.png)
- [Каталог 1280x800](assets/catalog-1280x800.png)
- [Карточки каталога 390x844](assets/catalog-products-390x844.png)
- [Товар 1280x800](assets/product-1280x800.png)
- [Корзина 1024x768](assets/cart-1024x768.png)
- [Checkout 390x844](assets/checkout-390x844.png)
- [Service request 1280x800](assets/service-request-1280x800.png)
- [Service request 360x800](assets/service-request-360x800.png)
- [Регистрация 1280x800](assets/cash-registration-1280x800.png)
- [Mobile menu](assets/mobile-menu-390x844.png)
- [Callback modal](assets/callback-modal-390x844.png)

## Доступность и interaction quality

### Подтверждённые достоинства

- Семантические `header/nav/main/footer`, breadcrumbs, labels и aria labels присутствуют.
- Product placeholders имеют осмысленный `role=img` и явно называют себя demonstration image.
- Global `:focus-visible`, reduced motion, error/loading/status roles реализованы.
- Клавиатурный Escape закрывает `Modal`; формы сохраняют введённый React state при API error.

### Finding

| Риск | Наблюдение | Влияние | Когда исправлять |
|---|---|---|---|
| High | `Modal` не переводит фокус внутрь, не запирает Tab и не возвращает фокус; browser focus остался на «Заказать звонок» | Screen reader/keyboard пользователь взаимодействует с фоном | До визуальной переработки базовых компонентов |
| Medium | `Drawer` не обрабатывает Escape/focus; mobile menu aria-label остаётся «Открыть меню» в открытом состоянии | Неясное состояние и трудное закрытие | Вместе с новым shell |
| Medium | Ошибки ServiceRequest появляются, но фокус остаётся на нижней кнопке и scrollY около неё | Пользователь не видит первую ошибку длинной формы | До переноса/редизайна формы |
| Medium | Field `id` часто отсутствует, если компоненту не передан `name`; label оборачивает input, поэтому клик работает, но explicit association слабая | Непоследовательная семантика/testability | При стабилизации UI primitives |
| Low | 404 использует H2 как главный заголовок и общий title | Слабее ориентация | После нового page template |
| Low | Body scroll не блокируется под modal/menu | Background может двигаться на touch | Вместе с overlay primitives |

Контраст не измерялся отдельным автоматическим tooling; визуально muted text на warm background местами близок к нижней границе. Требуется инструментальная WCAG-проверка в следующем design implementation, не догадка в этом аудите.

## Техническая frontend-архитектура

### Что пригодно для сохранения

- `BrowserRouter` с понятным `/site` basename и стабильными routes.
- `WebSessionBoundary` и credentialed fetch model.
- Типизированные Product/Service/Registration формы как переходные contracts.
- `CartContext` как UI-state прототип, но не как order source of truth.
- Небольшие `Button/Input/Select/Textarea/Loader/EmptyState` после accessibility cleanup.
- Registration и ServiceRequest page logic, если отделить domain adapter от presentation.

### Проблемы

| Файл/область | Наблюдение | Риск | Действие |
|---|---|---|---|
| `styles.css` | 4369 строк, три token слоя, повторные breakpoints/overrides | Любая правка даёт неожиданный cascade | Заменить design system и page styles в варианте B |
| `App.tsx` | все страницы eager-imported | Один bundle 357.92 kB / 111.10 gzip | Route lazy-loading после определения shell; не блокирует дизайн |
| `services/client.ts` | orders, callback, service, registration в одном файле; real/mock branch | Mock легко принять за production | Разделить по domain и запретить mock production build |
| `ServiceRequestPage.tsx` | 686 строк, UI + mapping + validation + draft | Трудно менять форму без regressions | Выделить schema/adapter и step components, сохранив API behavior |
| Static data | catalog/company/solutions/services hardcoded | Content deployment требует code release | Product/Company content source определить до redesign |
| Error handling | callback/service/status обработаны неодинаково; status search без catch | Network rejection может оставить слабую обратную связь | Единый async state/error contract |
| Session boundary | API outage блокирует даже статический catalog/about | Витрина полностью белеет/показывает session error | Решить, нужны ли session только интерактивным routes |
| Page titles | вручную в `Layout`, 404 остаётся default | Ручная карта расходится с router | Route metadata |
| Component overlays | нет focus trap/restore/scroll lock | Accessibility | Заменить primitives, не весь React stack |

### Нужен ли полный rewrite

Нет. Data/API foundation компактна, router нормален, а реальные формы уже используют server ownership и DTO. Controlled rewrite всего client-ui потеряет работающие детали phone masks, validation, web session, registration field loading и service workflow без необходимости.

Оптимален новый visual shell рядом с постепенным переносом страниц внутри того же React application. Старую и новую версии не нужно держать как два приложения; достаточно page-by-page feature boundary и временного design token bridge.
