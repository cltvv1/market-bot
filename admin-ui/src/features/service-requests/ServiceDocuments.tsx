import { Download, FileText } from 'lucide-react';
import { fmtDate } from '../../format';
import type { ServiceDetailData, ServiceDocument } from './types';
export function DocumentRow({ document }: { document: ServiceDocument }) {
    return (
        <div className="admin-document">
            <div>
                <strong>{document.originalName}</strong>
                <small>
                    {document.mimeType || 'Файл'} ·{' '}
                    {Math.ceil(document.sizeBytes / 1024)} КБ ·{' '}
                    {fmtDate(document.createdAt)}
                </small>
                {!document.downloadable && <small>Файл недоступен</small>}
            </div>
            {document.downloadable && document.downloadUrl && (
                <a
                    className="admin-icon-button"
                    href={document.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    title={`Открыть ${document.originalName}`}
                    aria-label={`Открыть ${document.originalName}`}
                >
                    <Download size={19} />
                </a>
            )}
        </div>
    );
}
export function PaymentDocuments({ data }: { data: ServiceDetailData }) {
    return (
        <div className="admin-payment-documents">
            {(
                [
                    ['Счёт', data.documents.invoice],
                    ['Платёжное поручение', data.documents.paymentProof],
                ] as const
            ).map(([title, document]) => (
                <div key={title}>
                    <h3>{title}</h3>
                    {document ? (
                        <DocumentRow document={document} />
                    ) : (
                        <p className="admin-empty-inline">
                            {title === 'Счёт'
                                ? 'Счёт не загружен'
                                : 'Платёжное поручение не получено'}
                        </p>
                    )}
                </div>
            ))}
        </div>
    );
}
export function ServiceDocuments({ data }: { data: ServiceDetailData }) {
    const documents = [
        data.documents.invoice,
        data.documents.paymentProof,
        ...data.documents.attachments,
    ].filter((document): document is ServiceDocument => Boolean(document));
    return (
        <section>
            <h2>Документы заявки</h2>
            {documents.length ? (
                documents.map((document, index) => (
                    <div
                        className="admin-document-entry"
                        key={`${document.id}:${index}`}
                    >
                        <span className="admin-document-kind">
                            {document === data.documents.invoice
                                ? 'Текущий счёт'
                                : document === data.documents.paymentProof
                                  ? 'Текущее платёжное поручение'
                                  : document.kind === 'invoice'
                                    ? 'Предыдущий счёт'
                                    : document.kind === 'signed_consent'
                                      ? 'Подписанное согласие'
                                      : 'Вложение'}{' '}
                            ·{' '}
                            {document.customerVisible
                                ? 'Видит клиент'
                                : 'Внутренний файл'}
                        </span>
                        <DocumentRow document={document} />
                    </div>
                ))
            ) : (
                <div className="admin-state">
                    <FileText size={28} />
                    <p>Документов пока нет.</p>
                </div>
            )}
        </section>
    );
}
