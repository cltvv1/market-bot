import { useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { downloadRegistrationEvidence } from './api';
import type { RegistrationEvidence } from './types';
import { dateText, RegistrationError } from './ui';

export function RegistrationEvidenceList({
    items,
}: {
    items: RegistrationEvidence[];
}) {
    return (
        <ul className="cr-evidence-list">
            {items.map((item) => (
                <EvidenceFile key={item.id} item={item} />
            ))}
        </ul>
    );
}
function EvidenceFile({ item }: { item: RegistrationEvidence }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>();
    return (
        <li>
            <div className="cr-file-name">
                <FileText size={18} aria-hidden="true" />
                <div>
                    <strong>{item.fileName}</strong>
                    <span className="svc-caption">
                        {dateText(item.createdAt)} ·{' '}
                        {(Number(item.sizeBytes) / 1024).toFixed(1)} КБ
                    </span>
                </div>
            </div>
            {item.available ? (
                <button
                    className="ref-icon-button"
                    aria-label={`Скачать ${item.fileName}`}
                    title={`Скачать ${item.fileName}`}
                    disabled={busy}
                    onClick={() => {
                        setBusy(true);
                        setError(undefined);
                        void downloadRegistrationEvidence(
                            item.downloadUrl,
                            item.fileName,
                        )
                            .catch(setError)
                            .finally(() => setBusy(false));
                    }}
                >
                    <Download size={18} />
                </button>
            ) : (
                <span>Файл недоступен</span>
            )}
            {error != null && <RegistrationError error={error} />}
        </li>
    );
}
