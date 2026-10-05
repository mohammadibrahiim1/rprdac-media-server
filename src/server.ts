import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { getEncryptionKey } from './controllers/key.controller.js';
import config from './config/index.js';
import { convertToEncryptedHLS } from './middleware/authStream';
import keyRoutes from './routes/key.routes';


const app = express();

app.use(helmet());
app.use(
  cors({
    origin: config.frontendUrl,
    credentials: true
  })
);
app.use(express.json());

// 1. Dynamic Key Server Route (Protected by Stream Token)
app.get('/api/v1/key/:courseId/:lessonId', keyRoutes
  
);

// 2. Transcode Trigger API (Called by Main Backend or Admin API)
app.post('/api/v1/transcode', async (req: Request, res: Response) => {
  const { inputFilePath, courseId, lessonId } = req.body;
  
  if (!inputFilePath || !courseId || !lessonId) {
    return res.status(400).json({ success: false, message: 'Missing required parameters' });
  }

  try {
    const result = await convertToEncryptedHLS(inputFilePath, courseId, lessonId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.send(`Media Streaming Server running in ${config.nodeEnv} mode on port ${config.port}`);
});

app.listen(config.port, () => {
  console.log(`🚀 Video Streaming Server running on port ${config.port}`);
});