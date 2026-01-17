-- Smart Quote Images Storage Bucket
-- For hero images in Smart Quote pages

-- ============================================================================
-- Create storage bucket
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'smart-quote-images',
  'smart-quote-images',
  true,
  10485760, -- 10MB max
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Storage RLS policies
-- ============================================================================

-- Founders can upload images
CREATE POLICY smart_quote_images_upload ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'smart-quote-images' AND
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'founder')
);

-- Founders can update images
CREATE POLICY smart_quote_images_update ON storage.objects
FOR UPDATE USING (
  bucket_id = 'smart-quote-images' AND
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'founder')
);

-- Founders can delete images
CREATE POLICY smart_quote_images_delete ON storage.objects
FOR DELETE USING (
  bucket_id = 'smart-quote-images' AND
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'founder')
);

-- Public read access for all images
CREATE POLICY smart_quote_images_public_read ON storage.objects
FOR SELECT USING (bucket_id = 'smart-quote-images');
