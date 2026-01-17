/**
 * Floor Plan Storage Service
 *
 * Uploads CAD-generated outputs (DXF, PNG, SVG, JSON) to Supabase Storage.
 * Uses client name + date for organized file naming and easy tracking.
 */

import { createClient } from '@supabase/supabase-js';
import { Buffer } from 'buffer';

const FLOOR_PLANS_BUCKET = 'floor-plans';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface StorageUploadResult {
  success: boolean;
  path?: string;
  publicUrl?: string;
  signedUrl?: string;
  error?: string;
}

/**
 * Generate a clean filename from client name
 * Example: "Mr. Kumar's House" -> "mr-kumars-house"
 */
function sanitizeClientName(clientName: string): string {
  return clientName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
    .substring(0, 50); // Limit length
}

/**
 * Generate formatted filename with client name and date
 * Format: clientname_YYYYMMDD_HHMMSS_filename.ext
 * Example: kumar-residence_20260111_143022_floor-plan.dxf
 */
function generateFileName(
  clientName: string | null,
  originalFileName: string
): string {
  const sanitizedClient = clientName
    ? sanitizeClientName(clientName)
    : 'unnamed-client';

  const now = new Date();
  const dateStr = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '_')
    .substring(0, 15); // YYYYMMDD_HHMMSS

  // Extract extension from original filename
  const extension = originalFileName.includes('.')
    ? originalFileName.substring(originalFileName.lastIndexOf('.'))
    : '';
  const baseName = originalFileName.replace(extension, '');

  return `${sanitizedClient}_${dateStr}_${baseName}${extension}`;
}

/**
 * Upload a file to Supabase Storage with client-based naming
 */
export async function uploadFloorPlanFile(
  sessionId: string,
  fileName: string,
  fileBuffer: Buffer,
  mimeType: string,
  clientName?: string | null
): Promise<StorageUploadResult> {
  try {
    // Generate organized filename with client name + date
    const organizedFileName = generateFileName(clientName ?? null, fileName);

    // Create path: session-id/clientname_date_filename
    const filePath = `${sessionId}/${organizedFileName}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(FLOOR_PLANS_BUCKET)
      .upload(filePath, fileBuffer, {
        contentType: mimeType,
        upsert: true, // Allow overwriting
      });

    if (error) {
      console.error('Storage upload error:', error);
      return { success: false, error: error.message };
    }

    // Get signed URL (7 days expiry)
    const { data: signedUrlData } = await supabase.storage
      .from(FLOOR_PLANS_BUCKET)
      .createSignedUrl(filePath, 60 * 60 * 24 * 7);

    return {
      success: true,
      path: data.path,
      signedUrl: signedUrlData?.signedUrl,
    };
  } catch (err) {
    console.error('Error uploading floor plan file:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Upload failed',
    };
  }
}

/**
 * Upload base64-encoded image to Supabase Storage
 */
export async function uploadBase64Image(
  sessionId: string,
  fileName: string,
  base64Data: string,
  mimeType: string,
  clientName?: string | null
): Promise<StorageUploadResult> {
  try {
    // Remove data URL prefix if present
    const base64Content = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Content, 'base64');

    return uploadFloorPlanFile(sessionId, fileName, buffer, mimeType, clientName);
  } catch (err) {
    console.error('Error uploading base64 image:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Upload failed',
    };
  }
}

/**
 * Upload CAD render result to storage with client-based naming
 */
export async function uploadCadRenderResult(
  sessionId: string,
  result: {
    dxf_path?: string;
    wireframe_base64?: string;
    ai_rendered_base64?: string;
  },
  clientName?: string | null
): Promise<{
  dxfUrl?: string;
  wireframeUrl?: string;
  aiRenderedUrl?: string;
  error?: string;
}> {
  const urls: {
    dxfUrl?: string;
    wireframeUrl?: string;
    aiRenderedUrl?: string;
    error?: string;
  } = {};

  try {
    // Upload DXF file if present
    if (result.dxf_path) {
      const fs = await import('fs/promises');
      const dxfBuffer = await fs.readFile(result.dxf_path);
      const dxfFileName = 'floor-plan.dxf';

      const dxfUpload = await uploadFloorPlanFile(
        sessionId,
        dxfFileName,
        dxfBuffer,
        'application/octet-stream',
        clientName
      );

      if (dxfUpload.success) {
        urls.dxfUrl = dxfUpload.signedUrl;
      }
    }

    // Upload wireframe PNG if present
    if (result.wireframe_base64) {
      const wireframeFileName = 'wireframe.png';
      const wireframeUpload = await uploadBase64Image(
        sessionId,
        wireframeFileName,
        result.wireframe_base64,
        'image/png',
        clientName
      );

      if (wireframeUpload.success) {
        urls.wireframeUrl = wireframeUpload.signedUrl;
      }
    }

    // Upload AI-rendered image if present
    if (result.ai_rendered_base64) {
      const aiRenderedFileName = 'rendered.png';
      const aiRenderedUpload = await uploadBase64Image(
        sessionId,
        aiRenderedFileName,
        result.ai_rendered_base64,
        'image/png',
        clientName
      );

      if (aiRenderedUpload.success) {
        urls.aiRenderedUrl = aiRenderedUpload.signedUrl;
      }
    }

    return urls;
  } catch (err) {
    console.error('Error uploading CAD render result:', err);
    return {
      ...urls,
      error: err instanceof Error ? err.message : 'Upload failed',
    };
  }
}

/**
 * Delete all files for a session
 */
export async function deleteSessionFiles(sessionId: string): Promise<boolean> {
  try {
    // List all files in the session folder
    const { data: files, error: listError } = await supabase.storage
      .from(FLOOR_PLANS_BUCKET)
      .list(sessionId);

    if (listError) {
      console.error('Error listing files:', listError);
      return false;
    }

    if (!files || files.length === 0) {
      return true; // No files to delete
    }

    // Delete all files
    const filePaths = files.map(file => `${sessionId}/${file.name}`);
    const { error: deleteError } = await supabase.storage
      .from(FLOOR_PLANS_BUCKET)
      .remove(filePaths);

    if (deleteError) {
      console.error('Error deleting files:', deleteError);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error deleting session files:', err);
    return false;
  }
}

/**
 * Get signed URL for an existing file
 */
export async function getSignedUrl(
  filePath: string,
  expiresIn = 60 * 60 * 24 * 7 // 7 days
): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from(FLOOR_PLANS_BUCKET)
      .createSignedUrl(filePath, expiresIn);

    if (error) {
      console.error('Error creating signed URL:', error);
      return null;
    }

    return data?.signedUrl || null;
  } catch (err) {
    console.error('Error getting signed URL:', err);
    return null;
  }
}
