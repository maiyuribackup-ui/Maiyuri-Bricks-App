/**
 * Google Drive Storage Service
 *
 * Uploads audio files to Google Drive with organized folder structure.
 * Adapted for serverless: uploads raw audio (no ffmpeg conversion).
 */

import { google } from "googleapis";
import { Readable } from "stream";
import { log, logError } from "./logger";
import type { UploadResult } from "./types";

// Cache for folder IDs (useful within a single invocation for root->subfolder)
const folderCache = new Map<string, string>();

const ROOT_FOLDER_NAME = "MaiyuriBricks_CallRecordings";

function getDriveClient() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );

  auth.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  return google.drive({ version: "v3", auth });
}

async function findOrCreateFolder(
  drive: ReturnType<typeof google.drive>,
  folderName: string,
  parentId?: string,
): Promise<string> {
  const cacheKey = `${parentId ?? "root"}:${folderName}`;

  if (folderCache.has(cacheKey)) {
    return folderCache.get(cacheKey)!;
  }

  const query = parentId
    ? `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
    : `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;

  const { data } = await drive.files.list({
    q: query,
    fields: "files(id, name)",
    pageSize: 1,
  });

  if (data.files && data.files.length > 0) {
    const folderId = data.files[0].id!;
    folderCache.set(cacheKey, folderId);
    return folderId;
  }

  const folderMetadata = {
    name: folderName,
    mimeType: "application/vnd.google-apps.folder",
    parents: parentId ? [parentId] : undefined,
  };

  const { data: newFolder } = await drive.files.create({
    requestBody: folderMetadata,
    fields: "id",
  });

  const newFolderId = newFolder.id!;
  folderCache.set(cacheKey, newFolderId);

  log("Created folder", { name: folderName, id: newFolderId });

  return newFolderId;
}

async function ensureFolderHierarchy(
  drive: ReturnType<typeof google.drive>,
  phoneNumber: string,
  leadName?: string,
): Promise<string> {
  const rootId = await findOrCreateFolder(drive, ROOT_FOLDER_NAME);

  const folderName = leadName
    ? `${sanitizeFolderName(leadName)}_${phoneNumber}`
    : "unmatched";

  return findOrCreateFolder(drive, folderName, rootId);
}

function sanitizeFolderName(name: string): string {
  return name
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, "_")
    .substring(0, 50);
}

/**
 * Get file extension from filename
 */
function getFileExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "ogg";
}

/**
 * Get MIME type from filename for upload
 */
function getAudioMimeType(filename: string): string {
  const ext = getFileExtension(filename);
  const mimeTypes: Record<string, string> = {
    wav: "audio/wav",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    ogg: "audio/ogg",
    webm: "audio/webm",
    flac: "audio/flac",
  };
  return mimeTypes[ext] ?? "audio/ogg";
}

/**
 * Generate filename preserving original extension
 */
function generateFileName(
  phoneNumber: string,
  originalFilename: string,
): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toISOString().slice(11, 16).replace(":", "-");
  const ext = getFileExtension(originalFilename);
  const baseName = originalFilename.replace(/\.[^.]+$/, "");

  return `${dateStr}_${timeStr}_${phoneNumber}_${baseName}.${ext}`;
}

/**
 * Upload audio to Google Drive (raw format, no conversion)
 */
export async function uploadToGoogleDrive(
  audioBuffer: Buffer,
  phoneNumber: string,
  originalFilename: string,
  leadName?: string,
): Promise<UploadResult> {
  const drive = getDriveClient();

  const folderId = await ensureFolderHierarchy(drive, phoneNumber, leadName);
  const fileName = generateFileName(phoneNumber, originalFilename);
  const mimeType = getAudioMimeType(originalFilename);

  const stream = Readable.from(audioBuffer);

  const { data } = await drive.files.create({
    requestBody: {
      name: fileName,
      mimeType,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: stream,
    },
    fields: "id, webViewLink, webContentLink",
  });

  if (!data.id) {
    throw new Error("Failed to upload file to Google Drive");
  }

  // Make file readable by anyone with link
  await drive.permissions.create({
    fileId: data.id,
    requestBody: {
      role: "reader",
      type: "anyone",
    },
  });

  log("Uploaded to Google Drive", {
    fileId: data.id,
    fileName,
    mimeType,
    folder: leadName ?? "unmatched",
  });

  return {
    fileId: data.id,
    webViewLink:
      data.webViewLink ?? `https://drive.google.com/file/d/${data.id}/view`,
    webContentLink: data.webContentLink ?? undefined,
  };
}
