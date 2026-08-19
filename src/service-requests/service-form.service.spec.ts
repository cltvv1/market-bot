import { BadRequestException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { ServiceFormDefinitionEntity } from './entities/service-form-definition.entity';
import { ServiceFormVersionEntity } from './entities/service-form-version.entity';
import { ServiceFormService } from './service-form.service';
import type { ServiceFormSchema } from './service-form.types';

describe('ServiceFormService', () => {
    const service = new ServiceFormService(
        {} as Repository<ServiceFormDefinitionEntity>,
        {} as Repository<ServiceFormVersionEntity>,
    );
    const schema: ServiceFormSchema = {
        fields: [
            {
                key: 'name',
                type: 'text',
                label: 'Имя',
                required: true,
                maxLength: 20,
            },
            { key: 'phone', type: 'phone', label: 'Телефон', required: true },
            {
                key: 'kind',
                type: 'select',
                label: 'Тип',
                required: true,
                options: [
                    { value: 'cashbox', label: 'Касса' },
                    { value: 'other', label: 'Другое' },
                ],
            },
            {
                key: 'model',
                type: 'text',
                label: 'Модель',
                required: true,
                condition: { field: 'kind', equals: 'cashbox' },
            },
            {
                key: 'consent',
                type: 'boolean',
                label: 'Согласие',
                required: true,
            },
        ],
    };

    it('normalizes a complete structured answer set', () => {
        expect(
            service.validate(
                schema,
                {
                    name: '  Иван  ',
                    phone: '+7 (999) 123-45-67',
                    kind: 'cashbox',
                    model: ' АТОЛ 30Ф ',
                    consent: true,
                },
                true,
            ),
        ).toEqual({
            name: 'Иван',
            phone: '+7 (999) 123-45-67',
            kind: 'cashbox',
            model: 'АТОЛ 30Ф',
            consent: true,
        });
    });

    it('allows partial drafts but enforces required fields on submit', () => {
        expect(service.validate(schema, { name: 'Иван' }, false)).toEqual({
            name: 'Иван',
        });
        expect(() => service.validate(schema, { name: 'Иван' }, true)).toThrow(
            BadRequestException,
        );
    });

    it('rejects unknown fields and invalid field types', () => {
        expect(() =>
            service.validate(schema, { injected: 'value' }, false),
        ).toThrow('Unsupported answer field');
        expect(() =>
            service.validate(schema, { consent: 'yes' }, false),
        ).toThrow('invalid value');
        expect(() =>
            service.validate(schema, { kind: 'unknown' }, false),
        ).toThrow('invalid value');
    });

    it('does not require a conditional field when its condition is false', () => {
        expect(
            service.validate(
                schema,
                {
                    name: 'Иван',
                    phone: '+79991234567',
                    kind: 'other',
                    consent: true,
                },
                true,
            ),
        ).not.toHaveProperty('model');
    });

    it('rejects invalid schemas before publication', () => {
        expect(() =>
            service.validateSchema({
                fields: [
                    { key: 'kind', type: 'select', label: 'Тип', options: [] },
                ],
                maxAttachments: 6,
            }),
        ).toThrow(BadRequestException);
        expect(() =>
            service.validateSchema({
                fields: [
                    { key: 'name', type: 'text', label: 'Имя' },
                    { key: 'name', type: 'text', label: 'Дубликат' },
                ],
            }),
        ).toThrow('Invalid or duplicate');
    });
});
