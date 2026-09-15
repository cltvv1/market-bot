import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Eye, EyeOff } from 'lucide-react';
import { api, ApiError } from '../../api';
import { useRead } from '../../app/use-read';
import { useSession } from '../../app/session';
import { ReadState } from '../../app/primitives';
import { fmtDate } from '../../format';
import {
    catalogRoot,
    productsPath,
    validId,
    priceInput,
    priceToMinor,
    productCommand,
    findCreatedProduct,
    validateLists,
} from './api';
import {
    availabilityLabels,
    CATALOG_AVAILABILITY_STATUSES,
    CATALOG_VAT_RATES,
    reasonLabels,
    type CatalogCategory,
    type CatalogProduct,
} from './types';
import { useCatalogMutation } from './use-catalog-mutation';
import {
    CatalogRecovery,
    ListEditor,
    ProductFacts,
    SnapshotValues,
    SpecificationsEditor,
} from './components/CatalogFields';

export function productForm(row: CatalogProduct | null) {
    return {
        categoryId: row ? String(row.categoryId) : '',
        sku: row?.sku || '',
        slug: row?.slug || '',
        name: row?.name || '',
        brand: row?.brand || '',
        shortDescription: row?.shortDescription || '',
        description: row?.description || '',
        price: row ? priceInput(row.displayPriceMinor) : '',
        vatRate: row?.vatRate ?? 2000,
        availabilityStatus: row?.availabilityStatus || 'on_request',
        features: row?.features || [],
        specifications: Object.entries(row?.specifications || {}),
        packageContents: row?.packageContents || [],
        aliases: row?.aliases || [],
        isActive: row?.isActive ?? true,
        isPopular: row?.isPopular ?? false,
        isNew: row?.isNew ?? false,
        oneCRef: row?.oneCRef || '',
    };
}
type Form = ReturnType<typeof productForm>;
export function productPayload(values: Form) {
    if (!validId(values.categoryId)) throw new Error('Выберите категорию.');
    validateLists(values.aliases, values.specifications);
    const { price, specifications, ...rest } = values;
    return {
        ...rest,
        categoryId: Number(values.categoryId),
        displayPriceMinor: priceToMinor(price),
        specifications: Object.fromEntries(specifications),
        brand: values.brand || null,
        shortDescription: values.shortDescription || null,
        description: values.description || null,
        oneCRef: values.oneCRef || null,
    };
}
export function productChanges(values: Form, baseline: Form) {
    const current = productPayload(values);
    const before = productPayload(baseline);
    return Object.fromEntries(
        Object.entries(current).filter(
            ([key, value]) =>
                JSON.stringify(value) !==
                JSON.stringify(before[key as keyof typeof before]),
        ),
    );
}
export function CatalogProductPage() {
    const { id } = useParams();
    return <ProductLoader key={id || 'new'} id={id} />;
}
function ProductLoader({ id }: { id?: string }) {
    const { revision } = useSession();
    const row = useRead<CatalogProduct>(
        id && validId(id) ? `${catalogRoot}/products/${id}` : null,
        revision,
    );
    const last = useRef<CatalogProduct | null>(null);
    if (row.data) last.current = row.data;
    const terminal =
        row.error instanceof ApiError &&
        [400, 401, 403, 404].includes(row.error.status);
    const current = row.data || (!terminal ? last.current : null);
    if (id && !validId(id))
        return (
            <div className="admin-state" role="alert">
                <h1>Некорректная ссылка</h1>
                <Link to={productsPath}>К товарам</Link>
            </div>
        );
    if (id && !current) return <ReadState {...row} />;
    return (
        <>
            {!!row.error && (
                <p role="alert">
                    Обновление не удалось. Введённые значения сохранены.
                </p>
            )}
            <ProductEditor initial={current} />
        </>
    );
}
function ProductEditor({ initial }: { initial: CatalogProduct | null }) {
    const navigate = useNavigate();
    const location = useLocation();
    const { admin } = useSession();
    const categories = useRead<CatalogCategory[]>(`${catalogRoot}/categories`);
    const [values, setValues] = useState(() => productForm(initial));
    const [baseline, setBaseline] = useState(() => productForm(initial));
    const [savedMessage, setSavedMessage] = useState('');
    const attemptedCreate = useRef({ sku: '', slug: '' });
    const mutation = useCatalogMutation(initial, async (current) =>
        current
            ? api<CatalogProduct>(`${catalogRoot}/products/${current.id}`)
            : findCreatedProduct(
                  attemptedCreate.current.sku,
                  attemptedCreate.current.slug,
              ),
    );
    const row = mutation.snapshot;
    const canManage = admin.permissions.includes('catalog.manage');
    const disabled = !canManage || mutation.busy || mutation.terminal;
    const blocked = disabled || mutation.uncertain || (!initial && !!row);
    const state: unknown = location.state;
    const back =
        state &&
        typeof state === 'object' &&
        'queueUrl' in state &&
        typeof state.queueUrl === 'string' &&
        /^\/catalog\/products(?:\?|$)/.test(state.queueUrl)
            ? state.queueUrl
            : productsPath;
    const update = <K extends keyof Form>(key: K, value: Form[K]) => {
        setValues((previous) => ({ ...previous, [key]: value }));
        setSavedMessage('');
    };
    const field = (
        key: 'sku' | 'slug' | 'name' | 'brand' | 'shortDescription' | 'oneCRef',
        label: string,
        max: number,
        required = false,
    ) => (
        <label>
            {label}
            <input
                name={key}
                value={values[key]}
                maxLength={max}
                required={required}
                pattern={key === 'slug' ? '[a-z0-9]+(-[a-z0-9]+)*' : undefined}
                onChange={(e) => update(key, e.target.value)}
            />
        </label>
    );
    const onSaved = (saved: CatalogProduct) => {
        setValues(productForm(saved));
        setBaseline(productForm(saved));
        setSavedMessage('Изменения сохранены');
        if (!initial)
            void navigate(`${productsPath}/${saved.id}`, { replace: true });
    };
    async function save() {
        try {
            let payload: Record<string, unknown>;
            if (row)
                payload = {
                    ...productChanges(
                        values,
                        baseline.categoryId ? baseline : productForm(row),
                    ),
                    expectedUpdatedAt: row.expectedUpdatedAt,
                };
            else {
                payload = productPayload(values);
                delete payload.isActive;
                attemptedCreate.current = {
                    sku: values.sku,
                    slug: values.slug,
                };
            }
            await mutation.perform(
                () =>
                    api<CatalogProduct>(
                        `${catalogRoot}/products${row ? `/${row.id}` : ''}`,
                        {
                            method: row ? 'PATCH' : 'POST',
                            body: JSON.stringify(payload),
                        },
                    ),
                onSaved,
            );
        } catch (error) {
            mutation.setError(
                error instanceof Error ? error.message : 'Проверьте поля.',
            );
        }
    }
    return (
        <section className="cat-workspace cat-editor">
            <Link className="admin-back" to={back}>
                <ArrowLeft size={17} />К товарам
            </Link>
            <header className="cat-heading">
                <div>
                    <p className="cat-eyebrow">
                        {row ? `Каталог · #${row.id}` : 'Каталог · Новый товар'}
                    </p>
                    <h1>{row?.name || 'Новый товар'}</h1>
                </div>
                {row && (
                    <span className="cat-muted">
                        Обновлён {fmtDate(row.updatedAt)}
                    </span>
                )}
            </header>
            {row && <ProductFacts product={row} />}
            <CatalogRecovery {...mutation}>
                {row ? (
                    <>
                        <SnapshotValues
                            values={{
                                Название: row.name,
                                SKU: row.sku,
                                Адрес: row.slug,
                                Категория: row.category.name,
                                Бренд: row.brand,
                                'Цена, ₽': priceInput(row.displayPriceMinor),
                                НДС: `${row.vatRate / 100}%`,
                                Доступность:
                                    availabilityLabels[row.availabilityStatus],
                                Описание: row.description,
                                'Краткое описание': row.shortDescription,
                                Особенности: row.features,
                                Характеристики: row.specifications,
                                Комплект: row.packageContents,
                                'Поисковые названия': row.aliases,
                                Активен: row.isActive,
                                Опубликован: row.isPublished,
                                Популярный: row.isPopular,
                                Новинка: row.isNew,
                                'Идентификатор 1С': row.oneCRef,
                                Обновлён: fmtDate(row.updatedAt),
                            }}
                        />
                        {!initial && (
                            <Link
                                className="admin-button"
                                to={`${productsPath}/${row.id}`}
                            >
                                Открыть найденный товар
                            </Link>
                        )}
                    </>
                ) : (
                    <p>Запись с введёнными SKU и адресом не найдена.</p>
                )}
            </CatalogRecovery>
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    void save();
                }}
            >
                <fieldset disabled={disabled} className="cat-form-body">
                    <section className="cat-form-section">
                        <div>
                            <h2>Основное</h2>
                        </div>
                        <div className="cat-fields">
                            {field('name', 'Название', 255, true)}
                            {field('sku', 'SKU', 100, true)}
                            {field('slug', 'Адрес (slug)', 160, true)}
                            {field('brand', 'Бренд', 120)}
                            <label>
                                Категория
                                <select
                                    aria-label="Категория"
                                    value={values.categoryId}
                                    required
                                    disabled={!categories.data}
                                    onChange={(e) =>
                                        update('categoryId', e.target.value)
                                    }
                                >
                                    <option value="">Выберите категорию</option>
                                    {categories.data?.map((item) => (
                                        <option key={item.id} value={item.id}>
                                            {item.name}
                                            {!item.isPublished
                                                ? ' · скрыта'
                                                : ''}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <div className="cat-checks">
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={values.isPopular}
                                        onChange={(e) =>
                                            update(
                                                'isPopular',
                                                e.target.checked,
                                            )
                                        }
                                    />
                                    Популярный
                                </label>
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={values.isNew}
                                        onChange={(e) =>
                                            update('isNew', e.target.checked)
                                        }
                                    />
                                    Новинка
                                </label>
                            </div>
                            {!!categories.error && (
                                <p role="alert">
                                    Категории не загружены.{' '}
                                    <button
                                        type="button"
                                        className="admin-button"
                                        onClick={categories.retry}
                                    >
                                        Повторить
                                    </button>
                                </p>
                            )}
                        </div>
                    </section>
                    <section className="cat-form-section">
                        <h2>Цена и доступность</h2>
                        <div className="cat-fields">
                            <label>
                                Цена, ₽
                                <input
                                    inputMode="decimal"
                                    value={values.price}
                                    onChange={(e) =>
                                        update('price', e.target.value)
                                    }
                                    placeholder="По запросу"
                                />
                            </label>
                            <label>
                                НДС
                                <select
                                    aria-label="НДС"
                                    value={values.vatRate}
                                    onChange={(e) =>
                                        update(
                                            'vatRate',
                                            Number(e.target.value),
                                        )
                                    }
                                >
                                    {CATALOG_VAT_RATES.map((rate) => (
                                        <option key={rate} value={rate}>
                                            {rate / 100}%
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label>
                                Доступность
                                <select
                                    aria-label="Доступность"
                                    value={values.availabilityStatus}
                                    onChange={(e) =>
                                        update(
                                            'availabilityStatus',
                                            e.target.value,
                                        )
                                    }
                                >
                                    {CATALOG_AVAILABILITY_STATUSES.map(
                                        (value) => (
                                            <option key={value} value={value}>
                                                {availabilityLabels[value]}
                                            </option>
                                        ),
                                    )}
                                </select>
                            </label>
                        </div>
                    </section>
                    <section className="cat-form-section">
                        <h2>Описание</h2>
                        <div className="cat-fields cat-fields--single">
                            {field('shortDescription', 'Краткое описание', 500)}
                            <label>
                                Полное описание
                                <textarea
                                    aria-label="Полное описание"
                                    rows={6}
                                    value={values.description}
                                    maxLength={20000}
                                    onChange={(e) =>
                                        update('description', e.target.value)
                                    }
                                />
                            </label>
                            <ListEditor
                                label="Особенности"
                                values={values.features}
                                limit={30}
                                maxLength={500}
                                disabled={disabled}
                                onChange={(value) => update('features', value)}
                            />
                        </div>
                    </section>
                    <section className="cat-form-section">
                        <h2>Характеристики</h2>
                        <SpecificationsEditor
                            values={values.specifications}
                            disabled={disabled}
                            onChange={(value) =>
                                update('specifications', value)
                            }
                        />
                    </section>
                    <section className="cat-form-section">
                        <h2>Комплект</h2>
                        <ListEditor
                            label="Состав комплекта"
                            values={values.packageContents}
                            limit={50}
                            maxLength={500}
                            disabled={disabled}
                            onChange={(value) =>
                                update('packageContents', value)
                            }
                        />
                    </section>
                    <section className="cat-form-section">
                        <h2>Поиск</h2>
                        <ListEditor
                            label="Поисковые названия"
                            values={values.aliases}
                            limit={30}
                            maxLength={160}
                            disabled={disabled}
                            onChange={(value) => update('aliases', value)}
                        />
                    </section>
                    <section className="cat-form-section">
                        <h2>Публикация</h2>
                        <div className="cat-fields cat-fields--single">
                            <label className="cat-checkbox">
                                <input
                                    type="checkbox"
                                    checked={values.isActive}
                                    disabled={!row}
                                    onChange={(e) =>
                                        update('isActive', e.target.checked)
                                    }
                                />
                                Активен
                            </label>
                            {row ? (
                                <>
                                    <p>
                                        Публикация:{' '}
                                        {row.isPublished
                                            ? 'опубликован'
                                            : 'черновик'}
                                        . Категория:{' '}
                                        {row.category.isPublished
                                            ? 'опубликована'
                                            : 'скрыта'}
                                        .
                                    </p>
                                    <div className="admin-actions">
                                        <button
                                            type="button"
                                            className="admin-button"
                                            disabled={
                                                blocked ||
                                                !row.actions.publish.allowed
                                            }
                                            onClick={() =>
                                                void mutation.perform(
                                                    () =>
                                                        productCommand(
                                                            row,
                                                            'publish',
                                                        ),
                                                    (saved) => {
                                                        setSavedMessage(
                                                            'Товар опубликован',
                                                        );
                                                        setBaseline(
                                                            (previous) => ({
                                                                ...previous,
                                                                isActive:
                                                                    saved.isActive,
                                                            }),
                                                        );
                                                    },
                                                )
                                            }
                                        >
                                            <Eye size={17} />
                                            Опубликовать
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
                                                        productCommand(
                                                            row,
                                                            'unpublish',
                                                        ),
                                                    () =>
                                                        setSavedMessage(
                                                            'Товар скрыт',
                                                        ),
                                                )
                                            }
                                        >
                                            <EyeOff size={17} />
                                            Снять с публикации
                                        </button>
                                    </div>
                                    {row.actions.publish.reason && (
                                        <p className="cat-muted">
                                            {reasonLabels[
                                                row.actions.publish.reason
                                            ] || 'Публикация недоступна'}
                                        </p>
                                    )}
                                </>
                            ) : (
                                <p className="cat-muted">
                                    Новый товар сохраняется как черновик.
                                </p>
                            )}
                        </div>
                    </section>
                    <section className="cat-form-section">
                        <h2>Интеграционные сведения</h2>
                        <div className="cat-fields">
                            {field('oneCRef', 'Идентификатор 1С', 255)}
                            <div>
                                <span className="cat-muted">
                                    Последняя синхронизация
                                </span>
                                <p>
                                    {row?.oneCSyncedAt
                                        ? fmtDate(row.oneCSyncedAt)
                                        : 'Нет данных'}
                                </p>
                            </div>
                            <p className="cat-muted cat-full">
                                Идентификатор хранится как справочное значение.
                                Синхронизация с 1С не подключена.
                            </p>
                        </div>
                    </section>
                </fieldset>
                <footer className="cat-savebar">
                    <span role="status">
                        {mutation.busy ? 'Сохранение…' : savedMessage}
                    </span>
                    <button
                        className="admin-button admin-button--primary"
                        disabled={
                            blocked ||
                            !categories.data ||
                            (row !== null && !row.actions.edit.allowed)
                        }
                    >
                        <Save size={17} />
                        {row ? 'Сохранить изменения' : 'Создать товар'}
                    </button>
                </footer>
            </form>
        </section>
    );
}
