-- Create storage bucket for floor plan outputs (CAD files, renders, etc.)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'floor-plans',
  'floor-plans',
  false, -- Private bucket
  52428800, -- 50MB limit
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/svg+xml',
    'application/dxf',
    'application/octet-stream', -- For DXF files
    'application/json'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload floor plans
CREATE POLICY "Authenticated users can upload floor plans" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'floor-plans'
    AND auth.role() = 'authenticated'
  );

-- Allow users to read floor plans (with RLS)
CREATE POLICY "Users can read floor plans" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'floor-plans'
    AND auth.role() = 'authenticated'
  );

-- Allow users to update their own floor plans
CREATE POLICY "Users can update own floor plans" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'floor-plans'
    AND auth.role() = 'authenticated'
  );

-- Allow users to delete their own floor plans
CREATE POLICY "Users can delete own floor plans" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'floor-plans'
    AND auth.role() = 'authenticated'
  );
