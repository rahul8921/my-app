import { useState, useMemo } from "react";
import { 
  DndContext, 
  DragOverlay, 
  closestCorners, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors, 
  DragStartEvent, 
  DragOverEvent, 
  DragEndEvent 
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { KanbanColumn } from "./KanbanColumn";
import { IssueCard } from "@/components/issues/IssueCard";
import { IssueDetailModal } from "@/components/issues/IssueDetailModal";
import { useUpdateIssueStatus } from "@/hooks/use-issues";
import type { Issue, Status } from "@/lib/types";

const COLUMNS: { id: Status; title: string }[] = [
  { id: "todo", title: "To Do" },
  { id: "in_progress", title: "In Progress" },
  { id: "review", title: "Review" },
  { id: "done", title: "Done" },
];

export function KanbanBoard({ issues: initialIssues }: { issues: Issue[] }) {
  // Local state for optimistic UI updates during drag
  const [activeIssue, setActiveIssue] = useState<Issue | null>(null);
  const updateStatusMutation = useUpdateIssueStatus();
  
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const issuesByStatus = useMemo(() => {
    const map: Record<Status, Issue[]> = { todo: [], in_progress: [], review: [], done: [] };
    initialIssues.forEach(i => {
      if (map[i.status]) map[i.status].push(i);
    });
    return map;
  }, [initialIssues]);

  const onDragStart = (event: DragStartEvent) => {
    if (event.active.data.current?.type === "Issue") {
      setActiveIssue(event.active.data.current.issue);
    }
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActiveIssue(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;

    const activeIssue = initialIssues.find(i => i.id === activeId);
    if (!activeIssue) return;

    // determine destination status
    let destinationStatus: Status | null = null;
    
    // Is over a column?
    if (over.data.current?.type === "Column") {
      destinationStatus = over.data.current.columnId as Status;
    } 
    // Is over another issue?
    else if (over.data.current?.type === "Issue") {
      destinationStatus = over.data.current.issue.status as Status;
    }

    if (destinationStatus && destinationStatus !== activeIssue.status) {
      updateStatusMutation.mutate({ id: activeIssue.id, status: destinationStatus });
    }
  };

  return (
    <>
      <DndContext 
        sensors={sensors} 
        collisionDetection={closestCorners} 
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="flex h-full w-full gap-6 overflow-x-auto pb-4 kanban-scroll p-1">
          {COLUMNS.map(col => (
            <KanbanColumn 
              key={col.id} 
              id={col.id} 
              title={col.title} 
              issues={issuesByStatus[col.id] || []}
              onIssueClick={(id) => setSelectedIssueId(id)}
            />
          ))}
        </div>

        <DragOverlay>
          {activeIssue ? <IssueCard issue={activeIssue} onClick={() => {}} /> : null}
        </DragOverlay>
      </DndContext>

      <IssueDetailModal 
        issueId={selectedIssueId} 
        open={!!selectedIssueId} 
        onOpenChange={(isOpen) => !isOpen && setSelectedIssueId(null)} 
      />
    </>
  );
}
