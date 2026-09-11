import { useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { downloadRegistrationFile } from './api';
import { RegistrationActionButton } from './RegistrationActions';
import {
    requirementLabels,
    type RegistrationFile,
    type RegistrationDetailData,
    type ActionSelection,
} from './types';

export function RegistrationDocumentRow({ file }: { file: RegistrationFile }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    async function download() {
        if (!file.downloadUrl) return;
        setBusy(true);
        setError('');
        try {
            await downloadRegistrationFile(file.downloadUrl, file.originalName);
        } catch {
            setError(
                'Файл недоступен. Обновите карточку или обратитесь к администратору.',
            );
        } finally {
            setBusy(false);
        }
    }
    return (
        <div className="reg-document">
            <FileText size={20} aria-hidden="true" />
            <div>
                <strong>{file.originalName}</strong>
                <small>
                    {file.mimeType || 'Тип не указан'}
                    {file.sizeBytes !== null
                        ? ` · ${Math.ceil(file.sizeBytes / 1024)} КБ`
                        : ''}
                </small>
                {(!file.downloadable || error) && (
                    <p role={error ? 'alert' : undefined}>
                        {error || file.unavailableReason || 'Файл недоступен'}
                    </p>
                )}
            </div>
            {file.downloadable && file.downloadUrl && (
                <button
                    className="admin-icon-button"
                    disabled={busy}
                    aria-label={`Скачать ${file.originalName}`}
                    title="Скачать документ"
                    onClick={() => void download()}
                >
                    <Download size={18} />
                </button>
            )}
        </div>
    );
}
export function RegistrationDocumentsTab({
    data,
    onAction,
}: {
    data: RegistrationDetailData;
    onAction: (selection: ActionSelection) => void;
}) {
    const remove = data.workflow.actions.find(
        (action) => action.id === 'remove-evidence',
    );
    return (
        <div className="reg-documents">
            <section>
                <header className="reg-context">
                    <h2>Анкета PDF</h2>
                    <RegistrationActionButton
                        action={data.workflow.actions.find(
                            (action) => action.id === 'final-pdf',
                        )}
                        onAction={onAction}
                    />
                </header>
                {data.pdf ? (
                    <>
                        <p>
                            {
                                {
                                    final: 'Финальный документ',
                                    draft: 'Предварительный документ',
                                    unknown: 'Документ',
                                }[data.pdf.classification]
                            }
                        </p>
                        <RegistrationDocumentRow file={data.pdf} />
                    </>
                ) : (
                    <p className="admin-muted">PDF пока не подготовлен.</p>
                )}
            </section>
            <section>
                <h2>Подтверждающие документы</h2>
                {data.evidence.length ? (
                    data.evidence.map((file) => {
                        const requirement = data.requirements.find(
                            (item) => item.id === file.requirementId,
                        );
                        return (
                            <article className="reg-evidence" key={file.id}>
                                <p>
                                    {requirement
                                        ? requirementLabels[requirement.kind]
                                        : 'Без связи с требованием'}
                                </p>
                                <RegistrationDocumentRow file={file} />
                                <RegistrationActionButton
                                    action={remove}
                                    evidenceId={file.id}
                                    onAction={onAction}
                                />
                            </article>
                        );
                    })
                ) : (
                    <p className="admin-muted">
                        Подтверждения ещё не поступали.
                    </p>
                )}
            </section>
        </div>
    );
}
