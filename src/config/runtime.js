/**
 * Settings that can change per host WITHOUT rebuilding: they are read from /config.js at run
 * time (see public/config.js). Build-time env vars are only a fallback for local development.
 */
const runtime = (typeof window !== 'undefined' && window.__APP_CONFIG__) || {};

// true = use the Social API for the parts that have one; false = built-in demo data.
export const API_ENABLED =
  typeof runtime.apiEnabled === 'boolean' ? runtime.apiEnabled : import.meta.env.VITE_API_ENABLED === 'true';

export const API_BASE_URL = runtime.apiBaseUrl || import.meta.env.VITE_API_BASE_URL || '/api';
