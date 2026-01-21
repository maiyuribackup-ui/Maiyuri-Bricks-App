"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Spinner } from "@maiyuri/ui";
import { TasksKanban } from "./TasksKanban";
import { CreateTaskDialog } from "./CreateTaskDialog";
import { Toaster, toast } from "sonner";
import { PlusIcon, RefreshCw as RefreshIcon } from "lucide-react";
import type { Task, TaskStatus } from "@maiyuri/shared";
import { HelpButton } from "@/components/help";

// Icons Mock if not available
const Icon = ({ name }: { name: string }) => <span>{name}</span>;

async function fetchTasks() {
  const res = await fetch("/api/tasks");
  if (!res.ok) throw new Error("Failed to fetch tasks");
  return res.json();
}

async function updateTaskStatus(id: string, status: TaskStatus) {
  const res = await fetch(`/api/tasks/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error("Failed to update status");
  return res.json();
}

export default function TasksPage() {
  const [viewMode, setViewMode] = useState<"list" | "kanban">("kanban");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["tasks"],
    queryFn: fetchTasks,
  });

  const tasks: Task[] = data?.data || [];

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      updateTaskStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Task status updated");
    },
    onError: () => toast.error("Failed to update status"),
  });

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto p-6">
      <Toaster position="top-right" />

      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            Tasks
          </h1>
          <p className="text-slate-500">
            Manage assignments and track progress
          </p>
        </div>
        <div className="flex items-center gap-3">
          <HelpButton section="tasks" variant="icon" />
          <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-lg flex text-sm font-medium">
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 rounded-md transition-all ${viewMode === "list" ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"}`}
            >
              List
            </button>
            <button
              onClick={() => setViewMode("kanban")}
              className={`px-3 py-1.5 rounded-md transition-all ${viewMode === "kanban" ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"}`}
            >
              Kanban
            </button>
          </div>
          <Button variant="secondary" onClick={() => refetch()}>
            Refresh
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => setIsCreateOpen(true)}
          >
            + New Task
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : error ? (
        <div className="text-center text-red-500">Failed to load tasks</div>
      ) : (
        <>
          {viewMode === "kanban" ? (
            <TasksKanban
              tasks={tasks}
              onStatusChange={(id, status) =>
                statusMutation.mutate({ id, status })
              }
              onTaskClick={(task) => {
                setSelectedTask(task);
                setIsCreateOpen(true);
              }}
            />
          ) : (
            <Card>
              <div className="p-4">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-800">
                    <tr>
                      <th className="px-4 py-3">Task</th>
                      <th className="px-4 py-3">Priority</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Assignee</th>
                      <th className="px-4 py-3">Due Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((task) => (
                      <tr
                        key={task.id}
                        className="border-b border-slate-100 dark:border-slate-800"
                      >
                        <td className="px-4 py-3 font-medium">{task.title}</td>
                        <td className="px-4 py-3">{task.priority}</td>
                        <td className="px-4 py-3">{task.status}</td>
                        <td className="px-4 py-3">
                          {task.assignee?.name || "-"}
                        </td>
                        <td className="px-4 py-3">
                          {task.due_date
                            ? new Date(task.due_date).toLocaleDateString()
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      <CreateTaskDialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) setSelectedTask(null);
        }}
        initialData={selectedTask}
      />
    </div>
  );
}
