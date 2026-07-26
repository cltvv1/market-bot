import { CheckCircle2, LockKeyhole } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { Button, Input, Select, Textarea, money } from '../components/ui';
import { useCart } from '../context/CartContext';
import { orderService } from '../services/client';
import type { OrderFormData } from '../types';

const initial: OrderFormData = {
    name: '',
    phone: '',
    email: '',
    organization: '',
    inn: '',
    city: 'Красноярск',
    address: '',
    delivery: 'pickup',
    payment: 'invoice',
    comment: '',
};
const phoneMask = (value: string) => {
    const digits = value.replace(/\D/g, '').replace(/^8/, '7').slice(0, 11);
    const d = digits.startsWith('7') ? digits : `7${digits}`;
    return `+7${d.length > 1 ? ` (${d.slice(1, 4)}` : ''}${d.length >= 4 ? `) ${d.slice(4, 7)}` : ''}${d.length >= 7 ? `-${d.slice(7, 9)}` : ''}${d.length >= 9 ? `-${d.slice(9, 11)}` : ''}`;
};

export function CheckoutPage() {
    const { items, total, clear } = useCart();
    const [form, setForm] = useState(initial);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);
    const [orderNumber, setOrderNumber] = useState('');
    if (!items.length && !orderNumber) return <Navigate to="/cart" replace />;
    const set = (name: keyof OrderFormData, value: string) =>
        setForm((current) => ({ ...current, [name]: value }));
    const submit = async (event: FormEvent) => {
        event.preventDefault();
        const next: Record<string, string> = {};
        if (form.name.trim().length < 2) next.name = 'Укажите имя';
        if (form.phone.replace(/\D/g, '').length !== 11)
            next.phone = 'Введите полный номер телефона';
        if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = 'Проверьте email';
        if (form.organization && !/^\d{10}|\d{12}$/.test(form.inn))
            next.inn = 'ИНН содержит 10 или 12 цифр';
        if (!form.city.trim()) next.city = 'Укажите город';
        if (form.delivery !== 'pickup' && !form.address.trim())
            next.address = 'Укажите адрес доставки';
        setErrors(next);
        if (Object.keys(next).length) return;
        setSubmitting(true);
        try {
            const result = await orderService.create(form);
            setOrderNumber(result.number);
            clear();
        } finally {
            setSubmitting(false);
        }
    };
    if (orderNumber)
        return (
            <div className="page container success-page">
                <CheckCircle2 />
                <span className="eyebrow">Заказ оформлен</span>
                <h1>Спасибо! Заказ {orderNumber} принят</h1>
                <p>
                    Менеджер проверит наличие, рассчитает доставку и свяжется с
                    вами в рабочее время. Копия заявки сохранена на этом
                    устройстве.
                </p>
                <div>
                    <Link className="button button--primary" to="/catalog">
                        Вернуться в каталог
                    </Link>
                    <Link className="button button--secondary" to="/contacts">
                        Контакты компании
                    </Link>
                </div>
            </div>
        );
    return (
        <div className="page container">
            <Breadcrumbs
                items={[
                    { label: 'Корзина', to: '/cart' },
                    { label: 'Оформление заказа' },
                ]}
            />
            <header className="page-heading">
                <div>
                    <span className="eyebrow">Финальный шаг</span>
                    <h1>Оформление заказа</h1>
                    <p>
                        Оплата на сайте не требуется — менеджер подтвердит заказ
                        и подготовит документы.
                    </p>
                </div>
            </header>
            <form
                className="checkout-layout"
                onSubmit={(event) => void submit(event)}
                noValidate
            >
                <div className="checkout-form">
                    <section>
                        <h2>Покупатель</h2>
                        <div className="form-grid">
                            <Input
                                label="Имя"
                                name="name"
                                required
                                value={form.name}
                                onChange={(e) => set('name', e.target.value)}
                                error={errors.name}
                            />
                            <Input
                                label="Телефон"
                                name="phone"
                                required
                                value={form.phone}
                                onChange={(e) =>
                                    set('phone', phoneMask(e.target.value))
                                }
                                error={errors.phone}
                                placeholder="+7 (___) ___-__-__"
                            />
                            <Input
                                label="Email"
                                name="email"
                                type="email"
                                required
                                value={form.email}
                                onChange={(e) => set('email', e.target.value)}
                                error={errors.email}
                            />
                            <Input
                                label="Организация"
                                name="organization"
                                value={form.organization}
                                onChange={(e) =>
                                    set('organization', e.target.value)
                                }
                                placeholder="Необязательно"
                            />
                            <Input
                                label="ИНН"
                                name="inn"
                                inputMode="numeric"
                                value={form.inn}
                                onChange={(e) =>
                                    set(
                                        'inn',
                                        e.target.value
                                            .replace(/\D/g, '')
                                            .slice(0, 12),
                                    )
                                }
                                error={errors.inn}
                                placeholder="Для выставления счёта"
                            />
                        </div>
                    </section>
                    <section>
                        <h2>Получение и оплата</h2>
                        <div className="form-grid">
                            <Input
                                label="Город"
                                name="city"
                                required
                                value={form.city}
                                onChange={(e) => set('city', e.target.value)}
                                error={errors.city}
                            />
                            <Select
                                label="Способ получения"
                                value={form.delivery}
                                onChange={(e) =>
                                    set('delivery', e.target.value)
                                }
                            >
                                <option value="pickup">Самовывоз</option>
                                <option value="courier">
                                    Доставка по городу
                                </option>
                                <option value="transport">
                                    Транспортная компания
                                </option>
                            </Select>
                            <Input
                                className="field-span"
                                label="Адрес"
                                name="address"
                                required={form.delivery !== 'pickup'}
                                value={form.address}
                                onChange={(e) => set('address', e.target.value)}
                                error={errors.address}
                                placeholder={
                                    form.delivery === 'pickup'
                                        ? 'Для самовывоза не нужен'
                                        : 'Улица, дом, офис'
                                }
                            />
                            <Select
                                label="Способ оплаты"
                                value={form.payment}
                                onChange={(e) => set('payment', e.target.value)}
                            >
                                <option value="invoice">
                                    Счёт для организации
                                </option>
                                <option value="card">
                                    Банковская карта при получении
                                </option>
                                <option value="cash">
                                    Наличные при получении
                                </option>
                            </Select>
                            <Textarea
                                className="field-span"
                                label="Комментарий"
                                value={form.comment}
                                onChange={(e) => set('comment', e.target.value)}
                                placeholder="Пожелания по комплектации или доставке"
                            />
                        </div>
                    </section>
                </div>
                <aside className="order-summary">
                    <h2>Состав заказа</h2>
                    {items.map(({ product, quantity }) => (
                        <div key={product.id}>
                            <span>
                                {product.name} × {quantity}
                            </span>
                            <strong>{money(product.price * quantity)}</strong>
                        </div>
                    ))}
                    <div className="order-summary__total">
                        <span>Итого</span>
                        <strong>{money(total)}</strong>
                    </div>
                    <Button type="submit" disabled={submitting}>
                        {submitting ? 'Оформляем…' : 'Подтвердить заказ'}
                    </Button>
                    <p>
                        <LockKeyhole />
                        Данные используются только для обработки заказа и не
                        передаются третьим лицам.
                    </p>
                </aside>
            </form>
        </div>
    );
}
