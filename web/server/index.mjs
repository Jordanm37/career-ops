import express from 'express';
import cors from 'cors';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import applicationsRouter from './routes/applications.mjs';
import reportsRouter from './routes/reports.mjs';
import evaluateRouter from './routes/evaluate.mjs';
import profileRouter from './routes/profile.mjs';
import scannerRouter from './routes/scanner.mjs';
import settingsRouter from './routes/settings.mjs';
import contactoRouter from './routes/contacto.mjs';
import queueRouter from './routes/queue.mjs';
import deepRouter from './routes/deep.mjs';
import applyRouter from './routes/apply.mjs';
import cvSyncRouter from './routes/cv-sync.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// API routes
app.use('/api/applications', applicationsRouter);
app.use('/api/applications', reportsRouter);
app.use('/api/evaluate', evaluateRouter);
app.use('/api/profile', profileRouter);
app.use('/api/scan', scannerRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/contacto', contactoRouter);
app.use('/api/queue', queueRouter);
app.use('/api/deep', deepRouter);
app.use('/api/apply', applyRouter);
app.use('/api/cv-sync', cvSyncRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve static frontend (built Vite output)
const clientDist = resolve(__dirname, '..', 'client', 'dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA fallback — serve index.html for all non-API routes (Express v5 syntax)
  app.get('/{*splat}', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(resolve(clientDist, 'index.html'));
    }
  });
} else {
  app.get('/', (req, res) => {
    res.json({
      message: 'Career-Ops API is running. Build the frontend with: cd web/client && npx vite build',
      endpoints: {
        applications: '/api/applications',
        metrics: '/api/applications/metrics',
        evaluate: 'POST /api/evaluate',
      },
    });
  });
}

app.listen(PORT, () => {
  console.log(`Career-Ops dashboard running at http://localhost:${PORT}`);
});
