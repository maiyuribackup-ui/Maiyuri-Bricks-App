/**
 * Tasks Service
 * Programmatic access to task management.
 */

import { supabase } from './supabase';

export interface CreateTaskOptions {
  title: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: string;
  leadId?: string;
  assignedTo?: string; // User ID
}

export async function createTask(options: CreateTaskOptions) {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        title: options.title,
        description: options.description,
        priority: options.priority || 'medium',
        status: 'todo',
        due_date: options.dueDate,
        lead_id: options.leadId,
        assigned_to: options.assignedTo,
      })
      .select()
      .single();

    if (error) throw error;

    return { success: true, data };
  } catch (error) {
    console.error('[Tasks Service] Error creating task:', error);
    return { success: false, error };
  }
}

export default {
  createTask,
};
