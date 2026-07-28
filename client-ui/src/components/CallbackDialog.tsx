import { CheckCircle2, Clock3, PhoneCall } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { callbackService } from '../services/client';
import { Button, Input, Modal, Select } from './ui';

const maskPhone = (value: string) => {
    const digits = value.replace(/\D/g, '').replace(/^8/, '7').slice(0, 11);
    const prepared = digits.startsWith('7') ? digits : `7${digits}`;
    return `+7${prepared.length > 1 ? ` (${prepared.slice(1, 4)}` : ''}${prepared.length >= 4 ? `) ${prepared.slice(4, 7)}` : ''}${prepared.length >= 7 ? `-${prepared.slice(7, 9)}` : ''}${prepared.length >= 9 ? `-${prepared.slice(9, 11)}` : ''}`;
};

export function CallbackDialog({
    open,
    onClose,
    initialTopic,
}: {
    open: boolean;
    onClose: () => void;
    initialTopic: string;
}) {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [topic, setTopic] = useState(initialTopic || 'Подбор оборудования');
    const [consent, setConsent] = useState(false);
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    useEffect(() => {
        if (open) setTopic(initialTopic || 'Подбор оборудования');
    }, [initialTopic, open]);

    const close = () => {
        setSubmitted(false);
        setError('');
        onClose();
    };
    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (name.trim().length < 2) {
            setError('Укажите имя');
            return;
        }
        if (phone.replace(/\D/g, '').length !== 11) {
            setError('Введите полный номер телефона');
            return;
        }
        if (!consent) {
            setError('Нужно согласие на обработку данных');
            return;
        }
        setSubmitting(true);
        setError('');
        try {
            await callbackService.create({ name, phone, topic });
            setSubmitted(true);
        } catch {
            setError(
                'Не удалось отправить заявку. Позвоните нам или попробуйте ещё раз.',
            );
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal open={open} onClose={close} title="Заказать звонок">
            {submitted ? (
                <div className="callback-success" role="status">
                    <CheckCircle2 />
                    <h3>Заявка передана оператору</h3>
                    <p>
                        Свяжемся с вами в рабочее время и уточним детали задачи.
                    </p>
                    <Button onClick={close}>Готово</Button>
                </div>
            ) : (
                <form
                    className="callback-form"
                    onSubmit={(event) => void submit(event)}
                >
                    <div className="callback-form__promise">
                        <Clock3 />
                        <div>
                            <strong>
                                Короткая консультация без обязательств
                            </strong>
                            <span>
                                Уточним задачу и подскажем, с чего начать
                            </span>
                        </div>
                    </div>
                    <Input
                        label="Как к вам обращаться"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        autoComplete="name"
                        required
                    />
                    <Input
                        label="Телефон"
                        type="tel"
                        value={phone}
                        onChange={(event) =>
                            setPhone(maskPhone(event.target.value))
                        }
                        autoComplete="tel"
                        placeholder="+7 (___) ___-__-__"
                        required
                    />
                    <Select
                        label="Тема"
                        value={topic}
                        onChange={(event) => setTopic(event.target.value)}
                    >
                        <option>Подбор оборудования</option>
                        <option>Автоматизация бизнеса</option>
                        <option>Сервис и ремонт</option>
                        <option>Регистрация кассы</option>
                        <option>Другой вопрос</option>
                    </Select>
                    <label className="consent">
                        <input
                            type="checkbox"
                            checked={consent}
                            onChange={(event) =>
                                setConsent(event.target.checked)
                            }
                        />
                        <span>Согласен на обработку персональных данных</span>
                    </label>
                    {error && <p className="form-error">{error}</p>}
                    <Button type="submit" disabled={submitting}>
                        <PhoneCall size={18} />
                        {submitting ? 'Отправляем...' : 'Жду звонка'}
                    </Button>
                </form>
            )}
        </Modal>
    );
}
