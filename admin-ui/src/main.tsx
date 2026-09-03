import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles.css';

const Reference =
    import.meta.env.DEV &&
    import.meta.env.REFERENCE_DEV_SERVER &&
    window.location.pathname.startsWith('/admin/reference/')
        ? React.lazy(() => import('./reference/ReferenceAdminApp'))
        : null;

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        {Reference ? (
            <React.Suspense fallback={null}>
                <Reference />
            </React.Suspense>
        ) : (
            <App />
        )}
    </React.StrictMode>,
);
