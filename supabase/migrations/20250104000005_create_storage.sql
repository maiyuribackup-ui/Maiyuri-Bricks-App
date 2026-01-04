-- Create storage bucket for audio files
INSERT INTO storage.buckets (id, name, public)
VALUES ('audio', 'audio', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload audio
CREATE POLICY "Authenticated users can upload audio" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'audio'
    AND auth.role() = 'authenticated'
  );

-- Allow users to read their own audio files
CREATE POLICY "Users can read audio files" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'audio'
    AND auth.role() = 'authenticated'
  );

-- Allow users to delete their own audio files
CREATE POLICY "Users can delete own audio files" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'audio'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
