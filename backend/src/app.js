import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config/env.js';
import { logger } from './utils/logger.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import apiRoutes from './routes/index.js';

/** Builds the Express app (no listening, no database work — that is server.js / bootstrap.js). */
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy); // set TRUST_PROXY when running behind nginx / a load balancer

  app.use((req, res, next) => {
    req.id = crypto.randomUUID();
    res.setHeader('X-Request-Id', req.id);
    next();
  });

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"], // email previews are inline-styled srcdoc frames
          // https: already allows an image from anywhere, so http: costs nothing extra and keeps a plain-http
          // deployment (an intranet, a first test on an IP address, APP_URL not yet on https) from breaking
          // media thumbnails whose address matches how the app itself is being served.
          imgSrc: ["'self'", 'data:', 'blob:', 'https:', 'http:'],
          // The composer's video preview and any uploaded video in the Media Library load the same way images do.
          mediaSrc: ["'self'", 'blob:', 'https:', 'http:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          frameSrc: ["'self'", 'about:', 'data:'],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          // Would break a plain-http deployment (an intranet, a first test on an IP address).
          upgradeInsecureRequests: config.auth.cookieSecure ? [] : null,
        },
      },
      // HSTS only makes sense once the site is served over https (COOKIE_SECURE=true / production).
      strictTransportSecurity: config.auth.cookieSecure ? { maxAge: 31536000, includeSubDomains: true } : false,
    })
  );

  // Only needed when the front-end is served from a different origin than this API.
  const allowedOrigins = [...new Set([...config.corsOrigins])];
  if (allowedOrigins.length) {
    app.use('/api', cors({ origin: allowedOrigins, credentials: true, maxAge: 600 }));
  }

  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));

  app.use((req, res, next) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      if (!req.path.startsWith('/api')) return;
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      logger.info('request', { id: req.id, method: req.method, path: req.path, status: res.statusCode, ms: Math.round(ms) });
    });
    next();
  });

  app.use('/api', apiLimiter, apiRoutes);
  app.use('/api', notFoundHandler);

  // Files uploaded to "Server" storage (see src/storage/local.js) — served from wherever MEDIA_LOCAL_DIR points.
  app.use('/media', express.static(config.media.localDir, { index: false, maxAge: '30d', immutable: true }));

  serveFrontend(app);
  app.use(errorHandler);
  return app;
}

/**
 * If the built front-end (../dist) is present, serve it from this same process. Then one
 * deployment is the whole product: same origin (no CORS), no separate web server needed.
 */
function serveFrontend(app) {
  const dir = config.frontendDir;
  if (!dir || !fs.existsSync(path.join(dir, 'index.html'))) return;

  // The front-end reads its settings from /config.js at run time (not baked in at build time), so the
  // same build works on any host. Served from here it always points at this same-origin API.
  app.get('/config.js', (_req, res) => {
    res.type('application/javascript').setHeader('Cache-Control', 'no-cache');
    res.send(`window.__APP_CONFIG__ = ${JSON.stringify({ apiEnabled: true, apiBaseUrl: '/api' })};`);
  });

  app.use(
    express.static(dir, {
      index: false,
      setHeaders(res, filePath) {
        // File names include a content hash, so they can be cached for a year.
        if (filePath.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    })
  );
  // Any other GET is a front-end route (/users, /settings/language ...): let the app handle it.
  app.get(/^(?!\/api(\/|$)).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(dir, 'index.html'));
  });
}
