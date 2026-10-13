import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import 'katex/dist/katex.min.css';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);

// The web build works without an application server. Never register a worker inside Tauri.
if(import.meta.env.PROD&&'serviceWorker' in navigator&&!('__TAURI_INTERNALS__' in window)) {
  window.addEventListener('load',()=>{void navigator.serviceWorker.register(new URL('./sw.js',document.baseURI),{scope:'./'}).catch(()=>{});});
}
