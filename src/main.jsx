import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { store } from './store';
import App from './App';
import { I18nProvider } from './i18n/I18nProvider';
import ErrorBoundary from './components/common/ErrorBoundary';
import AppCrash from './components/common/AppCrash';
import './styles/main.scss';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary fallback={({ reset }) => <AppCrash onRetry={reset} />}>
      <Provider store={store}>
        <I18nProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </I18nProvider>
      </Provider>
    </ErrorBoundary>
  </StrictMode>
);
