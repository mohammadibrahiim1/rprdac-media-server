import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import multer from "multer";
import path from "path";
import fs from "fs";
import config from "./config/index.js";
import keyRoutes from "./routes/key.routes.js";
import { convertToEncryptedHLS } from "./services/hlsTranscoder.js";

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: config.frontendUrl,
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multer setup for temporary media storage
const tempUploadDir = path.join(process.cwd(), "uploads", "temp-media");
if (!fs.existsSync(tempUploadDir)) {
  fs.mkdirSync(tempUploadDir, { recursive: true });
}
const upload = multer({ dest: tempUploadDir });

// 1. Dynamic Key Server Route (Protected by Stream Token)
app.use("/api/v1/key", keyRoutes);

// 2. Transcode Trigger API (Called by Main Backend)
app.post(
  "/api/v1/transcode",
  upload.single("video"),
  async (req: Request, res: Response) => {
    const videoFile = req.file;
    const { courseId, lessonId, hlsOutputBasePath } = req.body;

    console.log(
      "Received transcoding request for course:",
      courseId,
      "lesson:",
      lessonId,
    );

    if (!videoFile || !courseId || !lessonId || !hlsOutputBasePath) {
      if (videoFile && fs.existsSync(videoFile.path)) {
        fs.unlinkSync(videoFile.path);
      }
      return res.status(400).json({
        success: false,
        message: "Missing required video file or parameters",
      });
    }

    const inputFilePath = videoFile.path;

    try {
      const result = await convertToEncryptedHLS(
        inputFilePath,
        courseId,
        lessonId,
        hlsOutputBasePath,
      );

      // Cleanup transcoder server temporary input file
      if (fs.existsSync(inputFilePath)) {
        fs.unlinkSync(inputFilePath);
      }

      console.log("Transcoding & Cloud Upload Result:", result);
      res.json(result);
    } catch (err: any) {
      if (fs.existsSync(inputFilePath)) {
        fs.unlinkSync(inputFilePath);
      }
      console.error("Transcoding error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  },
);

// Health check
app.get("/health", (_req: Request, res: Response) => {
  res.send(
    `Media Streaming Server running in ${config.nodeEnv} mode on port ${config.port}`,
  );
});

app.listen(config.port, () => {
  console.log(`🚀 Video Streaming Server running on port ${config.port}`);
});
