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
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card } from '@maiyuri/ui';
import { type Lead, type LeadStatus } from '@maiyuri/shared';
import { formatDistanceToNow } from 'date-fns';

// ============================================================================
// CONSTANTS
// ============================================================================

const COLUMNS: { id: LeadStatus; title: string; color: string }[] = [
    { id: 'new', title: 'New', color: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' },
    { id: 'follow_up', title: 'Follow Up', color: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' },
    { id: 'hot', title: 'Hot', color: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' },
    { id: 'cold', title: 'Cold', color: 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700' },
    { id: 'converted', title: 'Converted', color: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' },
    { id: 'lost', title: 'Lost', color: 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800' },
];

interface LeadsKanbanProps {
    leads: Lead[];
    onStatusChange: (leadId: string, newStatus: LeadStatus) => void;
    onLeadClick: (id: string) => void;
}

export function LeadsKanban({ leads, onStatusChange, onLeadClick }: LeadsKanbanProps) {
    const [activeId, setActiveId] = React.useState<string | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const columns = useMemo(() => {
        const cols = COLUMNS.map(c => ({ ...c, leads: [] as Lead[] }));
        leads.forEach(lead => {
            const col = cols.find(c => c.id === lead.status);
            if (col) col.leads.push(lead);
        });
        return cols;
    }, [leads]);

    const activeLead = useMemo(() => leads.find(l => l.id === activeId), [leads, activeId]);

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);

        if (!over) return;

        const leadId = active.id as string;
        const overId = over.id as string;

        // Determine target column
        // 'over.id' could be a column ID (e.g., 'new') or a lead ID in that column
        let newStatus: LeadStatus | null = null;

        // Check if dropped directly on a column
        if (COLUMNS.some(c => c.id === overId)) {
            newStatus = overId as LeadStatus;
        } else {
            // Dropped on another card, find that card's status
            const overLead = leads.find(l => l.id === overId);
            if (overLead) {
                newStatus = overLead.status;
            }
        }

        if (newStatus && activeLead && activeLead.status !== newStatus) {
            onStatusChange(leadId, newStatus);
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
                        {/* Column Header */}
                        <div className={`flex items-center justify-between px-4 py-3 rounded-xl border ${column.color} backdrop-blur-sm`}>
                            <span className="font-semibold text-sm text-slate-700 dark:text-slate-200">{column.title}</span>
                            <span className="bg-white/50 dark:bg-black/20 text-slate-600 dark:text-slate-400 text-xs font-bold px-2 py-0.5 rounded-full">
                                {column.leads.length}
                            </span>
                        </div>

                        {/* Droppable Column Area */}
                        <SortableContext
                            id={column.id}
                            items={column.leads.map(l => l.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            <div
                                className="flex-1 overflow-y-auto p-1 space-y-3"
                                // This ID is crucial for detecting drop on empty column
                                data-id={column.id}
                            >
                                {/* Empty state or list */}
                                {column.leads.length === 0 && (
                                    <KanbanDropZone columnId={column.id} />
                                )}

                                {column.leads.map((lead) => (
                                    <KanbanCard key={lead.id} lead={lead} onClick={() => onLeadClick(lead.id)} />
                                ))}
                            </div>
                        </SortableContext>
                    </div>
                ))}
            </div>

            <DragOverlay>
                {activeLead ? <KanbanCard lead={activeLead} isOverlay /> : null}
            </DragOverlay>
        </DndContext>
    );
}

// ============================================================================
// SUBCOMPONENTS
// ============================================================================

function KanbanDropZone({ columnId }: { columnId: string }) {
    const { setNodeRef } = useSortable({ id: columnId });
    return (
        <div ref={setNodeRef} className="h-full min-h-[150px] border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-center text-slate-400 text-sm">
            Drop here
        </div>
    );
}

function KanbanCard({ lead, isOverlay, onClick }: { lead: Lead; isOverlay?: boolean; onClick?: () => void }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: lead.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

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
                <h4 className="font-medium text-slate-900 dark:text-white truncate pr-2">{lead.name}</h4>
                {lead.ai_score && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${lead.ai_score >= 0.7 ? 'bg-green-100 text-green-700' :
                            lead.ai_score >= 0.4 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                        }`}>
                        {Math.round(lead.ai_score * 100)}%
                    </span>
                )}
            </div>

            <div className="text-xs text-slate-500 mb-2 truncate">
                {lead.contact}
            </div>

            <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-400">
                <span>{formatDistanceToNow(new Date(lead.updated_at), { addSuffix: true })}</span>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="hover:text-blue-600">Open</button>
                </div>
            </div>
        </div>
    );
}
