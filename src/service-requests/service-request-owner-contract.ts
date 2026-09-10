import type { ServiceFormVersionEntity } from './entities/service-form-version.entity';
import type {
    ServiceRequestEntity,
    ServiceRequestStatus,
} from './entities/service-request.entity';
import type { ServiceRequestEventEntity } from './entities/service-request-event.entity';
import type { ServiceFormSchema } from './service-form.types';

const fieldTypes = new Set([
    'text',
    'textarea',
    'phone',
    'email',
    'number',
    'boolean',
    'date',
    'select',
    'multiselect',
    'address',
    'organization',
    'equipment',
    'display',
    'file_instruction',
]);

export const OWNER_STAGES: Record<ServiceRequestStatus, string> = {
    draft: 'Черновик',
    submitted: 'Заявка отправлена',
    review_required: 'На рассмотрении',
    clarification_required: 'Нужно уточнение',
    price_confirmed: 'Условия согласованы',
    invoice_required: 'Подготовка счёта',
    waiting_payment: 'Ожидает оплаты',
    paid: 'Оплата подтверждена',
    scheduled: 'Визит назначен',
    in_progress: 'Работа выполняется',
    completed: 'Работа выполнена',
    closed: 'Обращение закрыто',
    cancelled: 'Обращение отменено',
};

export function ownerForm(form: ServiceFormVersionEntity | null) {
    if (!form?.schema || !Array.isArray(form.schema.fields)) return null;
    // A field depending on a private field is private too, including transitive dependencies.
    let fields = form.schema.fields.filter(
        (field) => field.customerVisible !== false,
    );
    for (let index = 0; index < form.schema.fields.length; index++) {
        const keys = new Set(fields.map((field) => field.key));
        fields = fields.filter(
            (field) => !field.condition || keys.has(field.condition.field),
        );
    }
    const schema: ServiceFormSchema = {
        fields: fields.map(
            ({
                key,
                type,
                label,
                required,
                maxLength,
                min,
                max,
                options,
                condition,
            }) => ({
                key,
                type,
                label,
                required,
                maxLength,
                min,
                max,
                options,
                condition,
            }),
        ),
        attachmentInstruction: form.schema.attachmentInstruction,
        maxAttachments: Math.min(5, form.schema.maxAttachments ?? 5),
    };
    return {
        id: form.id,
        version: form.version,
        status: form.status,
        schema,
        supported:
            ['simple', 'fn_replacement'].includes(form.handlerKey ?? '') &&
            fields.length > 0 &&
            fields.every((field) => fieldTypes.has(field.type)),
    };
}

export function ownerAnswers(
    schema: ServiceFormSchema | undefined,
    answers: Record<string, unknown>,
) {
    return Object.fromEntries(
        (schema?.fields ?? [])
            .filter(
                (field) =>
                    field.customerVisible !== false &&
                    (!field.condition ||
                        answers[field.condition.field] ===
                            field.condition.equals),
            )
            .filter((field) => Object.hasOwn(answers, field.key))
            .map((field) => [field.key, answers[field.key]]),
    );
}

export function ownerSummary(row: ServiceRequestEntity) {
    return {
        id: row.id,
        requestNumber: row.requestNumber,
        serviceTypeCode: row.serviceTypeCode,
        serviceTypeTitle: row.serviceTypeTitle,
        stage: row.status,
        stageLabel: OWNER_STAGES[row.status],
        isDraft: row.status === 'draft',
        canContinue: row.status === 'draft',
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

export function ownerHistory(events: ServiceRequestEventEntity[]) {
    const labels: Record<string, string> = {
        draft_created: 'Создан черновик',
        draft_updated: 'Сохранены данные заявки',
        submitted: 'Заявка отправлена',
        invoice_attached: 'Выставлен счёт',
        invoice_uploaded: 'Выставлен счёт',
        payment_proof_attached: 'Платёжный документ передан на проверку',
        visit_scheduled: 'Назначен визит',
        attachment_added: 'Добавлен файл',
        attachment_removed: 'Удалён файл',
    };
    return events.flatMap((event) => {
        const status = event.payload?.status;
        const label =
            event.type === 'status_changed' &&
            typeof status === 'string' &&
            Object.hasOwn(OWNER_STAGES, status)
                ? OWNER_STAGES[status as ServiceRequestStatus]
                : labels[event.type];
        return label
            ? [
                  {
                      id: event.id,
                      type: event.type,
                      label,
                      createdAt: event.createdAt,
                  },
              ]
            : [];
    });
}

export function canCustomerMessage(status: ServiceRequestStatus) {
    return !['draft', 'closed', 'cancelled'].includes(status);
}

export function ownerCapability(allowed: boolean, reason: string) {
    return { allowed, reason: allowed ? null : reason };
}

export function ownerContext(
    snapshot: Record<string, unknown> | null,
    keys: string[],
) {
    if (!snapshot) return null;
    return Object.fromEntries(
        keys
            .filter((key) => typeof snapshot[key] === 'string')
            .map((key) => [key, snapshot[key]]),
    );
}
