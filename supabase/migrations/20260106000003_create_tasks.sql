-- Create tasks table
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK (status IN ('todo', 'in_progress', 'review', 'done')) DEFAULT 'todo',
  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
  due_date TIMESTAMPTZ,
  assigned_to UUID REFERENCES public.users(id),
  created_by UUID REFERENCES auth.users(id) DEFAULT auth.uid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Policies

-- Everyone can view tasks (for transparency)
CREATE POLICY "Users can view all tasks" ON public.tasks
  FOR SELECT USING (auth.role() = 'authenticated');

-- Authenticated users can create tasks
CREATE POLICY "Users can create tasks" ON public.tasks
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Users can update tasks (simplified: any auth user can update any task for collaboration)
-- In a stricter system, you might limit this to creator or assignee.
CREATE POLICY "Users can update tasks" ON public.tasks
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Users can delete tasks they created
CREATE POLICY "Creators can delete their tasks" ON public.tasks
  FOR DELETE USING (auth.uid() = created_by);

-- Create indexes
CREATE INDEX idx_tasks_assigned_to ON public.tasks(assigned_to);
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_tasks_lead_id ON public.tasks(lead_id);
