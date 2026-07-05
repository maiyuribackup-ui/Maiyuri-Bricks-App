-- ============================================================================
-- Maiyuri OneHub: SOP library, important links, new-joiner checklists.
-- Company-foundation content seeds into the existing coach_knowledge_base.
-- Writes go through service-role API routes; RLS grants authenticated reads.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.onehub_sops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department TEXT NOT NULL CHECK (department IN ('sales','production','dispatch','accounts','hr','safety')),
  slug TEXT NOT NULL UNIQUE,
  title_en TEXT NOT NULL,
  title_ta TEXT,
  purpose_en TEXT,
  purpose_ta TEXT,
  -- [{"en":"...","ta":"...","icon":"📞"}] — 5-7 visual-first steps
  steps JSONB NOT NULL DEFAULT '[]',
  warning_en TEXT,
  warning_ta TEXT,
  video_url TEXT,
  owner_id UUID REFERENCES public.users(id),
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  approved_by UUID REFERENCES public.users(id),
  rag_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_onehub_sops_department ON public.onehub_sops(department);

CREATE TABLE IF NOT EXISTS public.onehub_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  purpose TEXT,
  url TEXT NOT NULL,
  owner_id UUID REFERENCES public.users(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.onehub_checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  -- [{"phase":"Day 1","items":[{"id":"d1-1","text":"...","owner_role":"admin"}]}]
  phases JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.onehub_checklist_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.onehub_checklist_templates(id),
  subject_user_id UUID REFERENCES public.users(id),
  subject_name TEXT NOT NULL, -- joiner may not have an app account yet
  -- {"d1-1": {"done": true, "by": "<uuid>", "at": "iso"}}
  statuses JSONB NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.onehub_sops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onehub_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onehub_checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onehub_checklist_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read sops" ON public.onehub_sops FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read links" ON public.onehub_links FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read checklist templates" ON public.onehub_checklist_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read checklist runs" ON public.onehub_checklist_runs FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- SEED: 3 SOPs (EN + TA drafts — owner reviews in-app)
-- ============================================================================

INSERT INTO public.onehub_sops (department, slug, title_en, title_ta, purpose_en, purpose_ta, steps, warning_en, warning_ta, status, version)
VALUES
(
  'sales', 'new-lead-handling',
  'New Lead Handling', 'புதிய லீட் கையாளுதல்',
  'Respond fast and capture the right details the moment a new lead arrives.',
  'புதிய லீட் வந்தவுடன் விரைவாக பதிலளித்து சரியான விவரங்களை பதிவு செய்யவும்.',
  '[
    {"icon":"⚡","en":"Open the lead within 10 minutes of the push alert","ta":"புஷ் அறிவிப்பு வந்த 10 நிமிடத்திற்குள் லீடை திறக்கவும்"},
    {"icon":"📞","en":"Call the customer — introduce yourself and Maiyuri Bricks","ta":"வாடிக்கையாளரை அழையுங்கள் — உங்களையும் மையூரி பிரிக்ஸ்-ஐயும் அறிமுகம் செய்யவும்"},
    {"icon":"❓","en":"Ask four things: site location, construction type, quantity needed, timeline","ta":"நான்கு விஷயங்கள் கேளுங்கள்: இடம், கட்டுமான வகை, தேவையான அளவு, காலம்"},
    {"icon":"📝","en":"Record the answers as a note on the lead in the app","ta":"பதில்களை ஆப்பில் லீட் நோட்டாக பதிவு செய்யவும்"},
    {"icon":"🌡️","en":"Set temperature (hot/warm/cold) and the next follow-up date","ta":"லீட் நிலை (hot/warm/cold) மற்றும் அடுத்த follow-up தேதியை அமைக்கவும்"},
    {"icon":"📲","en":"Send brochure and calculator link on WhatsApp","ta":"WhatsApp-ல் brochure மற்றும் calculator link அனுப்பவும்"},
    {"icon":"🏭","en":"Invite them for a factory visit","ta":"தொழிற்சாலை பார்வைக்கு அழைக்கவும்"}
  ]'::jsonb,
  'Never quote a final price on the first call. Share the standard rate and promise a detailed estimate after understanding the site.',
  'முதல் அழைப்பில் இறுதி விலை சொல்ல வேண்டாம். நிலையான விலையை பகிர்ந்து, இடத்தை புரிந்த பிறகு விரிவான மதிப்பீடு தருவதாக சொல்லுங்கள்.',
  'published', 1
),
(
  'sales', 'factory-visit',
  'Factory Visit', 'தொழிற்சாலை பார்வை',
  'Convert visitors by showing proof: process, strength, and honest pricing.',
  'செயல்முறை, வலிமை, நேர்மையான விலை — இவற்றை காட்டி பார்வையாளர்களை வாடிக்கையாளர்களாக மாற்றுங்கள்.',
  '[
    {"icon":"📅","en":"Confirm the visit one day before — call plus WhatsApp","ta":"பார்வைக்கு முதல் நாள் உறுதி செய்யவும் — அழைப்பு மற்றும் WhatsApp"},
    {"icon":"🧱","en":"Keep ready: sample bricks, water test, demo wall","ta":"தயாராக வைக்கவும்: மாதிரி செங்கல், தண்ணீர் சோதனை, டெமோ சுவர்"},
    {"icon":"🤝","en":"Welcome them, offer water/tea, share the 5-minute Maiyuri story","ta":"வரவேற்று, தண்ணீர்/தேநீர் கொடுத்து, 5 நிமிட மையூரி கதையை சொல்லுங்கள்"},
    {"icon":"⚙️","en":"Show the full process — from red soil to finished interlock brick","ta":"முழு செயல்முறையை காட்டுங்கள் — செம்மண்ணிலிருந்து முடிக்கப்பட்ட இன்டர்லாக் செங்கல் வரை"},
    {"icon":"💪","en":"Demonstrate strength: locking, load bearing, water absorption comparison","ta":"வலிமையை நிரூபிக்கவும்: லாக்கிங், சுமை தாங்குதல், தண்ணீர் உறிஞ்சுதல் ஒப்பீடு"},
    {"icon":"🧮","en":"Explain price WITH transport for their site using the calculator","ta":"Calculator மூலம் அவர்களின் இடத்திற்கு போக்குவரத்து உட்பட விலையை விளக்குங்கள்"},
    {"icon":"✅","en":"Before they leave: agree the next step and record it in the app","ta":"அவர்கள் செல்லும் முன்: அடுத்த நடவடிக்கையை முடிவு செய்து ஆப்பில் பதிவு செய்யவும்"}
  ]'::jsonb,
  'Never let a visitor leave without a recorded next step (quote, booking, or follow-up date).',
  'அடுத்த நடவடிக்கை பதிவு செய்யாமல் எந்த பார்வையாளரையும் அனுப்ப வேண்டாம்.',
  'published', 1
),
(
  'production', 'daily-production-planning',
  'Daily Production Planning', 'தினசரி உற்பத்தி திட்டமிடல்',
  'Plan production from confirmed orders so curing, stock and deliveries stay on schedule.',
  'உறுதிசெய்யப்பட்ட ஆர்டர்களின் அடிப்படையில் உற்பத்தியை திட்டமிடுங்கள்.',
  '[
    {"icon":"📋","en":"Every evening, open the Plan tab in the Maiyuri app","ta":"ஒவ்வொரு மாலையும் மையூரி ஆப்பில் Plan டேபை திறக்கவும்"},
    {"icon":"🔄","en":"Tap Sync Odoo to load confirmed sales orders","ta":"உறுதிசெய்யப்பட்ட ஆர்டர்களை ஏற்ற Sync Odoo-ஐ தட்டவும்"},
    {"icon":"☑️","en":"Select the orders to prioritise; type any constraints (machine service, leave)","ta":"முன்னுரிமை ஆர்டர்களை தேர்வு செய்யவும்; தடைகள் இருந்தால் எழுதவும்"},
    {"icon":"⚡","en":"Tap Generate Plan and review: quantities, curing days, delivery dates","ta":"Generate Plan தட்டி சரிபார்க்கவும்: அளவுகள், க்யூரிங் நாட்கள், டெலிவரி தேதிகள்"},
    {"icon":"✅","en":"Activate the plan — supervisors and drivers get tomorrow''s plan at 9 PM automatically","ta":"திட்டத்தை Activate செய்யவும் — நாளைய திட்டம் இரவு 9 மணிக்கு தானாக அனுப்பப்படும்"},
    {"icon":"🏭","en":"Next day, report actual production in the Production tab by evening","ta":"மறுநாள் மாலைக்குள் உண்மையான உற்பத்தியை Production டேபில் பதிவு செய்யவும்"},
    {"icon":"📊","en":"Check Variance weekly; discuss gaps in the Saturday review","ta":"வாரந்தோறும் Variance பார்க்கவும்; சனிக்கிழமை மீட்டிங்கில் இடைவெளிகளை பேசவும்"}
  ]'::jsonb,
  'Do not produce items that are not in the plan without informing the founder — it blocks curing space and working capital.',
  'திட்டத்தில் இல்லாத பொருட்களை நிறுவனர் அனுமதியின்றி உற்பத்தி செய்ய வேண்டாம்.',
  'published', 1
)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- SEED: New Joiners checklist template (spec section 3)
-- ============================================================================

INSERT INTO public.onehub_checklist_templates (name, phases)
SELECT 'New Joiners Checklist', '[
  {"phase":"Before Joining","items":[
    {"id":"bj-1","text":"Offer letter issued","owner_role":"accountant"},
    {"id":"bj-2","text":"ID proof collected","owner_role":"accountant"},
    {"id":"bj-3","text":"Bank details collected","owner_role":"accountant"},
    {"id":"bj-4","text":"Role explained","owner_role":"founder"},
    {"id":"bj-5","text":"Joining date confirmed","owner_role":"accountant"}
  ]},
  {"phase":"Day 1","items":[
    {"id":"d1-1","text":"Factory introduction","owner_role":"production_supervisor"},
    {"id":"d1-2","text":"Safety briefing","owner_role":"production_supervisor"},
    {"id":"d1-3","text":"Role explanation","owner_role":"founder"},
    {"id":"d1-4","text":"WhatsApp groups added","owner_role":"accountant"},
    {"id":"d1-5","text":"App / Odoo login access given","owner_role":"accountant"},
    {"id":"d1-6","text":"Daily reporting format explained","owner_role":"founder"}
  ]},
  {"phase":"First 7 Days","items":[
    {"id":"w1-1","text":"Product training completed","owner_role":"sales"},
    {"id":"w1-2","text":"Production process observed","owner_role":"production_supervisor"},
    {"id":"w1-3","text":"Customer handling training","owner_role":"sales"},
    {"id":"w1-4","text":"Odoo basic update training","owner_role":"accountant"},
    {"id":"w1-5","text":"Daily report submitted for 5 days","owner_role":"founder"}
  ]},
  {"phase":"First 30 Days","items":[
    {"id":"m1-1","text":"Can independently perform role","owner_role":"founder"},
    {"id":"m1-2","text":"SOPs understood","owner_role":"founder"},
    {"id":"m1-3","text":"Mistakes reviewed","owner_role":"founder"},
    {"id":"m1-4","text":"Performance feedback given","owner_role":"founder"},
    {"id":"m1-5","text":"Probation continuation decision","owner_role":"founder"}
  ]}
]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.onehub_checklist_templates WHERE name = 'New Joiners Checklist');

-- ============================================================================
-- SEED: base links (user fills in the rest from the app)
-- ============================================================================

INSERT INTO public.onehub_links (category, name, purpose, url, sort_order)
SELECT * FROM (VALUES
  ('Operations', 'Maiyuri App', 'Leads, planning, production, deliveries', 'https://mb.maiyuri.com', 1),
  ('Operations', 'Odoo ERP', 'Orders, invoices, inventory', 'https://crm.maiyuri.com', 2),
  ('Sales', 'Brochure', 'Share with customers on WhatsApp (add link)', 'https://', 10),
  ('Sales', 'Brick Calculator', 'Estimate quantity for customer site (add link)', 'https://', 11),
  ('Marketing', 'Instagram', 'Add link', 'https://', 20),
  ('Marketing', 'YouTube', 'Add link', 'https://', 21),
  ('Marketing', 'Google Reviews', 'Add link', 'https://', 22)
) AS v(category, name, purpose, url, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.onehub_links);

-- ============================================================================
-- SEED: Company Foundation → existing coach_knowledge_base (culture brain)
-- ============================================================================

INSERT INTO public.coach_knowledge_base (slug, category, title, content, tags, is_active)
VALUES
(
  'onehub-brand-promise', 'brand_story', 'Maiyuri Brand Promise',
  'நம் மண். நம் வீடு. நம் அறிவு. (Our soil. Our home. Our wisdom.) Maiyuri Bricks exists to bring back red-soil wisdom with modern engineering: smart interlock bricks that build cooler, stronger, more honest homes for our community.',
  ARRAY['brand','promise','culture'], true
),
(
  'onehub-product-philosophy', 'product', 'Product Philosophy',
  'Smart interlock bricks made from local red soil. Interlocking design reduces cement use and builds faster. Red soil keeps homes naturally cooler. Every brick is cured properly before dispatch — quality over speed, always.',
  ARRAY['product','philosophy'], true
),
(
  'onehub-differentiators', 'kerala_comparison', 'Why Maiyuri vs Kerala mud bricks / regular bricks',
  'Kerala mud interlock bricks are often cheaper but travel far, crack in transit, and quality varies batch to batch. Maiyuri bricks are made locally with tested red soil, machine compaction, proper curing, and we stand behind every delivery with proof photos and after-delivery support. Regular red bricks need more cement, more labour and build slower walls that hold more heat.',
  ARRAY['comparison','kerala','objection'], true
)
ON CONFLICT (slug) DO NOTHING;
