const ffmpeg: any = require("fluent-ffmpeg");
const fs: typeof import("fs") = require("fs");
const path: typeof import("path") = require("path");
const crypto: typeof import("crypto") = require("crypto");
import { uploadFolderToCloud } from "../../utils/cloudUploader";

const ffmpegPath =
  process.env.NODE_ENV === "production"
    ? "ffmpeg"
    : String.raw`C:\ffmpeg\bin\ffmpeg.exe`;

ffmpeg.setFfmpegPath(ffmpegPath);

interface HlsConversionResult {
  success: boolean;
  playlistPath: string;
}

/**
 * Encrypts & Transcodes MP4 to HLS with AES-128 and uploads to Nextcloud
 */
export const convertToEncryptedHLS = async (
  inputFile: string,
  courseId: string,
  lessonId: string,
  hlsOutputBasePath: string,
): Promise<HlsConversionResult> => {
  if (!fs.existsSync(inputFile)) {
    throw new Error(`Input video file not found: ${inputFile}`);
  }

  const isValidId = (value: string): boolean => /^[a-zA-Z0-9_-]+$/.test(value);
  if (!isValidId(courseId) || !isValidId(lessonId)) {
    throw new Error("Invalid courseId or lessonId");
  }

  const storageDir = path.resolve(__dirname, "../../storage");
  const outputDir = path.join(storageDir, "hls-output", courseId, lessonId);
  const keysDir = path.join(storageDir, "keys", courseId, lessonId);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(keysDir, { recursive: true });

  const keyPath = path.join(keysDir, "video.key");
  const keyInfoPath = path.join(keysDir, "enc.keyinfo");
  const playlistPath = path.join(outputDir, "index.m3u8");

  // Generate AES-128 encryption key
  const aesKey = crypto.randomBytes(16);
  fs.writeFileSync(keyPath, aesKey, { mode: 0o600 });

  const baseUrl = (
    process.env.STREAMING_SERVER_PUBLIC_URL || "http://localhost:8080"
  ).replace(/\/+$/, "");

  const keyURI = `${baseUrl}/api/v1/key/${courseId}/${lessonId}`;

  fs.writeFileSync(keyInfoPath, `${keyURI}\n${keyPath}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputFile)
        .outputOptions([
          "-c:v libx264",
          "-profile:v main",
          "-crf 22",
          "-preset ultrafast",
          "-g 48",
          "-keyint_min 48",
          "-sc_threshold 0",
          "-c:a aac",
          "-b:a 128k",
          "-hls_time 4",
          "-hls_playlist_type vod",
          "-hls_segment_filename",
          path.join(outputDir, "segment_%03d.ts"),
          "-hls_key_info_file",
          keyInfoPath,
        ])
        .output(playlistPath)
        .on("start", (commandLine: string) => {
          console.log("[FFmpeg] Started:", commandLine);
        })
        .on("stderr", (line: string) => {
          console.log("[FFmpeg stderr]", line);
        })
        .on("end", () => {
          console.log("[FFmpeg] Transcoding completed");
          resolve();
        })
        .on("error", (error: Error) => {
          console.error("[FFmpeg] Transcoding failed:", error);
          reject(error);
        })
        .run();
    });

    if (!fs.existsSync(playlistPath) || fs.statSync(playlistPath).size === 0) {
      throw new Error("HLS playlist was not generated");
    }

    if (fs.existsSync(keyInfoPath)) {
      fs.unlinkSync(keyInfoPath);
    }

    // Upload HLS segments & playlist to Nextcloud WebDAV
    console.log(
      `[Cloud] Uploading HLS folder to Nextcloud: ${hlsOutputBasePath}`,
    );
    await uploadFolderToCloud(outputDir, hlsOutputBasePath);

    return {
      success: true,
      playlistPath: `${hlsOutputBasePath}/index.m3u8`,
    };
  } catch (error) {
    if (fs.existsSync(keyInfoPath)) {
      fs.unlinkSync(keyInfoPath);
    }
    console.error("[HLS] Conversion error:", error);
    throw error;
  }
};
