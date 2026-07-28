import {
    defaultServiceTypes,
    serviceRequestFlows,
} from './service-request.flows';

describe('service request flow characterization', () => {
    it('keeps the simple request as description followed by contact', () => {
        expect(serviceRequestFlows.simple).toEqual([
            {
                key: 'problemDescription',
                label: 'Кратко опишите, что нужно сделать',
                type: 'text',
            },
            {
                key: 'contactForCall',
                label: 'Укажите телефон для связи',
                type: 'text',
            },
        ]);
    });

    it('keeps FN replacement terms and configured prices', () => {
        const fnType = defaultServiceTypes.find(
            (item) => item.code === 'fn_replacement',
        );

        expect(
            serviceRequestFlows.fn_replacement.map((step) => step.key),
        ).toEqual([
            'inn',
            'cashRegisterIdentity',
            'fiscalDriveTerm',
            'contactForCall',
        ]);
        expect(serviceRequestFlows.fn_replacement[2].options).toEqual([
            { value: '15', label: '15 месяцев' },
            { value: '36', label: '36 месяцев' },
        ]);
        expect(fnType?.settings?.prices).toEqual({
            '15': 15900,
            '36': 22900,
        });
    });
});
