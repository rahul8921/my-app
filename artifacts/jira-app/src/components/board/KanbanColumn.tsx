import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { IssueCard } from "@/components/issues/IssueCard";
import type { Issue, Status } from "@/lib/types";

interface KanbanColumnProps {
  id: Status;
  title: string;
  issues: Issue[];
  onIssueClick: (id: string) => void;
}

export function KanbanColumn({ id, title, issues, onIssueClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { type: "Column", columnId: id }
  });

  return (
    <div className="flex flex-col w-80 shrink-0 bg-secondary/50 rounded-2xl border border-border h-full max-h-full overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between bg-secondary/80 rounded-t-2xl">
        <h3 className="font-bold text-sm text-foreground uppercase tracking-wider">{title}</h3>
        <div className="w-6 h-6 rounded-full bg-background border flex items-center justify-center text-xs font-bold text-muted-foreground shadow-sm">
          {issues.length}
        </div>
      </div>
      
      <div 
        ref={setNodeRef} 
        className={`flex-1 p-3 overflow-y-auto kanban-scroll transition-colors ${isOver ? 'bg-primary/5' : ''}`}
      >
        <SortableContext items={issues.map(i => i.id)} strategy={verticalListSortingStrategy}>
          {issues.map(issue => (
            <IssueCard key={issue.id} issue={issue} onClick={() => onIssueClick(issue.id)} />
          ))}
          {issues.length === 0 && (
            <div className="h-full min-h-[100px] border-2 border-dashed border-border/50 rounded-xl flex items-center justify-center text-sm text-muted-foreground font-medium">
              Drop issues here
            </div>
          )}
        </SortableContext>
      </div>
    </div>
  );
}
