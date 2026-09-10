import {
    canCustomerMessage,
    ownerAnswers,
    ownerForm,
    ownerHistory,
} from './service-request-owner-contract';
import type { ServiceFormVersionEntity } from './entities/service-form-version.entity';
import type { ServiceRequestEventEntity } from './entities/service-request-event.entity';

describe('FE-1C owner contract', () => {
    const form = {
        id: 4,
        version: 1,
        handlerKey: 'simple',
        schema: {
            fields: [
                { key: 'name', type: 'text', label: 'Name' },
                {
                    key: 'private',
                    type: 'text',
                    label: 'Secret',
                    customerVisible: false,
                },
                {
                    key: 'dependent',
                    type: 'text',
                    label: 'Dependent',
                    condition: { field: 'private', equals: 'yes' },
                },
                {
                    key: 'conditional',
                    type: 'text',
                    label: 'Conditional',
                    condition: { field: 'name', equals: 'yes' },
                },
            ],
        },
    } as ServiceFormVersionEntity;
    it('projects only client fields and no handler/staff internals', () => {
        const projection = ownerForm(form)!;
        expect(projection.schema.fields.map((field) => field.key)).toEqual([
            'name',
            'conditional',
        ]);
        expect(projection).not.toHaveProperty('handlerKey');
    });
    it('does not expose private or conditionally hidden answers', () => {
        expect(
            ownerAnswers(ownerForm(form)!.schema, {
                name: 'no',
                private: 'secret',
                dependent: 'secret',
                conditional: 'hidden',
            }),
        ).toEqual({ name: 'no' });
    });
    it('fails closed for missing or specialized forms', () => {
        expect(ownerForm(null)).toBeNull();
        expect(
            ownerForm({ ...form, handlerKey: 'atol_consent' })?.supported,
        ).toBe(false);
    });
    it('curates events, never staff text or arbitrary payload', () => {
        const events = [
            {
                id: 1,
                type: 'status_changed',
                message: 'private',
                payload: { status: 'paid', token: 'private' },
                createdAt: new Date(),
            },
            {
                id: 2,
                type: 'assignment_changed',
                message: 'private',
                payload: { staff: 8 },
            },
        ] as ServiceRequestEventEntity[];
        expect(ownerHistory(events)).toEqual([
            {
                id: 1,
                type: 'status_changed',
                label: 'Оплата подтверждена',
                createdAt: events[0].createdAt,
            },
        ]);
    });
    it('uses the existing message command states, including completed', () => {
        expect(canCustomerMessage('draft')).toBe(false);
        expect(canCustomerMessage('closed')).toBe(false);
        expect(canCustomerMessage('cancelled')).toBe(false);
        expect(canCustomerMessage('completed')).toBe(true);
    });
});
