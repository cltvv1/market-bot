import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { WebSessionBoundary } from './components/WebSessionBoundary';
import './styles.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/primitives.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <WebSessionBoundary>
            <App />
        </WebSessionBoundary>
    </React.StrictMode>,
);
