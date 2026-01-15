-- Migration: Create call_recordings table for Telegram audio ingestion
-- Purpose: Store metadata for call recordings uploaded via Telegram

-- Create enum for processing status
CREATE TYPE call_recording_status AS ENUM (
  'pending',
  'downloading',
  'converting',
  'uploading',
  'transcribing',
  'analyzing',
  'completed',
  'failed'
);

-- Create call_recordings table
CREATE TABLE IF NOT EXISTS public.call_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Lead association (nullable if phone not matched)
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,

  -- Phone number extracted from filename
  phone_number VARCHAR(20) NOT NULL,

  -- Telegram metadata
  telegram_file_id VARCHAR(255) UNIQUE NOT NULL,
  telegram_message_id BIGINT NOT NULL,
  telegram_chat_id BIGINT NOT NULL,
  telegram_user_id BIGINT,
  original_filename VARCHAR(255) NOT NULL,

  -- Google Drive storage
  mp3_gdrive_file_id VARCHAR(255),
  mp3_gdrive_url TEXT,

  -- Transcription data
  transcription_text TEXT,
  transcription_language VARCHAR(10),
  transcription_confidence DECIMAL(3,2),

  -- AI Analysis results
  ai_summary TEXT,
  ai_insights JSONB DEFAULT '{}',
  ai_score_impact DECIMAL(3,2),

  -- Processing status
  processing_status call_recording_status DEFAULT 'pending',
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  -- Audio metadata
  duration_seconds INTEGER,
  file_size_bytes INTEGER,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,

  -- Duplicate detection
  audio_hash VARCHAR(64)
);

-- Create indexes for common queries
CREATE INDEX idx_call_recordings_phone ON public.call_recordings(phone_number);
CREATE INDEX idx_call_recordings_lead ON public.call_recordings(lead_id);
CREATE INDEX idx_call_recordings_status ON public.call_recordings(processing_status);
CREATE INDEX idx_call_recordings_created ON public.call_recordings(created_at DESC);
CREATE INDEX idx_call_recordings_hash ON public.call_recordings(audio_hash);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_call_recordings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER call_recordings_updated_at
  BEFORE UPDATE ON public.call_recordings
  FOR EACH ROW
  EXECUTE FUNCTION update_call_recordings_updated_at();

-- Row Level Security
ALTER TABLE public.call_recordings ENABLE ROW LEVEL SECURITY;

-- Founders have full access
CREATE POLICY "Founders full access to call_recordings"
  ON public.call_recordings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'founder'
    )
  );

-- Staff can view recordings for their assigned leads
CREATE POLICY "Staff view own lead recordings"
  ON public.call_recordings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.leads
      WHERE leads.id = call_recordings.lead_id
      AND (leads.assigned_staff = auth.uid() OR leads.created_by = auth.uid())
    )
  );

-- Service role has full access (for Railway worker)
CREATE POLICY "Service role full access"
  ON public.call_recordings
  FOR ALL
  USING (auth.role() = 'service_role');

-- Add comment for documentation
COMMENT ON TABLE public.call_recordings IS 'Stores metadata for call recordings uploaded via Telegram, including transcription and AI analysis results';
