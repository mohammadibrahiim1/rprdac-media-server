import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

interface TranscodeResult {
  success: boolean;
  playlistPath: string;
}

export const convertToEncryptedHLS = (
  inputFile: string,
  courseId: string,
  lessonId: string
): Promise<TranscodeResult> => {
  return new Promise((resolve, reject) => {
    const outputDir = path.join(process.cwd(), 'storage/hls-output', courseId, lessonId);
    const keysDir = path.join(process.cwd(), 'storage/keys', courseId, lessonId);

    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    if (!fs.existsSync(keysDir)) fs.mkdirSync(keysDir, { recursive: true });

    // 16-Byte AES Key Generation
    const aesKey = crypto.randomBytes(16);
    const keyPath = path.join(keysDir, 'video.key');
    fs.writeFileSync(keyPath, aesKey);

    // Key Info file creation for FFmpeg
    const keyURI = `https://video.yourdomain.com/api/v1/key/${courseId}/${lessonId}`;
    const keyInfoPath = path.join(keysDir, 'enc.keyinfo');
    const keyInfoContent = `${keyURI}\n${keyPath}`;
    fs.writeFileSync(keyInfoPath, keyInfoContent);

    ffmpeg(inputFile)
      .outputOptions([
        '-profile:v main',
        '-crf 22',
        '-preset ultrafast',
        '-g 48',
        '-keyint_min 48',
        '-hls_time 4',
        '-hls_playlist_type vod',
        `-hls_key_info_file ${keyInfoPath}`,
        `-hls_segment_filename ${outputDir}/segment_%03d.ts`
      ])
      .output(path.join(outputDir, 'index.m3u8'))
      .on('end', () => {
        if (fs.existsSync(keyInfoPath)) fs.unlinkSync(keyInfoPath);
        if (fs.existsSync(inputFile)) fs.unlinkSync(inputFile);

        resolve({
          success: true,
          playlistPath: `/hls-output/${courseId}/${lessonId}/index.m3u8`
        });
      })
      .on('error', (err) => {
        reject(err);
      })
      .run();
  });
};







import { Request, Response, NextFunction } from 'express';

export const authStream = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // আপনার অথেন্টিকেশন লজিক এখানে থাকবে (যেমন টোকেন ভেরিফিকেশন)
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      res.status(401).json({ error: 'Access denied. No token provided.' });
      return;
    }

    // টোকেন ভ্যালিড হলে পরবর্তী ধাপে যাবে
    next();
  } catch (error) {
    res.status(403).json({ error: 'Invalid or expired token.' });
  }
};