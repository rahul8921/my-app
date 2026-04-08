import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useIssue, useUpdateIssue, useComments, useAddComment, useDeleteIssue } from "@/hooks/use-issues";
import { useCustomFields, useSetCustomFieldValues } from "@/hooks/use-fields";
import { useUsers } from "@/hooks/use-users";
import { Loader2, MessageSquare, Send, Trash2, Calendar, Clock, Tag } from "lucide-react";
import { format } from "date-fns";
import { TypeIcon, PriorityIcon, StatusBadge } from "./IssueIcons";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import type { FieldType } from "@/lib/types";

function CustomFieldInput({
  fieldType,
  options,
  value,
  onChange,
}: {
  fieldType: FieldType;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  if (fieldType === "select") {
    return (
      <Select value={value || "__none__"} onValueChange={v => onChange(v === "__none__" ? "" : v)}>
        <SelectTrigger className="w-full bg-background border-border h-8 text-sm">
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">—</SelectItem>
          {options.map(opt => (
            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (fieldType === "date") {
    return (
      <Input
        type="date"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-8 text-sm bg-background border-border"
      />
    );
  }
  if (fieldType === "number") {
    return (
      <Input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={e => onChange(e.target.value)}
        className="h-8 text-sm bg-background border-border"
        placeholder="—"
      />
    );
  }
  return (
    <Input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      onBlur={e => onChange(e.target.value)}
      className="h-8 text-sm bg-background border-border"
      placeholder="—"
    />
  );
}

export function IssueDetailModal({
  issueId,
  open,
  onOpenChange,
}: {
  issueId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: issue, isLoading } = useIssue(issueId);
  const { data: users } = useUsers();
  const updateMutation = useUpdateIssue();
  const deleteMutation = useDeleteIssue();
  const setCustomFieldValues = useSetCustomFieldValues();
  const { toast } = useToast();

  const projectKey = issue ? issue.key.split("-")[0] : "";
  const { data: fieldDefs } = useCustomFields(projectKey);

  const { data: comments } = useComments(issueId);
  const addCommentMutation = useAddComment();
  const [commentText, setCommentText] = useState("");

  const [customValues, setCustomValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (issue?.customFieldValues) {
      const map: Record<string, string> = {};
      for (const v of issue.customFieldValues) {
        map[v.fieldId] = v.value ?? "";
      }
      setCustomValues(map);
    }
  }, [issue]);

  const handleUpdate = (field: string, value: string) => {
    if (!issueId) return;
    updateMutation.mutate({ id: issueId, data: { [field]: value } });
  };

  const handleCustomFieldChange = (fieldId: string, value: string) => {
    if (!issueId) return;
    setCustomValues(prev => ({ ...prev, [fieldId]: value }));
    setCustomFieldValues.mutate({ issueId, values: { [fieldId]: value || null } });
  };

  const handleAddComment = () => {
    if (!issueId || !commentText.trim()) return;
    addCommentMutation.mutate({ issueId, content: commentText }, {
      onSuccess: () => setCommentText("")
    });
  };

  const handleDelete = () => {
    if (!issueId || !window.confirm("Are you sure you want to delete this issue?")) return;
    deleteMutation.mutate(issueId, {
      onSuccess: () => {
        toast({ title: "Issue deleted" });
        onOpenChange(false);
      }
    });
  };

  return (
    <Dialog open={open && !!issueId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] p-0 overflow-hidden flex flex-col md:flex-row bg-background">
        {isLoading || !issue ? (
          <div className="w-full h-full flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Left Column: Main content */}
            <div className="flex-1 border-r border-border overflow-y-auto kanban-scroll p-6 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground bg-secondary px-3 py-1 rounded-md">
                  <TypeIcon type={issue.type} />
                  <span className="uppercase tracking-wider">{issue.key}</span>
                </div>
                <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={handleDelete}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>

              <h1 className="text-2xl font-bold text-foreground mb-6 leading-tight">
                {issue.title}
              </h1>

              <div className="mb-8">
                <h3 className="text-sm font-bold text-foreground mb-3 uppercase tracking-wider">Description</h3>
                <div className="bg-secondary/50 rounded-xl p-4 min-h-[100px] border border-border text-sm text-foreground/90 whitespace-pre-wrap">
                  {issue.description || <span className="italic text-muted-foreground">No description provided.</span>}
                </div>
              </div>

              <div className="mt-auto">
                <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wider flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" /> Comments
                </h3>

                <div className="space-y-4 mb-6">
                  {comments?.map(comment => (
                    <div key={comment.id} className="flex gap-3">
                      <Avatar className="w-8 h-8 shrink-0 border">
                        {(comment as any).author?.profileImageUrl
                          ? <AvatarImage src={(comment as any).author.profileImageUrl} />
                          : <AvatarFallback className="text-[10px]">{((comment as any).author?.username ?? "?")?.[0]}</AvatarFallback>
                        }
                      </Avatar>
                      <div className="flex-1 bg-secondary rounded-lg p-3 rounded-tl-none border border-border">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-sm">{(comment as any).author?.username}</span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {format(new Date(comment.createdAt), "MMM d, h:mm a")}
                          </span>
                        </div>
                        <p className="text-sm text-foreground/90 whitespace-pre-wrap">{comment.content}</p>
                      </div>
                    </div>
                  ))}
                  {comments?.length === 0 && (
                    <div className="text-sm text-muted-foreground text-center py-4 italic border border-dashed rounded-lg">No comments yet.</div>
                  )}
                </div>

                <div className="flex gap-3 mt-4 relative">
                  <Textarea
                    placeholder="Add a comment..."
                    className="min-h-[80px] resize-none pr-12 pb-12 rounded-xl bg-background"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        handleAddComment();
                      }
                    }}
                  />
                  <div className="absolute bottom-3 right-3 flex items-center gap-2">
                    <span className="text-xs text-muted-foreground hidden sm:inline">⌘+Enter</span>
                    <Button size="icon" className="h-8 w-8 rounded-lg" onClick={handleAddComment} disabled={!commentText.trim() || addCommentMutation.isPending}>
                      {addCommentMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Meta details */}
            <div className="w-full md:w-80 bg-secondary/30 p-6 flex flex-col gap-5 overflow-y-auto kanban-scroll">

              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Status</label>
                <Select value={issue.status} onValueChange={(val) => handleUpdate("status", val)}>
                  <SelectTrigger className="w-full bg-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todo"><StatusBadge status="todo" /></SelectItem>
                    <SelectItem value="in_progress"><StatusBadge status="in_progress" /></SelectItem>
                    <SelectItem value="review"><StatusBadge status="review" /></SelectItem>
                    <SelectItem value="done"><StatusBadge status="done" /></SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Assignee</label>
                <Select value={issue.assigneeId || "unassigned"} onValueChange={(val) => handleUpdate("assigneeId", val === "unassigned" ? "" : val)}>
                  <SelectTrigger className="w-full bg-background border-border h-10">
                    <SelectValue>
                      {issue.assignee ? (
                        <div className="flex items-center gap-2">
                          <Avatar className="w-5 h-5"><AvatarFallback className="text-[9px]">{issue.assignee.username[0]}</AvatarFallback></Avatar>
                          <span>{issue.assignee.username}</span>
                        </div>
                      ) : "Unassigned"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {users?.map(u => (
                      <SelectItem key={u.id} value={u.id}>
                        <div className="flex items-center gap-2">
                          <Avatar className="w-5 h-5"><AvatarFallback className="text-[9px]">{u.username[0]}</AvatarFallback></Avatar>
                          <span>{u.username}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Priority</label>
                <Select value={issue.priority} onValueChange={(val) => handleUpdate("priority", val)}>
                  <SelectTrigger className="w-full bg-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low"><div className="flex items-center"><PriorityIcon priority="low" className="mr-2" /> Low</div></SelectItem>
                    <SelectItem value="medium"><div className="flex items-center"><PriorityIcon priority="medium" className="mr-2" /> Medium</div></SelectItem>
                    <SelectItem value="high"><div className="flex items-center"><PriorityIcon priority="high" className="mr-2" /> High</div></SelectItem>
                    <SelectItem value="critical"><div className="flex items-center"><PriorityIcon priority="critical" className="mr-2" /> Critical</div></SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {fieldDefs && fieldDefs.length > 0 && (
                <div className="pt-4 border-t border-border">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5" /> Custom Fields
                  </h3>
                  <div className="space-y-3">
                    {fieldDefs.map(field => (
                      <div key={field.id}>
                        <label className="text-xs font-semibold text-muted-foreground mb-1 block">{field.name}</label>
                        <CustomFieldInput
                          fieldType={field.fieldType}
                          options={field.options}
                          value={customValues[field.id] ?? ""}
                          onChange={v => handleCustomFieldChange(field.id, v)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-auto pt-5 border-t border-border space-y-4">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <div>
                    <div className="text-xs font-medium">Created</div>
                    <div className="text-foreground">{format(new Date(issue.createdAt), "MMM d, yyyy")}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <div>
                    <div className="text-xs font-medium">Updated</div>
                    <div className="text-foreground">{format(new Date(issue.updatedAt), "MMM d, yyyy")}</div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
