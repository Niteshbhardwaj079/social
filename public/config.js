// Run-time settings for the web app. This file is NOT part of the build, so it can be edited on any
// host without rebuilding or touching code.
//
//  apiEnabled  false = use the built-in demo data (no server needed)
//              true  = talk to the Social API
//  apiBaseUrl  where the API lives: "/api" when the API serves this app (the default), or a full
//              address such as "https://api.your-client.com/api" when the API is on another domain.
//
// When the API server itself serves this app it replaces this file with apiEnabled: true automatically.
window.__APP_CONFIG__ = {
  apiEnabled: false,
  apiBaseUrl: '/api',
};
