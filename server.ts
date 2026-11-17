import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import {createServer as createViteServer} from 'vite';
import agentRouter from './server/routes/agent.ts';
import aiRouter from './server/routes/ai.ts';
import authRouter from './server/routes/auth.ts';
import chatRouter from './server/routes/chat.ts';
import workspaceRouter from './server/routes/workspace.ts';

dotenv.config();

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.set('trust proxy', 1);
  app.use(express.json({limit: '4mb'}));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({status: 'ok'});
  });

  app.use('/api/auth', authRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/conversations', chatRouter);
  app.use('/api/agent', agentRouter);
  app.use('/api', workspaceRouter);

  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(process.cwd(), 'dist');

  if (isProd && fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Arix AI server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Arix AI server:', err);
  process.exit(1);
});
