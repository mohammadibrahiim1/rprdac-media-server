import { Request, Response } from "express";
import fs from "fs";
import path from "path";

export const getEncryptionKey = (req: Request, res: Response): void => {
  try {
    const { courseId, lessonId } = req.params;

    const keyPath = path.join(
      process.cwd(),
      "storage/keys",
      courseId,
      lessonId,
      "video.key",
    );

    if (!fs.existsSync(keyPath)) {
      res.status(404).json({ error: "Encryption key not found" });
      return;
    }

    res.setHeader("Content-Type", "application/octet-stream");
    res.sendFile(keyPath);
  } catch (error) {
    console.error("Error serving key:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
