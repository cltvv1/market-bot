import { Plus, Trash2, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { priceLabel } from '../api';
import { availabilityLabels, type CatalogProduct } from '../types';

export function ListEditor({
    label,
    values,
    limit,
    maxLength,
    disabled,
    onChange,
}: {
    label: string;
    values: string[];
    limit: number;
    maxLength: number;
    disabled: boolean;
    onChange: (values: string[]) => void;
}) {
    return (
        <fieldset className="cat-list-editor" disabled={disabled}>
            <legend>{label}</legend>
            {values.map((value, index) => (
                <div className="cat-list-row" key={index}>
                    <label className="cat-list-value">
                        <span>
                            {label} {index + 1}
                        </span>
                        <input
                            value={value}
                            maxLength={maxLength}
                            onChange={(e) =>
                                onChange(
                                    values.map((item, i) =>
                                        i === index ? e.target.value : item,
                                    ),
                                )
                            }
                        />
                    </label>
                    <button
                        type="button"
                        className="admin-icon-button"
                        aria-label={`Удалить: ${label} ${index + 1}`}
                        title="Удалить строку"
                        onClick={() =>
                            onChange(values.filter((_, i) => i !== index))
                        }
                    >
                        <Trash2 size={17} />
                    </button>
                </div>
            ))}
            <button
                type="button"
                className="admin-button"
                disabled={
                    values.length >= limit ||
                    values.some((value) => !value.trim())
                }
                onClick={() => onChange([...values, ''])}
            >
                <Plus size={17} />
                Добавить: {label.toLowerCase()}
            </button>
        </fieldset>
    );
}
export function SpecificationsEditor({
    values,
    disabled,
    onChange,
}: {
    values: Array<[string, string]>;
    disabled: boolean;
    onChange: (values: Array<[string, string]>) => void;
}) {
    return (
        <fieldset className="cat-list-editor" disabled={disabled}>
            <legend>Характеристики</legend>
            {values.map((pair, index) => (
                <div className="cat-spec-row" key={index}>
                    <label>
                        Название {index + 1}
                        <input
                            value={pair[0]}
                            required
                            maxLength={100}
                            onChange={(e) =>
                                onChange(
                                    values.map((item, i) =>
                                        i === index
                                            ? [e.target.value, item[1]]
                                            : item,
                                    ),
                                )
                            }
                        />
                    </label>
                    <label>
                        Значение {index + 1}
                        <input
                            value={pair[1]}
                            maxLength={500}
                            onChange={(e) =>
                                onChange(
                                    values.map((item, i) =>
                                        i === index
                                            ? [item[0], e.target.value]
                                            : item,
                                    ),
                                )
                            }
                        />
                    </label>
                    <button
                        type="button"
                        className="admin-icon-button"
                        aria-label={`Удалить характеристику ${index + 1}`}
                        title="Удалить характеристику"
                        onClick={() =>
                            onChange(values.filter((_, i) => i !== index))
                        }
                    >
                        <Trash2 size={17} />
                    </button>
                </div>
            ))}
            <button
                type="button"
                className="admin-button"
                disabled={values.length >= 50}
                onClick={() => onChange([...values, ['', '']])}
            >
                <Plus size={17} />
                Добавить характеристику
            </button>
        </fieldset>
    );
}
export function CatalogRecovery({
    busy,
    error,
    uncertain,
    reconciled,
    terminal,
    reread,
    acknowledge,
    children,
}: {
    busy: boolean;
    error: string;
    uncertain: boolean;
    reconciled: boolean;
    terminal: boolean;
    reread: () => Promise<void>;
    acknowledge: () => void;
    children: ReactNode;
}) {
    if (!error && !uncertain) return null;
    return (
        <section className="cat-recovery" aria-label="Сверка изменений">
            <p role="alert">{error}</p>
            {uncertain && (
                <>
                    <p>
                        Введённые значения сохранены в форме. Повторная отправка
                        остановлена.
                    </p>
                    {reconciled ? (
                        <>
                            <details>
                                <summary>Актуальные данные сервера</summary>
                                {children}
                            </details>
                            <button
                                type="button"
                                className="admin-button"
                                disabled={busy || terminal}
                                onClick={acknowledge}
                            >
                                Данные сверены, продолжить
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            className="admin-button"
                            disabled={busy || terminal}
                            onClick={() => void reread()}
                        >
                            <RefreshCw size={16} />
                            Перечитать запись
                        </button>
                    )}
                </>
            )}
        </section>
    );
}
export function ProductFacts({ product }: { product: CatalogProduct }) {
    return (
        <div className="cat-facts" aria-label="Статус товара">
            <span>{product.isActive ? 'Активен' : 'Неактивен'}</span>
            <span>{product.isPublished ? 'Опубликован' : 'Черновик'}</span>
            <strong>
                {product.effectivePublicVisibility
                    ? 'Публично виден'
                    : product.isPublished && !product.category.isPublished
                      ? 'Опубликован, но категория скрыта'
                      : 'Публично не виден'}
            </strong>
            <span>{availabilityLabels[product.availabilityStatus]}</span>
            <span>{priceLabel(product.displayPriceMinor)}</span>
        </div>
    );
}
export function SnapshotValues({
    values,
}: {
    values: Record<string, unknown>;
}) {
    return (
        <dl className="cat-snapshot">
            {Object.entries(values).map(([name, value]) => (
                <div key={name}>
                    <dt>{name}</dt>
                    <dd>
                        {value == null || value === ''
                            ? 'Не указано'
                            : typeof value === 'boolean'
                              ? value
                                  ? 'Да'
                                  : 'Нет'
                              : typeof value === 'object'
                                ? JSON.stringify(value)
                                : typeof value === 'string' ||
                                    typeof value === 'number'
                                  ? value
                                  : 'Не указано'}
                    </dd>
                </div>
            ))}
        </dl>
    );
}
