import http from 'node:http';
import compression from 'compression';
import express from 'express';
import path from 'node:path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { createApiRouter } from './server/routes/api.ts';
import { warmCatalogCaches } from './server/services/mangahook.ts';

dotenv.config();

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);

  app.use(compression({ threshold: 1024 }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const allowedOrigins = (process.env.CORS_ORIGIN?.trim() || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.use('/api', (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (allowedOrigins.includes('*') || allowedOrigins.includes(origin))) {
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

  // Mount MangaHook API routes
  app.use('/api', createApiRouter());

  if (process.env.NODE_ENV !== 'production') {
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: hmrDisabled ? false : { server: httpServer },
        watch: hmrDisabled ? null : undefined,
      },
      appType: 'spa',
    });

    if (hmrDisabled) {
      app.get('/@vite/client', async (_req, res, next) => {
        try {
          const result = await vite.transformRequest('/@vite/client');
          if (!result?.code) return next();
          const patched = result.code.replace(
            /transport\.connect\s*\(\s*createHMRHandler\s*\(\s*handleMessage\s*\)\s*\)\s*;?/,
            '/* HMR WebSocket connection disabled when DISABLE_HMR=true */'
          );
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.send(patched);
        } catch (err) {
          next(err);
        }
      });
    }

    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(
      express.static(distDir, {
        maxAge: '7d',
        immutable: true,
        index: false,
      })
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Polin Manga server running on http://0.0.0.0:${port}`);
    warmCatalogCaches();
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
