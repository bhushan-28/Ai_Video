
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import authRoutes from './routes/authRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import characterRoutes from './routes/characterRoutes.js';
import videoRoutes from './routes/videoRoutes.js';
import voiceRoutes from './routes/voiceRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import { mongoManager } from './database/mongo.js';
import { connectDB } from './connectDB.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Frontend build: server/dist/
const distPath = path.resolve(__dirname, '../dist');

// Initialize Express BEFORE using app.use()
const app = express();

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-gemini-key'
  ]
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({
  extended: true,
  limit: '50mb'
}));

// Ensure output directories exist
[
  'videos',
  'audio',
  'images',
  'subtitles',
  'music',
  'temp'
].forEach(subdir => {
  const dirPath = path.join(config.storageDir, subdir);

  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

// Serve generated media
app.use('/outputs', express.static(config.storageDir));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/characters', characterRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/voices', voiceRoutes);
app.use('/api/settings', settingsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    ffmpeg: true,
    version: '1.0.0'
  });
});

// Serve frontend from server/dist
if (fs.existsSync(path.join(distPath, 'index.html'))) {
  app.use(express.static(distPath));

  // Express 4 and Express 5 compatible catch-all
  app.use((req, res, next) => {
    if (
      req.method !== 'GET' ||
      req.path.startsWith('/api/') ||
      req.path === '/api' ||
      req.path.startsWith('/outputs/')
    ) {
      return next();
    }

    res.sendFile(
      path.join(distPath, 'index.html'),
      err => {
        if (err) next(err);
      }
    );
  });
} else {
  console.warn(
    `[Frontend Warning] Build not found at ${distPath}`
  );
}

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);

  res.status(500).json({
    error: err.message || 'Internal Server Error'
  });
});

process.on('unhandledRejection', reason => {
  console.warn(
    '[Process Warning] Unhandled Promise Rejection:',
    reason?.message || reason
  );
});

process.on('uncaughtException', err => {
  console.error(
    '[Process Error] Uncaught Exception:',
    err.message
  );
});

// Start server
app.listen(config.port, '0.0.0.0', async () => {
  console.log('===============================================');
  console.log(
    `AI Video Generator Engine running on port ${config.port}`
  );
  console.log(`Outputs directory: ${config.storageDir}`);
  console.log(`FFmpeg binary path: ${config.ffmpegPath}`);
  console.log(
    `API ready at http://localhost:${config.port}/api/health`
  );
  console.log('===============================================');

  // Initialize MongoDB
  await mongoManager.connect().catch(err => {
    console.warn(
      `[Mongo Warning] Could not establish initial connection: ${err.message}`
    );
  });
});
