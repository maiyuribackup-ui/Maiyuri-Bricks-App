/**
 * Google Drive Storage Service
 *
 * Uploads MP3 files to Google Drive with organized folder structure.
 */

import { google } from 'googleapis';
import { Readable } from 'stream';
import { log, logError } from './logger.js';

// Types
interface UploadResult {
  fileId: string;
  webViewLink: string;
  webContentLink?: string;
}

// Cache for folder IDs
const folderCache = new Map<string, string>();

// Root folder name
const ROOT_FOLDER_NAME = 'MaiyuriBricks_CallRecordings';

/**
 * Get authenticated Drive client
 */
function getDriveClient() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  auth.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  return google.drive({ version: 'v3', auth });
}

/**
 * Find or create a folder by name
 */
async function findOrCreateFolder(
  drive: ReturnType<typeof google.drive>,
  folderName: string,
  parentId?: string
): Promise<string> {
  const cacheKey = `${parentId || 'root'}:${folderName}`;

  // Check cache first
  if (folderCache.has(cacheKey)) {
    return folderCache.get(cacheKey)!;
  }

  // Search for existing folder
  const query = parentId
    ? `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
    : `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;

  const { data } = await drive.files.list({
    q: query,
    fields: 'files(id, name)',
    pageSize: 1,
  });

  if (data.files && data.files.length > 0) {
    const folderId = data.files[0].id!;
    folderCache.set(cacheKey, folderId);
    return folderId;
  }

  // Create new folder
  const folderMetadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: parentId ? [parentId] : undefined,
  };

  const { data: newFolder } = await drive.files.create({
    requestBody: folderMetadata,
    fields: 'id',
  });

  const newFolderId = newFolder.id!;
  folderCache.set(cacheKey, newFolderId);

  log('Created folder', { name: folderName, id: newFolderId });

  return newFolderId;
}

/**
 * Get or create the folder hierarchy for a recording
 *
 * Structure:
 * MaiyuriBricks_CallRecordings/
 * ├── <LeadName>_<Phone>/
 * │   └── recordings...
 * └── unmatched/
 *     └── recordings without lead...
 */
async function ensureFolderHierarchy(
  drive: ReturnType<typeof google.drive>,
  phoneNumber: string,
  leadName?: string
): Promise<string> {
  // Get root folder
  const rootId = await findOrCreateFolder(drive, ROOT_FOLDER_NAME);

  // Create lead-specific or unmatched folder
  const folderName = leadName
    ? `${sanitizeFolderName(leadName)}_${phoneNumber}`
    : 'unmatched';

  return findOrCreateFolder(drive, folderName, rootId);
}

/**
 * Sanitize folder name for Google Drive
 */
function sanitizeFolderName(name: string): string {
  return name
    .replace(/[/\\?%*:|"<>]/g, '_') // Replace invalid chars
    .replace(/\s+/g, '_') // Replace spaces
    .substring(0, 50); // Limit length
}

/**
 * Generate filename for the recording
 */
function generateFileName(phoneNumber: string, originalFilename: string): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const timeStr = now.toISOString().slice(11, 16).replace(':', '-'); // HH-MM

  // Remove extension from original
  const baseName = originalFilename.replace(/\.[^.]+$/, '');

  return `${dateStr}_${timeStr}_${phoneNumber}_${baseName}.mp3`;
}

/**
 * Upload MP3 to Google Drive
 */
export async function uploadToGoogleDrive(
  mp3Buffer: Buffer,
  phoneNumber: string,
  originalFilename: string,
  leadName?: string
): Promise<UploadResult> {
  const drive = getDriveClient();

  // Ensure folder hierarchy exists
  const folderId = await ensureFolderHierarchy(drive, phoneNumber, leadName);

  // Generate filename
  const fileName = generateFileName(phoneNumber, originalFilename);

  // Create readable stream from buffer
  const stream = Readable.from(mp3Buffer);

  // Upload file
  const { data } = await drive.files.create({
    requestBody: {
      name: fileName,
      mimeType: 'audio/mpeg',
      parents: [folderId],
    },
    media: {
      mimeType: 'audio/mpeg',
      body: stream,
    },
    fields: 'id, webViewLink, webContentLink',
  });

  if (!data.id) {
    throw new Error('Failed to upload file to Google Drive');
  }

  // Make file readable by anyone with link
  await drive.permissions.create({
    fileId: data.id,
    requestBody: {
      role: 'reader',
      type: 'anyone',
    },
  });

  log('Uploaded to Google Drive', {
    fileId: data.id,
    fileName,
    folder: leadName || 'unmatched',
  });

  return {
    fileId: data.id,
    webViewLink: data.webViewLink || `https://drive.google.com/file/d/${data.id}/view`,
    webContentLink: data.webContentLink || undefined,
  };
}

/**
 * Delete a file from Google Drive
 */
export async function deleteFromGoogleDrive(fileId: string): Promise<void> {
  const drive = getDriveClient();

  await drive.files.delete({ fileId });

  log('Deleted from Google Drive', { fileId });
}

/**
 * List recent uploads for debugging
 */
export async function listRecentUploads(limit = 10): Promise<
  Array<{
    id: string;
    name: string;
    createdTime: string;
  }>
> {
  const drive = getDriveClient();

  const { data } = await drive.files.list({
    q: `mimeType='audio/mpeg' and trashed=false`,
    fields: 'files(id, name, createdTime)',
    orderBy: 'createdTime desc',
    pageSize: limit,
  });

  return (data.files || []).map((f) => ({
    id: f.id!,
    name: f.name!,
    createdTime: f.createdTime!,
  }));
}
