import { configureStore } from '@reduxjs/toolkit';
import uiReducer from './slices/uiSlice';
import authReducer from './slices/authSlice';
import i18nReducer from './slices/i18nSlice';

export const store = configureStore({
  reducer: {
    ui: uiReducer,
    auth: authReducer,
    i18n: i18nReducer,
  },
});
