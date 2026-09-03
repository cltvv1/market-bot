import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
export function Dialog({
    title,
    children,
    onClose,
    busy = false,
}: {
    title: string;
    children: ReactNode;
    onClose: () => void;
    busy?: boolean;
}) {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        const element = ref.current;
        const focus = document.activeElement;
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        element?.showModal();
        return () => {
            element?.close();
            document.body.style.overflow = overflow;
            if (focus instanceof HTMLElement && focus.isConnected)
                focus.focus();
        };
    }, []);
    return (
        <dialog
            className="admin-dialog"
            ref={ref}
            aria-labelledby="admin-dialog-title"
            onCancel={(e) => {
                e.preventDefault();
                if (!busy) onClose();
            }}
        >
            <header>
                <h2 id="admin-dialog-title">{title}</h2>
                <button
                    className="admin-icon-button"
                    disabled={busy}
                    aria-label="Закрыть окно"
                    onClick={onClose}
                >
                    <X size={18} />
                </button>
            </header>
            {children}
        </dialog>
    );
}
