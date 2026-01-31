'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Button } from '@maiyuri/ui';
import { toast } from 'sonner';
import { useEffect } from 'react';
import { createTaskSchema, type CreateTaskInput, type Task, type User } from '@maiyuri/shared';

interface CreateTaskDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initialData?: Task | null;
}

async function fetchUsers(): Promise<User[]> {
    const res = await fetch('/api/users');
    if (!res.ok) throw new Error('Failed to fetch users');
    const json = await res.json();
    return json.data || [];
}

export function CreateTaskDialog({ open, onOpenChange, initialData }: CreateTaskDialogProps) {
    const queryClient = useQueryClient();
    const isEdit = !!initialData;

    // Fetch users for assignment dropdown
    const { data: users = [], isLoading: usersLoading } = useQuery({
        queryKey: ['users'],
        queryFn: fetchUsers,
        staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    });
    const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<CreateTaskInput>({
        resolver: zodResolver(createTaskSchema),
        defaultValues: initialData ? {
            title: initialData.title,
            description: initialData.description || '',
            priority: initialData.priority,
            status: initialData.status,
            due_date: initialData.due_date ? new Date(initialData.due_date).toISOString().split('T')[0] : '',
            assigned_to: initialData.assigned_to || '',
        } : {
            status: 'todo',
            priority: 'medium',
        }
    });

    // Reset when open changes or initialData changes
    // useEffect(() => { if (open && initialData) reset(...) }, [open, initialData]); 
    // Simplified: relying on key prop in parent or manual reset.
    // Better: use useEffect to reset form when initialData changes.


    useEffect(() => {
        if (open) {
            reset(initialData ? {
                title: initialData.title,
                description: initialData.description || '',
                priority: initialData.priority,
                status: initialData.status,
                due_date: initialData.due_date ? new Date(initialData.due_date).toISOString().split('T')[0] : '',
                assigned_to: initialData.assigned_to || '',
            } : {
                status: 'todo',
                priority: 'medium',
                title: '',
                description: '',
                due_date: '',
                assigned_to: '',
            });
        }
    }, [open, initialData, reset]);

    const mutation = useMutation({
        mutationFn: async (data: CreateTaskInput) => {
            const url = isEdit ? `/api/tasks/${initialData.id}` : '/api/tasks';
            const method = isEdit ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error(isEdit ? 'Failed to update task' : 'Failed to create task');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
            toast.success(isEdit ? 'Task updated' : 'Task created');
            reset();
            onOpenChange(false);
        },
        onError: () => toast.error(isEdit ? 'Failed to update task' : 'Failed to create task'),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>{isEdit ? 'Edit Task' : 'Create New Task'}</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Title</label>
                        <input
                            {...register('title')}
                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="e.g., Site Visit to Poonamallee"
                        />
                        {errors.title && <p className="text-xs text-red-500">{errors.title.message}</p>}
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Description</label>
                        <textarea
                            {...register('description')}
                            rows={3}
                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Add details about the task..."
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Priority</label>
                            <select
                                {...register('priority')}
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                            >
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                                <option value="urgent">Urgent</option>
                            </select>
                        </div>
                        {isEdit && (
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Status</label>
                                <select
                                    {...register('status')}
                                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                >
                                    <option value="todo">To Do</option>
                                    <option value="in_progress">In Progress</option>
                                    <option value="review">Review</option>
                                    <option value="done">Done</option>
                                </select>
                            </div>
                        )}
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Due Date</label>
                            <input
                                type="date"
                                {...register('due_date')}
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                            />
                        </div>
                    </div>

                    {/* Assignee Selection */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Assign To</label>
                        <select
                            {...register('assigned_to')}
                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                            disabled={usersLoading}
                        >
                            <option value="">
                                {usersLoading ? 'Loading team members...' : 'Select team member'}
                            </option>
                            {users.map((user) => (
                                <option key={user.id} value={user.id}>
                                    {user.name} ({user.role})
                                </option>
                            ))}
                        </select>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? <Spinner size="sm" /> : (isEdit ? 'Save Changes' : 'Create Task')}
                        </Button>
                    </DialogFooter>
                </form>

            </DialogContent>
        </Dialog>
    );
}

// Helper (Assuming Spinner is available, otherwise mock)
import { Spinner } from '@maiyuri/ui';
