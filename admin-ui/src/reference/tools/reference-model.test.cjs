const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('ts-node').register({ compilerOptions: { jsx: 'react-jsx' } });
const { createElement } = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { ApiError } = require('../../api');
const { ReadState } = require('../primitives');
const {
    queueState,
    filterResult,
    canReadService,
    paymentDocument,
    staffName,
    clientName,
} = require('../service/service-reference-model');
const { visibleNavigation } = require('../navigation');

test('queue normalizes damaged query values and bounds page/limit', () => {
    assert.deepEqual(
        queueState(
            new URLSearchParams(
                'status=wrong&priority=bad&platform=bad&responsible=../1&page=-2&limit=999',
            ),
        ),
        {
            status: 'all',
            priority: '',
            platform: '',
            responsible: '',
            page: 1,
            limit: 10,
        },
    );
    assert.equal(queueState(new URLSearchParams('page=999999')).page, 1000);
});
test('supported filters round-trip without business content', () => {
    assert.deepEqual(
        queueState(
            new URLSearchParams(
                'status=waiting_payment&priority=high&platform=max&responsible=12&page=2&limit=20',
            ),
        ),
        {
            status: 'waiting_payment',
            priority: 'high',
            platform: 'max',
            responsible: '12',
            page: 2,
            limit: 20,
        },
    );
});
test('local filtering only narrows the authorized server result', () => {
    const source = [
        { id: 1, priority: 'high', responsibleOperatorStaffId: 12 },
        { id: 2, priority: 'normal', assignedEngineerId: 12 },
        { id: 3, priority: 'high', assignedEngineerId: 99 },
    ];
    assert.deepEqual(
        filterResult(source, 'high', '12').map((item) => item.id),
        [1],
    );
    assert.deepEqual(
        filterResult(source, '', '12').map((item) => item.id),
        [1, 2],
    );
    assert.equal(source.length, 3);
});
test('permission decisions do not trust role labels', () => {
    assert.equal(
        canReadService({ roles: ['superadmin'], permissions: [] }),
        false,
    );
    assert.equal(
        canReadService({ permissions: ['serviceRequests.read.assigned'] }),
        true,
    );
    assert.equal(canReadService({ permissions: ['orders.read.all'] }), false);
});
test('empty navigation groups are hidden and sales cannot see service', () => {
    const groups = visibleNavigation(['orders.read.all']);
    assert.equal(
        groups.some((group) => group.title === 'Обращения'),
        false,
    );
    assert.equal(
        groups.some((group) => group.title === 'Продажи'),
        true,
    );
});
test('engineer sees only permitted reference groups', () => {
    const labels = visibleNavigation([
        'serviceRequests.read.assigned',
        'registrations.read.assigned',
    ]).flatMap((group) => group.items.map((item) => item.label));
    assert.ok(labels.includes('Сервисные заявки'));
    assert.ok(labels.includes('Регистрации ККТ'));
    assert.ok(!labels.includes('Сотрудники'));
});
test('payment links require both canonical file ID and attachment kind', () => {
    const data = {
        request: { paymentProofFileId: 7 },
        attachments: [
            { id: 1, kind: 'message', file: { id: 7 } },
            { id: 2, kind: 'payment_proof', file: { id: 8 } },
        ],
    };
    assert.equal(paymentDocument(data, 'payment_proof'), undefined);
    data.attachments.push({ id: 3, kind: 'payment_proof', file: { id: 7 } });
    assert.equal(paymentDocument(data, 'payment_proof').id, 3);
});
test('missing staff name stays an explicit ID, not an inferred identity', () => {
    assert.equal(
        staffName(9, { id: 1, displayName: 'Demo' }, []),
        'Сотрудник #9',
    );
    assert.equal(staffName(1, { id: 1, displayName: 'Demo' }, []), 'Demo');
    assert.equal(clientName({ contactSnapshot: {} }), 'Клиент не указан');
});
test('reference entry points require actual dev server and DEV', () => {
    for (const app of ['admin-ui', 'client-ui']) {
        const text = fs.readFileSync(path.resolve(app, 'src/main.tsx'), 'utf8');
        assert.match(
            text,
            /import\.meta\.env\.DEV\s*&&\s*import\.meta\.env\.REFERENCE_DEV_SERVER/,
        );
    }
});
test('production output has no reference modules, styles, or route dispatch', () => {
    for (const app of ['admin-ui', 'client-ui']) {
        const directory = path.resolve(app, 'dist');
        const files = fs
            .readdirSync(directory)
            .filter((name) => /\.(js|css)$/.test(name));
        assert.ok(files.length > 0);
        for (const file of files) {
            assert.doesNotMatch(file, /Reference/);
            assert.doesNotMatch(
                fs.readFileSync(path.join(directory, file), 'utf8'),
                /ui-reference-root|REFERENCE_DEV_SERVER|\/reference\/service/,
            );
        }
    }
});

test('loading and error states are accessible and never expose raw errors', () => {
    const loading = renderToStaticMarkup(
        createElement(ReadState, { loading: true, retry() {} }),
    );
    assert.match(loading, /role="status"/);
    assert.match(loading, /Загружаем данные/);
    for (const [status, heading] of [
        [400, 'Заявка недоступна'],
        [401, 'Сессия завершена'],
        [403, 'Недостаточно прав'],
        [404, 'Заявка недоступна'],
        [500, 'Не удалось загрузить данные'],
    ]) {
        const html = renderToStaticMarkup(
            createElement(ReadState, {
                error: new ApiError('private diagnostic', status),
                retry() {},
            }),
        );
        assert.match(html, /role="alert"/);
        assert.ok(html.includes(heading));
        assert.ok(!html.includes('private diagnostic'));
        assert.ok(html.includes('Повторить'));
        if (status === 401) assert.ok(html.includes('href="/admin/"'));
    }
});

test('semantic foreground and control colors meet the contrast contract', () => {
    const css = fs.readFileSync(
        path.resolve('client-ui/src/reference/foundation.css'),
        'utf8',
    );
    const colors = Object.fromEntries(
        [...css.matchAll(/--ui-([a-z-]+):\s*(#[a-f\d]{6})/gi)].map((match) => [
            match[1],
            match[2],
        ]),
    );
    const luminance = (color) => {
        const rgb = color
            .slice(1)
            .match(/../g)
            .map((channel) => parseInt(channel, 16) / 255)
            .map((channel) =>
                channel <= 0.04045
                    ? channel / 12.92
                    : ((channel + 0.055) / 1.055) ** 2.4,
            );
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    };
    const contrast = (a, b) =>
        (Math.max(luminance(a), luminance(b)) + 0.05) /
        (Math.min(luminance(a), luminance(b)) + 0.05);
    for (const surface of ['surface', 'surface-subtle', 'canvas']) {
        for (const foreground of ['text', 'text-muted', 'accent-strong'])
            assert.ok(
                contrast(colors[foreground], colors[surface]) >= 4.5,
                `${foreground} on ${surface}`,
            );
        for (const foreground of ['focus', 'control-border'])
            assert.ok(
                contrast(colors[foreground], colors[surface]) >= 3,
                `${foreground} on ${surface}`,
            );
    }
    for (const tone of ['warning', 'danger', 'info'])
        assert.ok(
            contrast(colors[`${tone}-text`], colors[`${tone}-surface`]) >= 4.5,
            tone,
        );
});
