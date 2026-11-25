import compression from 'compression';
import express from 'express';
import { createApiRouter } from '../server/routes/api.ts';

const app = express();

app.disable('x-powered-by');
app.use(compression({ threshold: 1024 }));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Baseline security headers (omit X-Frame-Options to preserve iframe embeds)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

const allowedOrigins = (process.env.CORS_ORIGIN?.trim() || '')
  .split(',')
  .map((o) => o.trim())
  .filter((o) => Boolean(o) && o !== '*');

app.use('/api', (req, res, next) => {
  const origin = req.headers.origin;
  const requestHost = req.headers['x-forwarded-host'] || req.headers.host;
  const isSameOrigin = Boolean(
    origin &&
      requestHost &&
      (origin === `https://${requestHost}` || origin === `http://${requestHost}`)
  );

  if (origin && (isSameOrigin || allowedOrigins.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.get('/api', (_req, res) => {
  res.json({ ok: true, service: 'Kagura Manga API' });
});

app.use('/api', createApiRouter());

export default app;
