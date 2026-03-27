import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Issue } from "@/lib/types";
import { TypeIcon, PriorityIcon } from "./IssueIcons";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

export function IssueCard({ issue, onClick }: { issue: Issue, onClick: () => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: issue.id,
    data: { type: "Issue", issue }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  if (isDragging) {
    return (
      <div 
        ref={setNodeRef} style={style}
        className="h-[104px] bg-primary/5 border-2 border-primary/20 border-dashed rounded-xl opacity-50 mb-3"
      />
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className="group bg-card p-4 rounded-xl border shadow-sm mb-3 cursor-grab active:cursor-grabbing hover-elevate transition-all"
    >
      <div className="text-sm font-medium text-foreground mb-3 leading-snug line-clamp-2 group-hover:text-primary transition-colors">
        {issue.title}
      </div>
      
      <div className="flex items-center justify-between mt-auto">
        <div className="flex items-center gap-2">
          <TypeIcon type={issue.type} />
          <PriorityIcon priority={issue.priority} />
          <span className="text-xs font-mono font-medium text-muted-foreground">{issue.key}</span>
        </div>
        
        {issue.assignee && (
          <Avatar className="w-6 h-6 border">
            {issue.assignee.profileImageUrl ? (
              <AvatarImage src={issue.assignee.profileImageUrl} />
            ) : (
              <AvatarFallback className="text-[9px] font-bold bg-secondary text-secondary-foreground">
                {issue.assignee.username[0].toUpperCase()}
              </AvatarFallback>
            )}
          </Avatar>
        )}
      </div>
    </div>
  );
}
