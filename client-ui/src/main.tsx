import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { WebSessionBoundary } from './components/WebSessionBoundary';
import './styles.css';

const Reference =
    import.meta.env.DEV &&
    import.meta.env.REFERENCE_DEV_SERVER &&
    window.location.pathname === '/site/reference/service'
        ? React.lazy(() => import('./reference/ReferenceClientApp'))
        : null;

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        {Reference ? (
            <React.Suspense fallback={null}>
                <Reference />
            </React.Suspense>
        ) : (
            <WebSessionBoundary>
                <App />
            </WebSessionBoundary>
        )}
    </React.StrictMode>,
);
