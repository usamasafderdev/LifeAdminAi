import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AppProvider } from './context/AppContext';
import { AuthProvider } from './context/AuthContext';
import { GoogleOAuthProvider } from '@react-oauth/google';
import './styles.css';

const initialTheme = localStorage.getItem('la_theme_v2') || 'dark';
document.documentElement.classList.toggle(
  'dark',
  initialTheme === 'dark' || (initialTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches),
);

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
if (import.meta.env.DEV && !googleClientId) {
  console.warn('Google Sign-In is disabled until VITE_GOOGLE_CLIENT_ID is configured.');
}
function Providers({ children }) {
  const app = <AuthProvider><AppProvider>{children}</AppProvider></AuthProvider>;
  return googleClientId ? <GoogleOAuthProvider clientId={googleClientId}>{app}</GoogleOAuthProvider> : app;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Providers><App /></Providers>
    </BrowserRouter>
  </React.StrictMode>,
);
