import { AlertCircle, CheckCircle2, Bookmark, Zap, ArrowUp, ArrowDown, ArrowRight, ChevronsUp } from "lucide-react";
import type { IssueType, Priority } from "@/lib/types";

export function TypeIcon({ type, className = "w-4 h-4" }: { type: IssueType; className?: string }) {
  switch (type) {
    case "bug": return <AlertCircle className={`${className} text-red-500`} />;
    case "task": return <CheckCircle2 className={`${className} text-blue-500`} />;
    case "story": return <Bookmark className={`${className} text-green-500`} />;
    case "epic": return <Zap className={`${className} text-purple-500`} />;
    default: return <CheckCircle2 className={`${className} text-gray-500`} />;
  }
}

export function PriorityIcon({ priority, className = "w-4 h-4" }: { priority: Priority; className?: string }) {
  switch (priority) {
    case "critical": return <ChevronsUp className={`${className} text-red-600`} />;
    case "high": return <ArrowUp className={`${className} text-orange-500`} />;
    case "medium": return <ArrowRight className={`${className} text-yellow-500`} />;
    case "low": return <ArrowDown className={`${className} text-blue-400`} />;
    default: return <ArrowRight className={`${className} text-gray-500`} />;
  }
}

export function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    todo: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    in_progress: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
    review: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800",
    done: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800",
  };
  
  const labels: Record<string, string> = {
    todo: "To Do",
    in_progress: "In Progress",
    review: "In Review",
    done: "Done",
  };

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${colors[status] || colors.todo} uppercase tracking-wider`}>
      {labels[status] || status.replace("_", " ")}
    </span>
  );
}
