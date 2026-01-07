// Zod validation schemas

import { z } from 'zod';

export const leadStatusSchema = z.enum(['new', 'follow_up', 'hot', 'cold', 'converted', 'lost']);

export const userRoleSchema = z.enum(['founder', 'accountant', 'engineer']);

export const createLeadSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  contact: z.string().min(10, 'Valid contact number required'),
  source: z.string().min(1, 'Source is required'),
  lead_type: z.string().min(1, 'Lead type is required'),
  assigned_staff: z.string().uuid('Invalid staff ID').nullable().optional(),
  status: leadStatusSchema.default('new'),
  next_action: z.string().nullable().optional(),
  follow_up_date: z.string().nullable().optional(),
  is_archived: z.boolean().default(false).optional(),
});

export const updateLeadSchema = z.object({
  name: z.string().min(1).optional(),
  contact: z.string().min(10).optional(),
  source: z.string().min(1).optional(),
  lead_type: z.string().min(1).optional(),
  assigned_staff: z.string().uuid().nullable().optional(),
  status: leadStatusSchema.optional(),
  next_action: z.string().nullable().optional(),
  follow_up_date: z.string().nullable().optional(),
  is_archived: z.boolean().optional(),
});

export const createNoteSchema = z.object({
  lead_id: z.string().uuid('Invalid lead ID'),
  text: z.string().min(1, 'Note text is required'),
  audio_url: z.string().url().optional(),
});

export const updateLeadStatusSchema = z.object({
  status: leadStatusSchema,
});

export const updateNoteSchema = z.object({
  text: z.string().min(1).optional(),
  audio_url: z.string().url().nullable().optional(),
  transcription_text: z.string().nullable().optional(),
  ai_summary: z.string().nullable().optional(),
});

export const createKnowledgebaseSchema = z.object({
  question_text: z.string().min(1, 'Question is required'),
  answer_text: z.string().min(1, 'Answer is required'),
  confidence_score: z.number().min(0).max(1).default(0.5),
  source_lead_id: z.string().uuid().nullable().optional(),
});

// Query params schemas
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const leadFiltersSchema = z.object({
  status: leadStatusSchema.optional(),
  assigned_staff: z.string().uuid().optional(),
  search: z.string().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  is_archived: z.string().transform(val => val === 'true').optional(),
});

export const createTaskSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  status: z.enum(['todo', 'in_progress', 'review', 'done']).default('todo'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  due_date: z.string().optional(), // ISO string
  assigned_to: z.string().uuid().optional(),
  lead_id: z.string().uuid().optional(),
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  id: z.string().uuid(),
});

export const taskFiltersSchema = z.object({
  status: z.enum(['todo', 'in_progress', 'review', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  assigned_to: z.string().uuid().optional(),
  lead_id: z.string().uuid().optional(),
});

// Export types
export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
export type UpdateLeadStatusInput = z.infer<typeof updateLeadStatusSchema>;
export type CreateKnowledgebaseInput = z.infer<typeof createKnowledgebaseSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type LeadFiltersInput = z.infer<typeof leadFiltersSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type TaskFiltersInput = z.infer<typeof taskFiltersSchema>;

