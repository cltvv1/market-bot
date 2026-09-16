import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles.css';
import './features/store/store.css';
import { bootstrapPublicAccess } from './features/service/public-access-session';

bootstrapPublicAccess();

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
);
