import { createContext, useContext, useState, type ReactNode } from 'react';
import { CallbackDialog } from '../components/CallbackDialog';

interface CallbackContextValue {
    openCallback: (topic?: string) => void;
}

const CallbackContext = createContext<CallbackContextValue | null>(null);

export function CallbackProvider({ children }: { children: ReactNode }) {
    const [open, setOpen] = useState(false);
    const [topic, setTopic] = useState('');

    const openCallback = (nextTopic = '') => {
        setTopic(nextTopic);
        setOpen(true);
    };

    return (
        <CallbackContext.Provider value={{ openCallback }}>
            {children}
            <CallbackDialog
                open={open}
                initialTopic={topic}
                onClose={() => setOpen(false)}
            />
        </CallbackContext.Provider>
    );
}

export function useCallbackRequest() {
    const context = useContext(CallbackContext);
    if (!context)
        throw new Error(
            'useCallbackRequest must be used inside CallbackProvider',
        );
    return context;
}
