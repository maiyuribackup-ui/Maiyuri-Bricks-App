// Zod validation schemas

import { z } from 'zod';

export const leadStatusSchema = z.enum(['new', 'follow_up', 'hot', 'cold', 'converted', 'lost']);

export const userRoleSchema = z.enum(['founder', 'accountant', 'engineer']);

export const createLeadSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  contact: z.string().min(10, 'Valid contact number required'),
  source: z.string().min(1, 'Source is required'),
  lead_type: z.string().min(1, 'Lead type is required'),
  assigned_staff: z.string().uuid('Invalid staff ID'),
  status: leadStatusSchema.default('new'),
});

export const createNoteSchema = z.object({
  lead_id: z.string().uuid('Invalid lead ID'),
  text: z.string().min(1, 'Note text is required'),
  audio_url: z.string().url().optional(),
});

export const updateLeadStatusSchema = z.object({
  status: leadStatusSchema,
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateLeadStatusInput = z.infer<typeof updateLeadStatusSchema>;
