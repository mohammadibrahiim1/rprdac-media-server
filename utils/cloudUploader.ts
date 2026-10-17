import { createClient } from "webdav";
// @ts-ignore Node.js typings are not configured in this project.
import fs from "fs";
// @ts-ignore Node.js typings are not configured in this project.
import * as path from "path";

declare const process: {
  env: Record<string, string | undefined>;
};

const client = createClient(process.env.NEXTCLOUD_WEBDAV_URL!, {
  username: process.env.NEXTCLOUD_USER!,
  password: process.env.NEXTCLOUD_PASSWORD!,
});

export const ensureRemoteDir = async (remoteDirPath: string) => {
  const parts = remoteDirPath.split("/").filter(Boolean);
  let currentPath = "";
  for (const part of parts) {
    currentPath += `/${part}`;
    try {
      const exists = await client.exists(currentPath);
      if (!exists) {
        await client.createDirectory(currentPath);
      }
    } catch (err) {
      // Folder age theke thakle ba create korte gele error ignore korbe
    }
  }
};

// HLS Folder Upload (Media Server Specific - Supports Subfolders & Cleanup)
export const uploadFolderToCloud = async (
  localDirPath: string,
  remoteDirPath: string,
) => {
  await ensureRemoteDir(remoteDirPath);

  if (!fs.existsSync(localDirPath)) {
    throw new Error(`Local directory not found: ${localDirPath}`);
  }

  const entries = fs.readdirSync(localDirPath, { withFileTypes: true });

  for (const entry of entries) {
    const localFilePath = path.join(localDirPath, entry.name);
    const remoteFilePath = `${remoteDirPath}/${entry.name}`;

    if (entry.isDirectory()) {
      // Recurse for subdirectories if any exist
      await uploadFolderToCloud(localFilePath, remoteFilePath);
    } else {
      // Upload file via stream
      const fileStream = fs.createReadStream(localFilePath);
      await client.putFileContents(remoteFilePath, fileStream, {
        overwrite: true,
      });
      // Delete local file after successful upload
      fs.unlinkSync(localFilePath);
    }
  }

  // Remove local directory after all files inside are uploaded and deleted
  try {
    fs.rmdirSync(localDirPath);
  } catch (err) {
    // Ignore if directory cleanup fails or not empty
  }
};
