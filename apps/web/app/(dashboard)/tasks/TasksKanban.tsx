'use client';

import React, { useMemo } from 'react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
    type DragEndEvent,
    type DragStartEvent,
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { type Task, type TaskStatus } from '@maiyuri/shared';
import { formatDistanceToNow } from 'date-fns';

// ============================================================================
// CONSTANTS
// ============================================================================

const COLUMNS: { id: TaskStatus; title: string; color: string }[] = [
    { id: 'todo', title: 'To Do', color: 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700' },
    { id: 'in_progress', title: 'In Progress', color: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' },
    { id: 'review', title: 'Review', color: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' },
    { id: 'done', title: 'Done', color: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' },
];

interface TasksKanbanProps {
    tasks: Task[];
    onStatusChange: (taskId: string, newStatus: TaskStatus) => void;
    onTaskClick: (task: Task) => void;
}

export function TasksKanban({ tasks, onStatusChange, onTaskClick }: TasksKanbanProps) {
    const [activeId, setActiveId] = React.useState<string | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const columns = useMemo(() => {
        const cols = COLUMNS.map(c => ({ ...c, tasks: [] as Task[] }));
        tasks.forEach(task => {
            const col = cols.find(c => c.id === task.status);
            if (col) col.tasks.push(task);
        });
        return cols;
    }, [tasks]);

    const activeTask = useMemo(() => tasks.find(t => t.id === activeId), [tasks, activeId]);

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);

        if (!over) return;

        const taskId = active.id as string;
        const overId = over.id as string;

        let newStatus: TaskStatus | null = null;

        if (COLUMNS.some(c => c.id === overId)) {
            newStatus = overId as TaskStatus;
        } else {
            const overTask = tasks.find(t => t.id === overId);
            if (overTask) {
                newStatus = overTask.status;
            }
        }

        if (newStatus && activeTask && activeTask.status !== newStatus) {
            onStatusChange(taskId, newStatus);
        }
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <div className="flex h-[calc(100vh-14rem)] overflow-x-auto gap-4 pb-4">
                {columns.map((column) => (
                    <div key={column.id} className="flex-shrink-0 w-80 flex flex-col gap-3">
                        <div className={`flex items-center justify-between px-4 py-3 rounded-xl border ${column.color} backdrop-blur-sm`}>
                            <span className="font-semibold text-sm text-slate-700 dark:text-slate-200">{column.title}</span>
                            <span className="bg-white/50 dark:bg-black/20 text-slate-600 dark:text-slate-400 text-xs font-bold px-2 py-0.5 rounded-full">
                                {column.tasks.length}
                            </span>
                        </div>

                        <SortableContext
                            id={column.id}
                            items={column.tasks.map(t => t.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            <div
                                className="flex-1 overflow-y-auto p-1 space-y-3"
                                data-id={column.id}
                            >
                                {column.tasks.length === 0 && (
                                    <KanbanDropZone columnId={column.id} />
                                )}

                                {column.tasks.map((task) => (
                                    <KanbanCard key={task.id} task={task} onClick={() => onTaskClick(task)} />
                                ))}
                            </div>
                        </SortableContext>
                    </div>
                ))}
            </div>

            <DragOverlay>
                {activeTask ? <KanbanCard task={activeTask} isOverlay /> : null}
            </DragOverlay>
        </DndContext>
    );
}

function KanbanDropZone({ columnId }: { columnId: string }) {
    const { setNodeRef } = useSortable({ id: columnId });
    return (
        <div ref={setNodeRef} className="h-full min-h-[150px] border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-center text-slate-400 text-sm">
            Drop here
        </div>
    );
}

function KanbanCard({ task, isOverlay, onClick }: { task: Task; isOverlay?: boolean; onClick?: () => void }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: task.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const priorityColor = {
        low: 'text-slate-500 bg-slate-100',
        medium: 'text-blue-600 bg-blue-50',
        high: 'text-amber-600 bg-amber-50',
        urgent: 'text-red-600 bg-red-50'
    }[task.priority] || 'text-slate-500 bg-slate-100';

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            onClick={onClick}
            className={`
        bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 cursor-grab active:cursor-grabbing group hover:shadow-md transition-all
        ${isDragging ? 'opacity-30' : 'opacity-100'}
        ${isOverlay ? 'scale-105 shadow-xl rotate-2 cursor-grabbing z-50' : ''}
      `}
        >
            <div className="flex justify-between items-start mb-2">
                <h4 className="font-medium text-slate-900 dark:text-white line-clamp-2 pr-2">{task.title}</h4>
                <div className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${priorityColor}`}>
                    {task.priority}
                </div>
            </div>

            {task.description && (
                <p className="text-xs text-slate-500 mb-3 line-clamp-2">{task.description}</p>
            )}

            {task.assignee && (
                <div className="flex items-center gap-2 mb-3">
                    <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] text-indigo-700 font-bold">
                        {task.assignee.name.charAt(0)}
                    </div>
                    <span className="text-xs text-slate-600 dark:text-slate-400">{task.assignee.name}</span>
                </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-400">
                <span className={task.due_date && new Date(task.due_date) < new Date() ? 'text-red-500 font-medium' : ''}>
                    {task.due_date ? new Date(task.due_date).toLocaleDateString() : 'No due date'}
                </span>
            </div>
        </div>
    );
}
