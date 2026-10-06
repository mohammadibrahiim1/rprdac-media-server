const ffmpeg: any = require("fluent-ffmpeg");
const fs: typeof import("fs") = require("fs");
const path: typeof import("path") = require("path");
const crypto: typeof import("crypto") = require("crypto");

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
  return new Promise<HlsConversionResult>((resolve, reject) => {
    const outputDir: string = path.join(
      __dirname,
      "../../storage/hls-output",
      courseId,
      lessonId,
    );
    const keysDir: string = path.join(
      __dirname,
      "../../storage/keys",
      courseId,
      lessonId,
    );

    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    if (!fs.existsSync(keysDir)) fs.mkdirSync(keysDir, { recursive: true });

    // 1. Generate 16-byte random key for AES-128
    const aesKey: Buffer = crypto.randomBytes(16);
    const keyPath: string = path.join(keysDir, "video.key");
    fs.writeFileSync(keyPath, aesKey);

    // 2. Generate Key Info file for FFmpeg
    const keyURI: string = `https://video.yourdomain.com/api/v1/key/${courseId}/${lessonId}`;
    const keyInfoPath: string = path.join(keysDir, "enc.keyinfo");
    const keyInfo: HlsKeyInfoFile = { keyURI, keyPath };
    const keyInfoContent: string = `${keyInfo.keyURI}\n${keyInfo.keyPath}`;
    fs.writeFileSync(keyInfoPath, keyInfoContent);

    // 3. Transcode using FFmpeg
    ffmpeg(inputFile)
      .outputOptions([
        "-profile:v main",
        "-crf 22",
        "-preset ultrafast",
        "-g 48",
        "-keyint_min 48",
        "-hls_time 4", // 4-second chunks
        "-hls_playlist_type vod",
        `-hls_key_info_file ${keyInfoPath}`,
        `-hls_segment_filename ${outputDir}/segment_%03d.ts`,
      ])
      .output(path.join(outputDir, "index.m3u8"))
      .on("end", () => {
        // Cleanup temp keyinfo & input MP4
        if (fs.existsSync(keyInfoPath)) fs.unlinkSync(keyInfoPath);
        if (fs.existsSync(inputFile)) fs.unlinkSync(inputFile);

        resolve({
          success: true,
          playlistPath: `/hls-output/${courseId}/${lessonId}/index.m3u8`,
        });
      })
      .on("error", (err: Error) => {
        reject(err);
      })
      .run();
  });
};
