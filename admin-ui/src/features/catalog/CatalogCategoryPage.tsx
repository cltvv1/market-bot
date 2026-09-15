import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Save, Eye, EyeOff } from 'lucide-react';
import { api } from '../../api';
import { useRead } from '../../app/use-read';
import { useSession } from '../../app/session';
import { ReadState } from '../../app/primitives';
import { Dialog } from '../../app/Dialog';
import { fmtDate } from '../../format';
import { catalogRoot, productsPath, categoryCommand, validId } from './api';
import type { CatalogCategory } from './types';
import { useCatalogMutation } from './use-catalog-mutation';
import { CatalogRecovery, SnapshotValues } from './components/CatalogFields';

export function categoryHierarchy(items: CatalogCategory[]) {
    const byParent = new Map<number | null, CatalogCategory[]>();
    for (const item of items) {
        const siblings = byParent.get(item.parentId) || [];
        siblings.push(item);
        byParent.set(item.parentId, siblings);
    }
    const result: Array<{ row: CatalogCategory; depth: number }> = [];
    const visited = new Set<number>();
    const visit = (root: CatalogCategory) => {
        const stack = [{ row: root, depth: 0 }];
        while (stack.length) {
            const item = stack.pop()!;
            if (visited.has(item.row.id)) continue;
            visited.add(item.row.id);
            result.push(item);
            for (const child of [
                ...(byParent.get(item.row.id) || []),
            ].reverse())
                stack.push({ row: child, depth: item.depth + 1 });
        }
    };
    for (const root of byParent.get(null) || []) visit(root);
    for (const row of items) if (!visited.has(row.id)) visit(row);
    return result;
}
function categoryForm(row: CatalogCategory | null) {
    return {
        parentId: row?.parentId ? String(row.parentId) : '',
        name: row?.name || '',
        slug: row?.slug || '',
        description: row?.description || '',
        sortOrder: String(row?.sortOrder ?? 0),
        oneCRef: row?.oneCRef || '',
    };
}
function categoryPayload(values: ReturnType<typeof categoryForm>) {
    if (values.parentId && !validId(values.parentId))
        throw new Error('Выберите родительскую категорию.');
    if (
        !/^-?\d{1,10}$/.test(values.sortOrder) ||
        BigInt(values.sortOrder) < -2147483648n ||
        BigInt(values.sortOrder) > 2147483647n
    )
        throw new Error(
            'Порядок должен быть целым числом от −2147483648 до 2147483647.',
        );
    return {
        ...values,
        parentId: values.parentId ? Number(values.parentId) : null,
        sortOrder: Number(values.sortOrder),
        description: values.description || null,
        oneCRef: values.oneCRef || null,
    };
}
export function CatalogCategoryPage() {
    const { admin, revision } = useSession();
    const result = useRead<CatalogCategory[]>(
        `${catalogRoot}/categories`,
        revision,
    );
    const [selection, setSelection] = useState<{
        row: CatalogCategory | null;
    } | null>(null);
    const rows = result.data || [];
    return (
        <section className="cat-workspace">
            <header className="cat-heading">
                <div>
                    <p className="cat-eyebrow">Каталог</p>
                    <h1>Категории</h1>
                </div>
                <div className="admin-actions">
                    <Link className="admin-button" to={productsPath}>
                        Товары
                    </Link>
                    {admin.permissions.includes('catalog.manage') && (
                        <button
                            className="admin-button admin-button--primary"
                            onClick={() => setSelection({ row: null })}
                        >
                            <Plus size={17} />
                            Добавить категорию
                        </button>
                    )}
                </div>
            </header>
            {!result.data ? (
                <ReadState {...result} />
            ) : (
                <>
                    <div className="cat-result-count" role="status">
                        Категорий: {rows.length}
                    </div>
                    <div className="cat-table-wrap">
                        <table className="cat-table">
                            <thead>
                                <tr>
                                    <th>Категория</th>
                                    <th>Адрес</th>
                                    <th>Родитель</th>
                                    <th>Порядок</th>
                                    <th>Публикация</th>
                                    <th>Обновлена</th>
                                    <th>
                                        <span className="cat-muted">
                                            Действия
                                        </span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {categoryHierarchy(rows).map(
                                    ({ row, depth }) => (
                                        <tr key={row.id}>
                                            <td
                                                style={{
                                                    paddingLeft: `${16 + Math.min(depth, 4) * 14}px`,
                                                }}
                                            >
                                                {depth > 0 && (
                                                    <span
                                                        className="cat-tree-mark"
                                                        aria-hidden="true"
                                                    >
                                                        ↳
                                                    </span>
                                                )}
                                                <strong>{row.name}</strong>
                                            </td>
                                            <td>{row.slug}</td>
                                            <td>
                                                {rows.find(
                                                    (item) =>
                                                        item.id ===
                                                        row.parentId,
                                                )?.name || 'Корневая'}
                                            </td>
                                            <td>{row.sortOrder}</td>
                                            <td>
                                                {row.isPublished
                                                    ? 'Опубликована'
                                                    : 'Скрыта'}
                                            </td>
                                            <td>{fmtDate(row.updatedAt)}</td>
                                            <td>
                                                <button
                                                    className="admin-icon-button"
                                                    aria-label={`Редактировать категорию ${row.name}`}
                                                    title="Редактировать категорию"
                                                    disabled={
                                                        !row.actions.edit
                                                            .allowed
                                                    }
                                                    onClick={() =>
                                                        setSelection({ row })
                                                    }
                                                >
                                                    <Pencil size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ),
                                )}
                            </tbody>
                        </table>
                    </div>
                    {!rows.length && (
                        <div className="admin-state">Категорий пока нет</div>
                    )}
                </>
            )}
            {selection && (
                <CategoryEditor
                    key={selection.row?.id || 'new'}
                    initial={selection.row}
                    categories={rows}
                    close={() => setSelection(null)}
                    changed={result.retry}
                />
            )}
        </section>
    );
}
function CategoryEditor({
    initial,
    categories,
    close,
    changed,
}: {
    initial: CatalogCategory | null;
    categories: CatalogCategory[];
    close: () => void;
    changed: () => void;
}) {
    const [values, setValues] = useState(() => categoryForm(initial));
    const [baseline, setBaseline] = useState(() => categoryForm(initial));
    const [saved, setSaved] = useState('');
    const attemptedSlug = useRef('');
    const mutation = useCatalogMutation<CatalogCategory>(
        initial,
        async (current) => {
            const rows = await api<CatalogCategory[]>(
                `${catalogRoot}/categories`,
            );
            const found = current
                ? rows.find((item) => item.id === current.id)
                : rows.find((item) => item.slug === attemptedSlug.current);
            if (current && !found) throw new Error('Unavailable');
            return found || null;
        },
    );
    const row = mutation.snapshot;
    const blocked =
        mutation.busy ||
        mutation.uncertain ||
        mutation.terminal ||
        (!initial && !!row);
    const update = (key: keyof typeof values, value: string) => {
        setValues((previous) => ({ ...previous, [key]: value }));
        setSaved('');
    };
    async function save() {
        try {
            const current = categoryPayload(values);
            const original = categoryPayload(baseline);
            const body = row
                ? {
                      ...Object.fromEntries(
                          Object.entries(current).filter(
                              ([key, value]) =>
                                  value !==
                                  original[key as keyof typeof original],
                          ),
                      ),
                      expectedUpdatedAt: row.expectedUpdatedAt,
                  }
                : current;
            if (!row) attemptedSlug.current = values.slug;
            await mutation.perform(
                () =>
                    api<CatalogCategory>(
                        `${catalogRoot}/categories${row ? `/${row.id}` : ''}`,
                        {
                            method: row ? 'PATCH' : 'POST',
                            body: JSON.stringify(body),
                        },
                    ),
                (result) => {
                    setValues(categoryForm(result));
                    setBaseline(categoryForm(result));
                    setSaved('Изменения сохранены');
                    changed();
                    if (!initial) close();
                },
            );
        } catch (error) {
            mutation.setError(
                error instanceof Error ? error.message : 'Проверьте поля.',
            );
        }
    }
    const fields = [
        ['name', 'Название категории', 255],
        ['slug', 'Адрес категории (slug)', 160],
        ['oneCRef', 'Идентификатор 1С', 255],
    ] as const;
    return (
        <Dialog
            title={row ? 'Категория' : 'Новая категория'}
            onClose={close}
            busy={mutation.busy}
        >
            <div className="cat-workspace cat-category-editor">
                <CatalogRecovery {...mutation}>
                    {row ? (
                        <SnapshotValues
                            values={{
                                Название: row.name,
                                Адрес: row.slug,
                                Родитель: row.parentId,
                                Описание: row.description,
                                Порядок: row.sortOrder,
                                Опубликована: row.isPublished,
                                'Идентификатор 1С': row.oneCRef,
                                Обновлена: fmtDate(row.updatedAt),
                            }}
                        />
                    ) : (
                        <p>Категория с указанным адресом не найдена.</p>
                    )}
                    {!initial && row && (
                        <p>
                            Найдена существующая категория. Закройте окно и
                            откройте её из списка перед редактированием.
                        </p>
                    )}
                </CatalogRecovery>
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        void save();
                    }}
                >
                    <fieldset
                        className="cat-fields"
                        disabled={mutation.busy || mutation.terminal}
                    >
                        {fields.map(([key, label, max]) => (
                            <label key={key}>
                                {label}
                                <input
                                    value={values[key]}
                                    maxLength={max}
                                    required={key !== 'oneCRef'}
                                    pattern={
                                        key === 'slug'
                                            ? '[a-z0-9]+(-[a-z0-9]+)*'
                                            : undefined
                                    }
                                    onChange={(e) =>
                                        update(key, e.target.value)
                                    }
                                />
                            </label>
                        ))}
                        <label>
                            Родительская категория
                            <select
                                aria-label="Родительская категория"
                                value={values.parentId}
                                onChange={(e) =>
                                    update('parentId', e.target.value)
                                }
                            >
                                <option value="">Корневая категория</option>
                                {categories
                                    .filter((item) => item.id !== row?.id)
                                    .map((item) => (
                                        <option value={item.id} key={item.id}>
                                            {item.name}
                                        </option>
                                    ))}
                            </select>
                        </label>
                        <label>
                            Порядок
                            <input
                                inputMode="numeric"
                                value={values.sortOrder}
                                onChange={(e) =>
                                    update('sortOrder', e.target.value)
                                }
                                required
                            />
                        </label>
                        <label className="cat-full">
                            Описание категории
                            <textarea
                                aria-label="Описание категории"
                                rows={4}
                                value={values.description}
                                maxLength={4000}
                                onChange={(e) =>
                                    update('description', e.target.value)
                                }
                            />
                        </label>
                        <p className="cat-muted cat-full">
                            Идентификатор 1С хранится как справочное значение,
                            синхронизация не подключена.
                        </p>
                    </fieldset>
                    <p role="status">{saved}</p>
                    <div className="admin-actions cat-category-actions">
                        <button
                            className="admin-button admin-button--primary"
                            disabled={blocked}
                        >
                            <Save size={17} />
                            {row ? 'Сохранить категорию' : 'Создать категорию'}
                        </button>
                        {row && (
                            <>
                                <button
                                    type="button"
                                    className="admin-button"
                                    disabled={
                                        blocked || !row.actions.publish.allowed
                                    }
                                    onClick={() =>
                                        void mutation.perform(
                                            () =>
                                                categoryCommand(row, 'publish'),
                                            () => {
                                                changed();
                                                setSaved(
                                                    'Категория опубликована',
                                                );
                                            },
                                        )
                                    }
                                >
                                    <Eye size={17} />
                                    Опубликовать категорию
                                </button>
                                <button
                                    type="button"
                                    className="admin-button"
                                    disabled={
                                        blocked ||
                                        !row.actions.unpublish.allowed
                                    }
                                    onClick={() =>
                                        void mutation.perform(
                                            () =>
                                                categoryCommand(
                                                    row,
                                                    'unpublish',
                                                ),
                                            () => {
                                                changed();
                                                setSaved('Категория скрыта');
                                            },
                                        )
                                    }
                                >
                                    <EyeOff size={17} />
                                    Скрыть категорию
                                </button>
                            </>
                        )}
                    </div>
                </form>
            </div>
        </Dialog>
    );
}
