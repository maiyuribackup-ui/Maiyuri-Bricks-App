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
import { type Lead, type PipelineStage } from '@maiyuri/shared';
import { PIPELINE_STAGES, LEAD_TEMPERATURE_MAP } from '@/lib/lead-taxonomy';

// Format date as DD/MM/YYYY
function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Kanban columns = the V2 sales pipeline (8 stages)
const COLUMNS: { id: PipelineStage; title: string; color: string }[] =
    PIPELINE_STAGES.map((s) => ({
        id: s.value,
        title: `${s.emoji} ${s.label}`,
        color: `${s.bg} border-slate-200 dark:border-slate-700`,
    }));

interface LeadsKanbanProps {
    leads: Lead[];
    onStageChange: (leadId: string, newStage: PipelineStage) => void;
    onLeadClick: (id: string) => void;
}

export function LeadsKanban({ leads, onStageChange, onLeadClick }: LeadsKanbanProps) {
    const [activeId, setActiveId] = React.useState<string | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const columns = useMemo(() => {
        const cols = COLUMNS.map(c => ({ ...c, leads: [] as Lead[] }));
        leads.forEach(lead => {
            const col = cols.find(c => c.id === lead.pipeline_stage);
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

        // Determine target column ('over.id' is a column ID or a lead ID within it)
        let newStage: PipelineStage | null = null;

        if (COLUMNS.some(c => c.id === overId)) {
            newStage = overId as PipelineStage;
        } else {
            const overLead = leads.find(l => l.id === overId);
            if (overLead) {
                newStage = overLead.pipeline_stage;
            }
        }

        if (newStage && activeLead && activeLead.pipeline_stage !== newStage) {
            onStageChange(leadId, newStage);
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
                <h4 className="font-medium text-slate-900 dark:text-white truncate pr-2">
                    <span title={LEAD_TEMPERATURE_MAP[lead.lead_temperature].label} className="mr-1">
                        {LEAD_TEMPERATURE_MAP[lead.lead_temperature].emoji}
                    </span>
                    {lead.name}
                </h4>
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
                <span>{formatDate(lead.updated_at)}</span>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="hover:text-blue-600">Open</button>
                </div>
            </div>
        </div>
    );
}
