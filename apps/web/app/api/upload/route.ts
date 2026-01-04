import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { success, error, unauthorized } from '@/lib/api-utils';

// Storage bucket name for audio files
const AUDIO_BUCKET = 'audio-notes';

// Allowed audio MIME types
const ALLOWED_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/webm',
  'audio/ogg',
  'audio/m4a',
  'audio/x-m4a',
];

// Max file size (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// POST /api/upload - Upload audio file to Supabase Storage
export async function POST(request: NextRequest) {
  try {
    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const leadId = formData.get('leadId') as string | null;

    if (!file) {
      return error('No file provided', 400);
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return error(
        `Invalid file type. Allowed types: ${ALLOWED_TYPES.join(', ')}`,
        400
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return error('File size exceeds 10MB limit', 400);
    }

    // Generate unique filename
    const timestamp = Date.now();
    const extension = file.name.split('.').pop() || 'mp3';
    const fileName = leadId
      ? `lead-${leadId}/${timestamp}.${extension}`
      : `general/${timestamp}.${extension}`;

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from(AUDIO_BUCKET)
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);

      // If bucket doesn't exist, try to create it
      if (uploadError.message?.includes('not found') || uploadError.message?.includes('does not exist')) {
        // Create the bucket
        const { error: bucketError } = await supabaseAdmin.storage.createBucket(
          AUDIO_BUCKET,
          {
            public: false,
            allowedMimeTypes: ALLOWED_TYPES,
            fileSizeLimit: MAX_FILE_SIZE,
          }
        );

        if (bucketError && !bucketError.message?.includes('already exists')) {
          console.error('Bucket creation error:', bucketError);
          return error('Failed to create storage bucket', 500);
        }

        // Retry upload after bucket creation
        const { data: retryData, error: retryError } = await supabaseAdmin.storage
          .from(AUDIO_BUCKET)
          .upload(fileName, buffer, {
            contentType: file.type,
            upsert: false,
          });

        if (retryError) {
          console.error('Retry upload error:', retryError);
          return error('Failed to upload file', 500);
        }

        // Get signed URL for the uploaded file
        const { data: signedUrlData } = await supabaseAdmin.storage
          .from(AUDIO_BUCKET)
          .createSignedUrl(retryData.path, 60 * 60 * 24 * 7); // 7 days

        return success({
          path: retryData.path,
          url: signedUrlData?.signedUrl || null,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
        });
      }

      return error('Failed to upload file', 500);
    }

    // Get signed URL for the uploaded file (7 days expiry)
    const { data: signedUrlData } = await supabaseAdmin.storage
      .from(AUDIO_BUCKET)
      .createSignedUrl(uploadData.path, 60 * 60 * 24 * 7);

    return success({
      path: uploadData.path,
      url: signedUrlData?.signedUrl || null,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
    });
  } catch (err) {
    console.error('Error uploading file:', err);
    return error('Internal server error', 500);
  }
}

// DELETE /api/upload - Delete audio file from storage
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path');

    if (!path) {
      return error('No file path provided', 400);
    }

    const { error: deleteError } = await supabaseAdmin.storage
      .from(AUDIO_BUCKET)
      .remove([path]);

    if (deleteError) {
      console.error('Delete error:', deleteError);
      return error('Failed to delete file', 500);
    }

    return success({ deleted: true, path });
  } catch (err) {
    console.error('Error deleting file:', err);
    return error('Internal server error', 500);
  }
}
