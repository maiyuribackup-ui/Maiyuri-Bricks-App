CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id UUID PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql AS $$ SELECT NULL::uuid $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT LANGUAGE sql AS $$ SELECT 'authenticated'::text $$;
CREATE TABLE public.users (
  id UUID PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('founder','accountant','engineer','production_supervisor','owner','driver','sales')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL);
CREATE OR REPLACE FUNCTION public.update_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, phone TEXT,
  pipeline_stage TEXT NOT NULL DEFAULT 'new_inquiry', lead_status TEXT NOT NULL DEFAULT 'new_contact_pending',
  assigned_staff UUID REFERENCES public.users(id), next_action TEXT, follow_up_date DATE,
  odoo_lead_id INTEGER, odoo_quote_id INTEGER, odoo_order_id INTEGER, odoo_order_number TEXT,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE public.projects (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT);
CREATE TABLE public.finished_goods (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT, stock_qty NUMERIC, stock_synced_at TIMESTAMPTZ, is_active BOOLEAN DEFAULT true);
CREATE TABLE public.notes (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), lead_id UUID, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE public.call_recordings (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), lead_id UUID, created_at TIMESTAMPTZ DEFAULT now());
