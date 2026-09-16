import { useState } from 'react';
import { Copy, Link2, Unlink } from 'lucide-react';
import { serviceApi, ServiceApiError } from './api';
import { publicShareLink } from './public-access-session';
import { useMounted, useServiceRead } from './useServiceRead';
import { ServiceError } from './ui';

export function ServicePublicAccess({
    id,
    version,
    refresh,
}: {
    id: number;
    version: number;
    refresh: () => Promise<unknown>;
}) {
    const view = useServiceRead(`access-${id}-${version}`, (signal) =>
        serviceApi.publicAccess(id, signal),
    );
    const [link, setLink] = useState('');
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState('');
    const [error, setError] = useState<unknown>();
    const mounted = useMounted();
    async function change(revoke: boolean) {
        if (busy || !view.data || view.loading || view.error) return;
        setBusy(true);
        setLink('');
        setNotice('');
        setError(undefined);
        try {
            if (revoke) {
                await serviceApi.revokePublicAccess(id, view.data.version);
                if (mounted.current) setNotice('Доступ по ссылке отключён.');
            } else {
                const issued = await serviceApi.issuePublicAccess(
                    id,
                    view.data.version,
                );
                if (mounted.current) setLink(publicShareLink(issued.token));
            }
        } catch (failure) {
            if (!mounted.current) return;
            setError(failure);
            // Never replay a potentially committed rotation automatically.
            const state = await view.refresh();
            if (
                mounted.current &&
                failure instanceof ServiceApiError &&
                failure.uncertain
            )
                setNotice(
                    state?.enabled
                        ? 'Доступ включён, но новая ссылка не получена. Создайте новую ссылку отдельным действием; предыдущая перестанет работать.'
                        : state
                          ? 'Доступ отключён. Повторное действие возможно после проверки состояния.'
                          : 'Состояние доступа неизвестно. Обновите состояние перед повторным действием.',
                );
        } finally {
            await refresh();
            if (mounted.current) setBusy(false);
        }
    }
    return (
        <section
            className="svc-document-section"
            aria-labelledby="public-access-heading"
        >
            <h2 id="public-access-heading">Доступ по ссылке</h2>
            <p className="svc-caption">
                Ссылка даёт доступ к ограниченному просмотру заявки и переписке
                без исходной браузерной сессии.
            </p>
            {view.error != null && (
                <ServiceError
                    error={view.error}
                    retry={() => void view.refresh()}
                />
            )}
            {error != null && <ServiceError error={error} />}
            {notice && (
                <p className="svc-notice" role="status">
                    {notice}
                </p>
            )}
            {view.data && (
                <>
                    <p>
                        {view.data.enabled
                            ? 'Доступ включён. Предыдущая ссылка сразу перестанет работать при создании новой.'
                            : 'Доступ отключён.'}
                    </p>
                    <div className="svc-heading-row">
                        <button
                            className="ref-button"
                            disabled={busy || view.loading || !!view.error}
                            onClick={() => void change(false)}
                        >
                            <Link2 size={17} />
                            {view.data.enabled
                                ? 'Создать новую ссылку'
                                : 'Создать ссылку'}
                        </button>
                        {view.data.enabled && (
                            <button
                                className="ref-button"
                                disabled={busy || view.loading || !!view.error}
                                onClick={() => void change(true)}
                            >
                                <Unlink size={17} />
                                Отключить доступ
                            </button>
                        )}
                    </div>
                </>
            )}
            {link && (
                <div className="svc-field">
                    <label htmlFor="public-access-link">Новая ссылка</label>
                    <input id="public-access-link" value={link} readOnly />
                    <button
                        className="ref-button"
                        onClick={() => {
                            if (!navigator.clipboard) {
                                setNotice(
                                    'Выделите ссылку и скопируйте её вручную.',
                                );
                                return;
                            }
                            void navigator.clipboard
                                .writeText(link)
                                .then(() => {
                                    if (mounted.current)
                                        setNotice('Ссылка скопирована.');
                                })
                                .catch(() => {
                                    if (mounted.current)
                                        setNotice(
                                            'Выделите ссылку и скопируйте её вручную.',
                                        );
                                });
                        }}
                    >
                        <Copy size={17} />
                        Копировать ссылку
                    </button>
                </div>
            )}
        </section>
    );
}
