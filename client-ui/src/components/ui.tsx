import { LoaderCircle, X } from 'lucide-react';
import {
    useEffect,
    type ButtonHTMLAttributes,
    type InputHTMLAttributes,
    type ReactNode,
    type SelectHTMLAttributes,
    type TextareaHTMLAttributes,
} from 'react';

export const money = (value: number) =>
    new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        maximumFractionDigits: 0,
    }).format(value);

export function Button({
    variant = 'primary',
    className = '',
    children,
    ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'ghost' | 'dark' | 'danger';
}) {
    return (
        <button className={`button button--${variant} ${className}`} {...props}>
            {children}
        </button>
    );
}

export function Badge({
    tone = 'neutral',
    children,
}: {
    tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent';
    children: ReactNode;
}) {
    return <span className={`badge badge--${tone}`}>{children}</span>;
}

interface FieldProps {
    label: string;
    error?: string;
    hint?: string;
    required?: boolean;
}

export function Input({
    label,
    error,
    hint,
    required,
    id,
    ...props
}: InputHTMLAttributes<HTMLInputElement> & FieldProps) {
    const inputId = id || props.name;
    return (
        <label
            className={`field ${error ? 'field--error' : ''}`}
            htmlFor={inputId}
        >
            <span>
                {label}
                {required && <b aria-hidden="true"> *</b>}
            </span>
            <input id={inputId} required={required} {...props} />
            {error ? (
                <small>{error}</small>
            ) : hint ? (
                <small>{hint}</small>
            ) : null}
        </label>
    );
}

export function Select({
    label,
    error,
    hint,
    required,
    id,
    children,
    ...props
}: SelectHTMLAttributes<HTMLSelectElement> & FieldProps) {
    const inputId = id || props.name;
    return (
        <label
            className={`field ${error ? 'field--error' : ''}`}
            htmlFor={inputId}
        >
            <span>
                {label}
                {required && <b aria-hidden="true"> *</b>}
            </span>
            <select id={inputId} required={required} {...props}>
                {children}
            </select>
            {error ? (
                <small>{error}</small>
            ) : hint ? (
                <small>{hint}</small>
            ) : null}
        </label>
    );
}

export function Textarea({
    label,
    error,
    hint,
    required,
    id,
    ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps) {
    const inputId = id || props.name;
    return (
        <label
            className={`field ${error ? 'field--error' : ''}`}
            htmlFor={inputId}
        >
            <span>
                {label}
                {required && <b aria-hidden="true"> *</b>}
            </span>
            <textarea id={inputId} required={required} {...props} />
            {error ? (
                <small>{error}</small>
            ) : hint ? (
                <small>{hint}</small>
            ) : null}
        </label>
    );
}

export function Loader({ label = 'Загружаем данные' }: { label?: string }) {
    return (
        <div className="loader" role="status">
            <LoaderCircle aria-hidden="true" />
            <span>{label}</span>
        </div>
    );
}

export function Skeleton({ count = 6 }: { count?: number }) {
    return (
        <div className="product-grid" aria-label="Загрузка товаров">
            {Array.from({ length: count }, (_, index) => (
                <div className="skeleton" key={index}>
                    <div />
                    <span />
                    <span />
                    <b />
                </div>
            ))}
        </div>
    );
}

export function EmptyState({
    icon,
    title,
    text,
    action,
}: {
    icon: ReactNode;
    title: string;
    text: string;
    action?: ReactNode;
}) {
    return (
        <div className="empty-state">
            {icon}
            <h2>{title}</h2>
            <p>{text}</p>
            {action}
        </div>
    );
}

export function Modal({
    open,
    onClose,
    title,
    children,
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
}) {
    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) =>
            event.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onClose, open]);
    if (!open) return null;
    return (
        <div
            className="modal-backdrop"
            role="presentation"
            onMouseDown={onClose}
        >
            <section
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-label={title}
                onMouseDown={(event) => event.stopPropagation()}
            >
                <header>
                    <h2>{title}</h2>
                    <button
                        className="icon-button"
                        onClick={onClose}
                        aria-label="Закрыть"
                    >
                        <X />
                    </button>
                </header>
                {children}
            </section>
        </div>
    );
}

export function Drawer({
    open,
    onClose,
    title,
    children,
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
}) {
    if (!open) return null;
    return (
        <div
            className="drawer-backdrop"
            role="presentation"
            onMouseDown={onClose}
        >
            <aside
                className="drawer"
                role="dialog"
                aria-modal="true"
                aria-label={title}
                onMouseDown={(event) => event.stopPropagation()}
            >
                <header>
                    <h2>{title}</h2>
                    <button
                        className="icon-button"
                        onClick={onClose}
                        aria-label="Закрыть"
                    >
                        <X />
                    </button>
                </header>
                {children}
            </aside>
        </div>
    );
}
