import { createClient, WebDAVClient } from "webdav";
import fs from "node:fs";
import * as path from "node:path";

const getClient = (): WebDAVClient => {
  const webdavUrl = process.env.NEXTCLOUD_WEBDAV_URL;
  const username = process.env.NEXTCLOUD_USER;
  const password = process.env.NEXTCLOUD_PASSWORD;

  // 1. Check environment configuration
  console.log("[WebDAV] Configuration check:", {
    urlConfigured: Boolean(webdavUrl),
    usernameConfigured: Boolean(username),
    passwordConfigured: Boolean(password),
  });

  if (!webdavUrl || !username || !password) {
    throw new Error(
      "Missing Nextcloud WebDAV configuration in environment variables.",
    );
  }

  return createClient(webdavUrl, {
    username,
    password,
  });
};

// 2. Create remote directories
export const ensureRemoteDir = async (remoteDirPath: string): Promise<void> => {
  const client = getClient();

  const cleanPath = remoteDirPath.replace(/^\/+|\/+$/g, "");
  const parts = cleanPath.split("/").filter(Boolean);

  let currentPath = "";

  console.log("[WebDAV] Ensuring remote directory:", cleanPath);

  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;

    try {
      const exists = await client.exists(currentPath);

      console.log("[WebDAV] Directory check:", {
        path: currentPath,
        exists,
      });

      if (!exists) {
        await client.createDirectory(currentPath);

        console.log("[WebDAV] Directory created:", currentPath);
      }
    } catch (error) {
      console.error("[WebDAV] Directory operation failed:", currentPath, error);

      // Do not silently ignore permission or connection errors.
      throw error;
    }
  }
};

// 3. Recursive HLS folder upload
export const uploadFolderToCloud = async (
  localDirPath: string,
  remoteDirPath: string,
): Promise<void> => {
  console.log("[WebDAV] Starting folder upload:", {
    localDirPath,
    remoteDirPath,
    localDirectoryExists: fs.existsSync(localDirPath),
  });

  const client = getClient();

  if (!fs.existsSync(localDirPath)) {
    throw new Error(`Local directory not found: ${localDirPath}`);
  }

  // Create/check the destination directory
  await ensureRemoteDir(remoteDirPath);

  const entries = fs.readdirSync(localDirPath, {
    withFileTypes: true,
  });

  console.log("[WebDAV] Local directory entries:", {
    directory: localDirPath,
    count: entries.length,
    names: entries.map((entry) => entry.name),
  });

  for (const entry of entries) {
    const localFilePath = path.join(localDirPath, entry.name);

    const cleanRemoteDir = remoteDirPath.replace(/\/+$/, "");
    const remoteFilePath = `${cleanRemoteDir}/${entry.name}`;

    if (entry.isDirectory()) {
      console.log("[WebDAV] Processing subdirectory:", {
        local: localFilePath,
        remote: remoteFilePath,
      });

      await uploadFolderToCloud(localFilePath, remoteFilePath);

      continue;
    }

    const localStats = fs.statSync(localFilePath);

    console.log("[WebDAV] Uploading file:", {
      local: localFilePath,
      remote: remoteFilePath,
      sizeBytes: localStats.size,
    });

    if (localStats.size === 0) {
      throw new Error(`Local file is empty: ${localFilePath}`);
    }

    try {
      const fileStream = fs.createReadStream(localFilePath);

      await client.putFileContents(remoteFilePath, fileStream, {
        overwrite: true,
      });

      console.log("[WebDAV] putFileContents completed:", remoteFilePath);

      // 4. Verify the uploaded remote file
      const remoteExists = await client.exists(remoteFilePath);

      console.log("[WebDAV] Remote file verification:", {
        path: remoteFilePath,
        exists: remoteExists,
      });

      if (!remoteExists) {
        throw new Error(`Remote file verification failed: ${remoteFilePath}`);
      }

      // Verify remote file size where supported
      const remoteStat = await client.stat(remoteFilePath);
      const remoteSize = Number(remoteStat.size);

      console.log("[WebDAV] Upload size verification:", {
        path: remoteFilePath,
        localSizeBytes: localStats.size,
        remoteSizeBytes: remoteSize,
        sizeMatches: remoteSize === localStats.size,
      });

      if (Number.isFinite(remoteSize) && remoteSize !== localStats.size) {
        throw new Error(
          `File size mismatch for ${remoteFilePath}: local=${localStats.size}, remote=${remoteSize}`,
        );
      }

      // IMPORTANT:
      // Keep local HLS files until upload verification succeeds.
      // Do not delete files during debugging.
      console.log("[WebDAV] Upload verified successfully:", remoteFilePath);
    } catch (error) {
      console.error("[WebDAV] File upload/verification failed:", {
        local: localFilePath,
        remote: remoteFilePath,
        error,
      });

      throw error;
    }
  }

  // 5. Confirm this directory has no remaining files
  console.log("[WebDAV] Folder processing completed:", remoteDirPath);

  // Intentionally do not remove local directories while debugging.
};
