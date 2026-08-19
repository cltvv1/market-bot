import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ServiceFormDefinitionEntity } from './entities/service-form-definition.entity';
import { ServiceFormVersionEntity } from './entities/service-form-version.entity';
import { ServiceTypeEntity } from './entities/service-type.entity';
import type {
    ServiceFormField,
    ServiceFormSchema,
    ServiceRequestAnswers,
} from './service-form.types';

@Injectable()
export class ServiceFormService {
    constructor(
        @InjectRepository(ServiceFormDefinitionEntity)
        private readonly definitions: Repository<ServiceFormDefinitionEntity>,
        @InjectRepository(ServiceFormVersionEntity)
        private readonly versions: Repository<ServiceFormVersionEntity>,
    ) {}

    async ensureForType(type: ServiceTypeEntity) {
        let definition = await this.definitions.findOne({
            where: { serviceTypeId: type.id },
        });
        if (!definition) {
            definition = await this.definitions.save(
                this.definitions.create({
                    serviceTypeId: type.id,
                    isActive: true,
                    supportedChannels: [
                        'web',
                        'telegram',
                        'max',
                        'admin',
                        'phone',
                    ],
                }),
            );
        }
        let version = await this.versions.findOne({
            where: { definitionId: definition.id, status: 'published' },
        });
        const canonical = version?.schema.fields.some(
            (field) => field.key === 'contactName',
        );
        if (version && !canonical) {
            await this.versions.update(version.id, { status: 'retired' });
            version = null;
        }
        if (!version) {
            const latest = await this.versions.findOne({
                where: { definitionId: definition.id },
                order: { version: 'DESC' },
            });
            const schema = this.defaultSchema(type.flow === 'fn_replacement');
            this.validateSchema(schema);
            version = await this.versions.save(
                this.versions.create({
                    definitionId: definition.id,
                    version: (latest?.version ?? 0) + 1,
                    status: 'published',
                    schema,
                    handlerKey: type.flow,
                    publishedAt: new Date(),
                }),
            );
        }
        return version;
    }

    async getPublishedForType(type: ServiceTypeEntity) {
        return this.ensureForType(type);
    }

    async getVersion(id: number) {
        const version = await this.versions.findOne({ where: { id } });
        if (!version)
            throw new BadRequestException('Service form version was not found');
        return version;
    }

    async createDraftVersion(
        type: ServiceTypeEntity,
        schema: ServiceFormSchema,
        createdByStaffId?: number,
        handlerKey?: string,
    ) {
        this.validateSchema(schema);
        const current = await this.ensureForType(type);
        return this.versions.manager.transaction(async (manager) => {
            await manager.query('SELECT pg_advisory_xact_lock($1, $2)', [
                9142,
                current.definitionId,
            ]);
            const repository = manager.getRepository(ServiceFormVersionEntity);
            const latest = await repository.findOne({
                where: { definitionId: current.definitionId },
                order: { version: 'DESC' },
            });
            return repository.save(
                repository.create({
                    definitionId: current.definitionId,
                    version: (latest?.version ?? 0) + 1,
                    status: 'draft',
                    schema,
                    handlerKey: handlerKey ?? current.handlerKey,
                    publishedAt: null,
                    createdByStaffId: createdByStaffId ?? null,
                }),
            );
        });
    }

    async updateDraftVersion(id: number, schema: ServiceFormSchema) {
        this.validateSchema(schema);
        const version = await this.getVersion(id);
        if (version.status !== 'draft') {
            throw new BadRequestException(
                'Only a draft form version can be edited',
            );
        }
        version.schema = schema;
        return this.versions.save(version);
    }

    async publishVersion(id: number) {
        return this.versions.manager.transaction(async (manager) => {
            const repository = manager.getRepository(ServiceFormVersionEntity);
            const version = await repository.findOne({
                where: { id },
                lock: { mode: 'pessimistic_write' },
            });
            if (!version) {
                throw new BadRequestException(
                    'Service form version was not found',
                );
            }
            if (version.status === 'published') return version;
            if (version.status !== 'draft') {
                throw new BadRequestException(
                    'Only a draft form version can be published',
                );
            }
            this.validateSchema(version.schema);
            await repository.update(
                { definitionId: version.definitionId, status: 'published' },
                { status: 'retired' },
            );
            version.status = 'published';
            version.publishedAt = new Date();
            return repository.save(version);
        });
    }

    validateSchema(schema: ServiceFormSchema) {
        if (
            !schema ||
            !Array.isArray(schema.fields) ||
            schema.fields.length < 1 ||
            schema.fields.length > 100
        ) {
            throw new BadRequestException(
                'Service form must contain between 1 and 100 fields',
            );
        }
        if (
            schema.maxAttachments !== undefined &&
            (!Number.isInteger(schema.maxAttachments) ||
                schema.maxAttachments < 0 ||
                schema.maxAttachments > 5)
        ) {
            throw new BadRequestException(
                'Service form attachment limit must be between 0 and 5',
            );
        }
        const supported = new Set([
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
            'file_instruction',
            'display',
        ]);
        const keys = new Set<string>();
        for (const field of schema.fields) {
            if (
                !/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(field.key) ||
                keys.has(field.key)
            ) {
                throw new BadRequestException(
                    `Invalid or duplicate service form field: ${field.key}`,
                );
            }
            keys.add(field.key);
            if (!supported.has(field.type) || !field.label?.trim()) {
                throw new BadRequestException(
                    `Invalid service form field: ${field.key}`,
                );
            }
            if (['select', 'multiselect'].includes(field.type)) {
                const options = field.options ?? [];
                const values = new Set(options.map((option) => option.value));
                if (!options.length || values.size !== options.length) {
                    throw new BadRequestException(
                        `Invalid options for service form field: ${field.key}`,
                    );
                }
            }
        }
        for (const field of schema.fields) {
            if (
                field.condition &&
                (!keys.has(field.condition.field) ||
                    field.condition.field === field.key)
            ) {
                throw new BadRequestException(
                    `Invalid condition for service form field: ${field.key}`,
                );
            }
        }
        return schema;
    }

    validate(
        schema: ServiceFormSchema,
        input: Record<string, unknown>,
        complete: boolean,
    ): ServiceRequestAnswers {
        if (!input || typeof input !== 'object' || Array.isArray(input)) {
            throw new BadRequestException('Answers must be an object');
        }
        const fields = new Map(
            schema.fields.map((field) => [field.key, field]),
        );
        const unknown = Object.keys(input).filter((key) => !fields.has(key));
        if (unknown.length) {
            throw new BadRequestException(
                `Unsupported answer field: ${unknown[0]}`,
            );
        }

        const normalized: ServiceRequestAnswers = {};
        for (const field of schema.fields) {
            if (['display', 'file_instruction'].includes(field.type)) continue;
            const visible = this.isVisible(field, input);
            const value = input[field.key];
            const empty = value === undefined || value === null || value === '';
            if (complete && visible && field.required && empty) {
                throw new BadRequestException(
                    `${field.label}: required value is missing`,
                );
            }
            if (empty || !visible) continue;
            normalized[field.key] = this.validateField(field, value);
        }
        return normalized;
    }

    private isVisible(
        field: ServiceFormField,
        values: Record<string, unknown>,
    ) {
        return (
            !field.condition ||
            values[field.condition.field] === field.condition.equals
        );
    }

    private validateField(field: ServiceFormField, value: unknown) {
        if (field.type === 'boolean') {
            if (typeof value !== 'boolean') throw this.invalid(field);
            return value;
        }
        if (field.type === 'number') {
            const number = typeof value === 'number' ? value : Number(value);
            if (
                !Number.isFinite(number) ||
                (field.min !== undefined && number < field.min) ||
                (field.max !== undefined && number > field.max)
            ) {
                throw this.invalid(field);
            }
            return number;
        }
        if (field.type === 'multiselect') {
            if (
                !Array.isArray(value) ||
                !value.every((item) => typeof item === 'string')
            )
                throw this.invalid(field);
            const allowed = new Set(
                field.options?.map((item) => item.value) ?? [],
            );
            if (value.some((item) => !allowed.has(item)))
                throw this.invalid(field);
            return [...new Set(value)].slice(0, 50);
        }
        if (typeof value !== 'string') throw this.invalid(field);
        const text = value.trim();
        if (!text || text.length > (field.maxLength ?? 10_000))
            throw this.invalid(field);
        if (field.type === 'phone' && !/^\+?[0-9 ()-]{7,25}$/.test(text))
            throw this.invalid(field);
        if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))
            throw this.invalid(field);
        if (field.type === 'date' && Number.isNaN(Date.parse(text)))
            throw this.invalid(field);
        if (
            field.type === 'select' &&
            !field.options?.some((item) => item.value === text)
        )
            throw this.invalid(field);
        return text;
    }

    private invalid(field: ServiceFormField) {
        return new BadRequestException(`${field.label}: invalid value`);
    }

    private defaultSchema(fnReplacement: boolean): ServiceFormSchema {
        const fields: ServiceFormField[] = [
            {
                key: 'clientType',
                type: 'select',
                label: 'Тип клиента',
                required: true,
                options: [
                    { value: 'organization', label: 'Организация или ИП' },
                    { value: 'individual', label: 'Физическое лицо' },
                ],
            },
            {
                key: 'organization',
                type: 'text',
                label: 'Организация',
                maxLength: 255,
                condition: { field: 'clientType', equals: 'organization' },
            },
            {
                key: 'inn',
                type: 'text',
                label: 'ИНН',
                maxLength: 12,
                condition: { field: 'clientType', equals: 'organization' },
            },
            {
                key: 'contactName',
                type: 'text',
                label: 'Контактное лицо',
                required: true,
                maxLength: 255,
            },
            { key: 'phone', type: 'phone', label: 'Телефон', required: true },
            {
                key: 'email',
                type: 'email',
                label: 'Электронная почта',
                maxLength: 255,
            },
            { key: 'city', type: 'text', label: 'Город', maxLength: 255 },
            { key: 'address', type: 'address', label: 'Адрес', maxLength: 500 },
            {
                key: 'equipmentType',
                type: 'select',
                label: 'Тип оборудования',
                required: true,
                options: [
                    { value: 'Касса', label: 'Касса' },
                    {
                        value: 'Фискальный регистратор',
                        label: 'Фискальный регистратор',
                    },
                    { value: 'POS-система', label: 'POS-система' },
                    { value: 'Сканер штрихкодов', label: 'Сканер штрихкодов' },
                    { value: 'Принтер этикеток', label: 'Принтер этикеток' },
                    { value: 'Весы', label: 'Весы' },
                    {
                        value: 'Компьютер или ноутбук',
                        label: 'Компьютер или ноутбук',
                    },
                    {
                        value: 'Другое оборудование',
                        label: 'Другое оборудование',
                    },
                ],
            },
            {
                key: 'equipmentModel',
                type: 'text',
                label: 'Модель',
                required: true,
                maxLength: 255,
            },
            {
                key: 'serialNumber',
                type: 'text',
                label: 'Серийный номер',
                maxLength: 255,
            },
            {
                key: 'software',
                type: 'text',
                label: 'Программа',
                maxLength: 255,
            },
            {
                key: 'urgency',
                type: 'select',
                label: 'Срочность',
                required: true,
                options: [
                    { value: 'normal', label: 'Обычная' },
                    { value: 'urgent', label: 'Срочная' },
                    { value: 'critical', label: 'Критическая' },
                ],
            },
            {
                key: 'helpFormat',
                type: 'select',
                label: 'Формат помощи',
                required: true,
                options: [
                    { value: 'remote', label: 'Удалённо' },
                    { value: 'visit', label: 'Выезд' },
                    { value: 'workshop', label: 'В сервисном центре' },
                ],
            },
            {
                key: 'description',
                type: 'textarea',
                label: 'Описание',
                required: true,
                maxLength: 10_000,
            },
            {
                key: 'consent',
                type: 'boolean',
                label: 'Согласие на обработку данных',
                required: true,
            },
        ];
        if (fnReplacement) {
            fields.splice(13, 0, {
                key: 'fiscalDriveTerm',
                type: 'select',
                label: 'Срок ФН',
                required: true,
                options: [
                    { value: '15', label: '15 месяцев' },
                    { value: '36', label: '36 месяцев' },
                ],
            });
        }
        return {
            fields,
            maxAttachments: 5,
            attachmentInstruction:
                'Можно приложить до пяти фотографий или документов, которые помогут оценить задачу.',
        };
    }
}
