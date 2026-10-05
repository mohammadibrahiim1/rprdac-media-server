import dotenv from 'dotenv';
import path from 'path';

const env = process.env.NODE_ENV || 'development';
dotenv.config({
  path: path.resolve(process.cwd(), `.env.${env}`)
});

const config = {
  port: parseInt(process.env.PORT || '8080', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.STREAM_JWT_SECRET || 'fallback_secret_key',
  frontendUrl: process.env.MAIN_FRONTEND_URL || 'http://localhost:5173',
  maxUploadMB: parseInt(process.env.MAX_UPLOAD_SIZE_MB || '2000', 10)
};

export default config; 