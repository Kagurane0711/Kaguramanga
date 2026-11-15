import express from 'express';
import { createApiRouter } from '../server/routes/api.ts';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.get('/api', (_req, res) => {
  res.json({ ok: true, service: 'Polin Manga API' });
});

app.use('/api', createApiRouter());

export default app;
