import type { Priority, Registration } from './types';

export const fmtDate = (value?: string) => value ? new Date(value).toLocaleString('ru-RU') : '';
export const value = (input: unknown) => input === null || input === undefined || input === '' ? 'Не указано' : String(input);
export const priorityText = (priority?: Priority) => ({ low: 'Низкий', normal: 'Обычный', high: 'Высокий', urgent: 'Срочный' }[priority || 'normal']);
export const registrationStatus = (item: Registration) => item.isProcessed || item.status === 'processed' ? 'Обработана' : item.status === 'in_work' ? 'В работе' : 'Новая';
export const statusText = (status?: string) => ({
  draft: 'Черновик', submitted: 'Получена', price_confirmed: 'Цена согласована', review_required: 'Нужно проверить',
  clarification_required: 'Нужно уточнение', invoice_required: 'Нужен счёт', waiting_payment: 'Ожидает оплату', paid: 'Оплачено',
  scheduled: 'Визит назначен', in_progress: 'В работе', completed: 'Завершена', closed: 'Закрыта', cancelled: 'Отменена',
}[status || ''] || status || 'Не указан');

export const answerLabels: Record<string, string> = {
  paymentProof: 'Платёжное поручение', problemDescription: 'Описание задачи', contactForCall: 'Контакт', inn: 'ИНН',
  cashRegisterIdentity: 'Касса/шильдик', fiscalDriveTerm: 'ФН', consentId: 'ID согласия',
  city: 'Город', clientName: 'Клиент', representativeName: 'В лице',
  representativeBasis: 'Основание', signedConsentName: 'Подписанный файл',
};
