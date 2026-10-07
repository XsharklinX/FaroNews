import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/hanken-grotesk';
import '@fontsource-variable/newsreader';
// Letra para dislexia del lector.
import '@fontsource/opendyslexic/400.css';
import '@fontsource/opendyslexic/700.css';
import './styles/app.css';
import App from './App.jsx';
import { actions } from './data/store.js';

actions.init();

// Alto del teclado en pantalla, para que las hojas dejen sitio y nada quede tapado.
if (window.visualViewport) {
    const onResize = () => {
        const hidden = Math.max(0, window.innerHeight - window.visualViewport.height);
        document.documentElement.style.setProperty('--kb', `${hidden}px`);
    };
    window.visualViewport.addEventListener('resize', onResize);
}

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <App />
    </StrictMode>
);
