import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { RegistrationRequestEntity } from './entities/registration.entity';
import { RegistrationFieldEntity } from './entities/registration-field.entity';
import { RegistrationEvidenceVersionDto } from './registration-client.dto';
import {
    assertRegistrationDraft,
    assertRegistrationOwner,
    assertRequiredRegistrationValues,
    clientRegistrationForm,
    normalizeRegistrationValues,
    CLIENT_REGISTRATION_FIELDS,
    CLIENT_REGISTRATION_VALUE_MAX,
} from './registration-client-policy';
import {
    RegistrationAnswerDto,
    RegistrationValuesConstraint,
} from '../client/dto/client-api.dto';

describe('client registration policy', () => {
    it('retains the historical 10000-character DTO, policy and projection contract for every application field', () => {
        expect(CLIENT_REGISTRATION_VALUE_MAX).toBe(10000);
        const constraint = new RegistrationValuesConstraint();
        for (const name of CLIENT_REGISTRATION_FIELDS) {
            const allowed = { [name]: 'x'.repeat(10000) };
            const oversized = { [name]: 'x'.repeat(10001) };
            expect(constraint.validate(allowed)).toBe(true);
            expect(normalizeRegistrationValues(allowed)).toEqual(allowed);
            expect(constraint.validate(oversized)).toBe(false);
            expect(() => normalizeRegistrationValues(oversized)).toThrow(
                BadRequestException,
            );
        }
        const fields = CLIENT_REGISTRATION_FIELDS.map((name, step) =>
            Object.assign(new RegistrationFieldEntity(), {
                name,
                step,
                id: step + 1,
                label: name,
            }),
        );
        expect(
            clientRegistrationForm(fields).fields.every(
                (field) => field.maxLength === 10000,
            ),
        ).toBe(true);
        expect(
            validateSync(
                plainToInstance(RegistrationAnswerDto, {
                    value: 'x'.repeat(10000),
                }),
            ),
        ).toHaveLength(0);
        expect(
            validateSync(
                plainToInstance(RegistrationAnswerDto, {
                    value: 'x'.repeat(10001),
                }),
            ),
        ).toHaveLength(1);
    });
    it('projects current supported fields, not equipmentPhoto, with only existing required fields', () => {
        const fields = [
            'phoneToCall',
            'equipmentPhoto',
            'orgName',
            'innKpp',
            'bankReqs',
            'unknown',
        ].map((name, step) =>
            Object.assign(new RegistrationFieldEntity(), {
                id: step + 1,
                name,
                step,
                label: name,
            }),
        );
        const form = clientRegistrationForm(fields);
        expect(form.available).toBe(true);
        expect(form.fields.map((field) => field.name)).toEqual([
            'phoneToCall',
            'orgName',
            'innKpp',
            'bankReqs',
        ]);
        expect(
            form.fields
                .filter((field) => field.required)
                .map((field) => field.name),
        ).toEqual(['phoneToCall', 'orgName', 'innKpp']);
        expect(clientRegistrationForm([]).available).toBe(false);
        expect(clientRegistrationForm([...fields, fields[0]]).available).toBe(
            false,
        );
    });
    it('normalizes an explicit patch without clearing omitted values', () => {
        expect(
            normalizeRegistrationValues({
                orgName: ' Example ',
                kktModel: ' ',
            }),
        ).toEqual({ orgName: 'Example', kktModel: null });
        expect(normalizeRegistrationValues({})).toEqual({});
        expect(() => normalizeRegistrationValues({ constructor: 'x' })).toThrow(
            BadRequestException,
        );
        expect(() =>
            assertRequiredRegistrationValues({ orgName: 'A', innKpp: '1' }),
        ).toThrow(BadRequestException);
    });
    it('ownership requires exact web user or legacy null-user chat', () => {
        const row = Object.assign(new RegistrationRequestEntity(), {
            platform: 'web',
            userId: 2,
            chatId: 'chat',
        });
        expect(() =>
            assertRegistrationOwner(row, { userId: 1, chatId: 'chat' }),
        ).toThrow(NotFoundException);
        expect(() =>
            assertRegistrationOwner(row, { userId: 2, chatId: 'other' }),
        ).not.toThrow();
        row.userId = null;
        expect(() =>
            assertRegistrationOwner(row, { userId: 1, chatId: 'chat' }),
        ).not.toThrow();
        row.platform = 'telegram';
        expect(() =>
            assertRegistrationOwner(row, { userId: 1, chatId: 'chat' }),
        ).toThrow(NotFoundException);
    });
    it('draft precondition is exact and never accepts a handed-off record', () => {
        const row = Object.assign(new RegistrationRequestEntity(), {
            status: 'draft',
            updatedAt: new Date(1700000000000),
            handedOffAt: null,
        });
        expect(() =>
            assertRegistrationDraft(row, row.updatedAt.toISOString()),
        ).not.toThrow();
        expect(() =>
            assertRegistrationDraft(row, new Date(1700000000001).toISOString()),
        ).toThrow(ConflictException);
        row.handedOffAt = new Date();
        expect(() =>
            assertRegistrationDraft(row, row.updatedAt.toISOString()),
        ).toThrow(ConflictException);
    });
    it.each([undefined, null, '', 0, -1, 1.5, 2147483648, ['1'], {}, true])(
        'rejects invalid mandatory requirement version %p',
        (value) => {
            expect(
                validateSync(
                    plainToInstance(RegistrationEvidenceVersionDto, {
                        expectedRequirementVersion: value,
                    }),
                ).length,
            ).toBeGreaterThan(0);
        },
    );
});
