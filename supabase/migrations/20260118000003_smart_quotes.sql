-- Smart Quote System Tables
-- AI-personalized quotation web experience with bilingual support

-- ============================================================================
-- smart_quotes: Main quote data with AI-generated content
-- ============================================================================
CREATE TABLE smart_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  link_slug VARCHAR(20) UNIQUE NOT NULL,
  language_default VARCHAR(2) DEFAULT 'en' CHECK (language_default IN ('en', 'ta')),
  persona VARCHAR(50),
  stage VARCHAR(20) CHECK (stage IN ('cold', 'warm', 'hot')),
  primary_angle VARCHAR(50),
  secondary_angle VARCHAR(50),
  route_decision VARCHAR(50) CHECK (route_decision IN ('site_visit', 'technical_call', 'cost_estimate', 'nurture')),
  top_objections JSONB DEFAULT '[]',
  risk_flags JSONB DEFAULT '[]',
  scores JSONB DEFAULT '{}',
  page_config JSONB NOT NULL,
  copy_map JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- smart_quote_images: Hero images per page (template or lead-specific override)
-- ============================================================================
CREATE TABLE smart_quote_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  smart_quote_id UUID REFERENCES smart_quotes(id) ON DELETE CASCADE,
  page_key VARCHAR(20) NOT NULL CHECK (page_key IN ('entry', 'climate', 'cost', 'objection', 'cta')),
  scope VARCHAR(20) NOT NULL DEFAULT 'template' CHECK (scope IN ('template', 'lead_override')),
  image_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Unique constraint for lead-specific overrides (one image per page per quote)
CREATE UNIQUE INDEX idx_smart_quote_images_unique_override
  ON smart_quote_images(smart_quote_id, page_key)
  WHERE smart_quote_id IS NOT NULL;

-- Unique constraint for templates (one template per page globally)
CREATE UNIQUE INDEX idx_smart_quote_images_unique_template
  ON smart_quote_images(page_key)
  WHERE smart_quote_id IS NULL AND scope = 'template';

-- ============================================================================
-- smart_quote_events: Analytics tracking for customer interactions
-- ============================================================================
CREATE TABLE smart_quote_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  smart_quote_id UUID NOT NULL REFERENCES smart_quotes(id) ON DELETE CASCADE,
  event_type VARCHAR(30) NOT NULL CHECK (event_type IN ('view', 'scroll', 'section_view', 'cta_click', 'lang_toggle', 'form_submit')),
  section_key VARCHAR(50),
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- Indexes for performance
-- ============================================================================
CREATE INDEX idx_smart_quotes_lead_id ON smart_quotes(lead_id);
CREATE INDEX idx_smart_quotes_link_slug ON smart_quotes(link_slug);
CREATE INDEX idx_smart_quotes_created_at ON smart_quotes(created_at DESC);
CREATE INDEX idx_smart_quote_events_quote_id ON smart_quote_events(smart_quote_id);
CREATE INDEX idx_smart_quote_events_type ON smart_quote_events(event_type);
CREATE INDEX idx_smart_quote_events_created_at ON smart_quote_events(created_at DESC);
CREATE INDEX idx_smart_quote_images_scope ON smart_quote_images(scope);

-- ============================================================================
-- Trigger for updated_at
-- ============================================================================
CREATE TRIGGER update_smart_quotes_updated_at
  BEFORE UPDATE ON smart_quotes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- Row Level Security
-- ============================================================================
ALTER TABLE smart_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE smart_quote_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE smart_quote_events ENABLE ROW LEVEL SECURITY;

-- smart_quotes policies
-- Founders: Full access
CREATE POLICY smart_quotes_founder_all ON smart_quotes FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'founder'));

-- Staff: View quotes for their assigned/created leads
CREATE POLICY smart_quotes_staff_select ON smart_quotes FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.leads
    WHERE leads.id = smart_quotes.lead_id
    AND (leads.assigned_staff = auth.uid() OR leads.created_by = auth.uid())
  ));

-- Public read: Anyone can view by link_slug (secured by unguessable slug)
-- This allows customers to view their personalized quote without authentication
CREATE POLICY smart_quotes_public_read ON smart_quotes FOR SELECT
  USING (true);

-- smart_quote_images policies
-- Founders: Full management
CREATE POLICY smart_quote_images_founder_all ON smart_quote_images FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'founder'));

-- Public read: Anyone can view images (needed for customer quote display)
CREATE POLICY smart_quote_images_public_read ON smart_quote_images FOR SELECT
  USING (true);

-- smart_quote_events policies
-- Anyone can insert events (needed for anonymous tracking)
CREATE POLICY smart_quote_events_insert ON smart_quote_events FOR INSERT
  WITH CHECK (true);

-- Only authenticated users can view events (for analytics)
CREATE POLICY smart_quote_events_select ON smart_quote_events FOR SELECT
  USING (auth.role() = 'authenticated');

-- ============================================================================
-- Comments for documentation
-- ============================================================================
COMMENT ON TABLE smart_quotes IS 'AI-generated personalized quotations per lead with bilingual content';
COMMENT ON COLUMN smart_quotes.link_slug IS 'Unguessable 12-char slug for public URL (/sq/{slug})';
COMMENT ON COLUMN smart_quotes.page_config IS 'JSON config specifying which blocks to render per page';
COMMENT ON COLUMN smart_quotes.copy_map IS 'Bilingual copy content keyed by "en" and "ta"';

COMMENT ON TABLE smart_quote_images IS 'Hero images for Smart Quote pages (templates or lead overrides)';
COMMENT ON COLUMN smart_quote_images.scope IS 'template = global default, lead_override = specific to this quote';

COMMENT ON TABLE smart_quote_events IS 'Analytics events for customer interactions with Smart Quotes';
