const ffmpeg: any = require("fluent-ffmpeg");
const fs: typeof import("fs") = require("fs");
const path: typeof import("path") = require("path");
const crypto: typeof import("crypto") = require("crypto");

const ffmpegPath =
  process.env.NODE_ENV === "production"
    ? "ffmpeg"
    : String.raw`C:\ffmpeg\bin\ffmpeg.exe`;

ffmpeg.setFfmpegPath(ffmpegPath);

interface ConvertToEncryptedHLSOptions {
  inputFile: string;
  courseId: string;
  lessonId: string;
}

interface HlsKeyInfoFile {
  keyURI: string;
  keyPath: string;
}

interface HlsConversionResult {
  success: boolean;
  playlistPath: string;
}

/**
 * Encrypts & Transcodes MP4 to HLS with AES-128
 */
export const convertToEncryptedHLS = async (
  inputFile: string,
  courseId: string,
  lessonId: string,
): Promise<HlsConversionResult> => {
  // Validate input
  if (!fs.existsSync(inputFile)) {
    throw new Error(`Input video file not found: ${inputFile}`);
  }

  // Prevent path traversal
  const isValidId = (value: string): boolean => /^[a-zA-Z0-9_-]+$/.test(value);

  if (!isValidId(courseId) || !isValidId(lessonId)) {
    throw new Error("Invalid courseId or lessonId");
  }

  // Output directories
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

  // Public URL of the streaming server
  const baseUrl = (
    process.env.STREAMING_SERVER_PUBLIC_URL || "http://localhost:8080"
  ).replace(/\/+$/, "");

  const keyURI = `${baseUrl}/api/v1/key/${courseId}/${lessonId}`;

  const keyInfo: HlsKeyInfoFile = {
    keyURI,
    keyPath,
  };

  // FFmpeg key info format:
  // Line 1: Key URI written into playlist
  // Line 2: Local encryption key path
  // Line 3: Optional IV (not required)
  fs.writeFileSync(keyInfoPath, `${keyInfo.keyURI}\n${keyInfo.keyPath}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });

  // Transcode MP4 to AES-128 encrypted HLS
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

    // Verify output
    if (!fs.existsSync(playlistPath) || fs.statSync(playlistPath).size === 0) {
      throw new Error("HLS playlist was not generated");
    }

    // Remove temporary key info file
    if (fs.existsSync(keyInfoPath)) {
      fs.unlinkSync(keyInfoPath);
    }

    // Delete original upload only after successful transcoding.
    // Remove this block if the original video must be retained.
    if (fs.existsSync(inputFile)) {
      fs.unlinkSync(inputFile);
    }

    return {
      success: true,
      playlistPath: `/hls-output/${courseId}/${lessonId}/index.m3u8`,
    };
  } catch (error) {
    // Clean up incomplete output without deleting the input video
    if (fs.existsSync(keyInfoPath)) {
      fs.unlinkSync(keyInfoPath);
    }

    if (fs.existsSync(playlistPath)) {
      fs.unlinkSync(playlistPath);
    }

    console.error("[HLS] Conversion error:", error);

    throw error;
  }
};
