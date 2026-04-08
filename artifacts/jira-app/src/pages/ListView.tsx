import { useState, useMemo } from "react";
import { useRoute } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { useProject } from "@/hooks/use-projects";
import { useIssues } from "@/hooks/use-issues";
import { useUsers } from "@/hooks/use-users";
import { CreateIssueDrawer } from "@/components/issues/CreateIssueDrawer";
import { IssueDetailModal } from "@/components/issues/IssueDetailModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TypeIcon, PriorityIcon, StatusBadge } from "@/components/issues/IssueIcons";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, Loader2, List as ListIcon, Search, Download, X, Filter } from "lucide-react";
import { format } from "date-fns";
import type { IssueFilters } from "@/lib/types";

const ALL = "__all__";

export default function ListView() {
  const [, params] = useRoute("/projects/:key/list");
  const projectKey = params?.key || "";

  const { data: project, isLoading: projLoading } = useProject(projectKey);
  const { data: users } = useUsers();

  const [filters, setFilters] = useState<IssueFilters>({});
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const activeFilters = useMemo(() => {
    return Object.fromEntries(Object.entries(filters).filter(([, v]) => v && v !== ALL));
  }, [filters]);

  const { data: issues, isLoading: issuesLoading } = useIssues(projectKey, activeFilters as IssueFilters);

  const setFilter = (key: keyof IssueFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value === ALL ? undefined : value || undefined }));
  };

  const removeFilter = (key: keyof IssueFilters) => {
    setFilters(prev => { const next = { ...prev }; delete next[key]; return next; });
  };

  const clearAllFilters = () => setFilters({});

  const activeFilterCount = Object.keys(activeFilters).length;

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (activeFilters.search) params.set("search", activeFilters.search);
      if (activeFilters.status) params.set("status", activeFilters.status);
      if (activeFilters.type) params.set("type", activeFilters.type);
      if (activeFilters.priority) params.set("priority", activeFilters.priority);
      if (activeFilters.assigneeId) params.set("assigneeId", activeFilters.assigneeId);
      const qs = params.toString();
      const res = await fetch(`/jira-api/projects/${projectKey}/issues/export${qs ? `?${qs}` : ""}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${projectKey}-issues.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
    } finally {
      setExporting(false);
    }
  };

  const isLoading = projLoading || issuesLoading;

  if (isLoading && !issues) {
    return (
      <AppLayout>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!project) return <AppLayout><div className="p-8">Project not found</div></AppLayout>;

  return (
    <AppLayout>
      <div className="flex flex-col h-full w-full max-w-7xl mx-auto px-8 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-secondary text-foreground flex items-center justify-center border border-border">
              <ListIcon className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono bg-secondary px-2 py-0.5 rounded text-muted-foreground font-semibold tracking-wider">
                  {project.key}
                </span>
              </div>
              <h1 className="text-2xl font-bold text-foreground leading-none">{project.name} Issues</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
              {exporting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Download className="w-4 h-4 mr-1.5" />}
              Export CSV
            </Button>
            <CreateIssueDrawer projectKey={project.key}>
              <Button>
                <Plus className="w-4 h-4 mr-2" /> Create Issue
              </Button>
            </CreateIssueDrawer>
          </div>
        </div>

        <div className="bg-card border rounded-xl p-3 mb-4 flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Filter className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Filter</span>
          </div>

          <div className="relative flex-1 min-w-40 max-w-56">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by title..."
              className="pl-8 h-8 text-sm bg-background"
              value={filters.search || ""}
              onChange={e => setFilter("search", e.target.value)}
            />
          </div>

          <Select value={filters.status || ALL} onValueChange={v => setFilter("status", v)}>
            <SelectTrigger className="h-8 w-32 text-sm bg-background">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Statuses</SelectItem>
              <SelectItem value="todo">To Do</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="review">In Review</SelectItem>
              <SelectItem value="done">Done</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filters.type || ALL} onValueChange={v => setFilter("type", v)}>
            <SelectTrigger className="h-8 w-28 text-sm bg-background">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Types</SelectItem>
              <SelectItem value="bug">Bug</SelectItem>
              <SelectItem value="task">Task</SelectItem>
              <SelectItem value="story">Story</SelectItem>
              <SelectItem value="epic">Epic</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filters.priority || ALL} onValueChange={v => setFilter("priority", v)}>
            <SelectTrigger className="h-8 w-32 text-sm bg-background">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Priorities</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filters.assigneeId || ALL} onValueChange={v => setFilter("assigneeId", v)}>
            <SelectTrigger className="h-8 w-36 text-sm bg-background">
              <SelectValue placeholder="Assignee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Assignees</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {users?.map(u => (
                <SelectItem key={u.id} value={u.id}>{u.username}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-foreground px-2 ml-auto" onClick={clearAllFilters}>
              <X className="w-3.5 h-3.5 mr-1" /> Clear all
            </Button>
          )}
        </div>

        {activeFilterCount > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {activeFilters.search && (
              <Badge variant="secondary" className="gap-1 pr-1 text-xs">
                Search: "{activeFilters.search}"
                <button onClick={() => removeFilter("search")} className="ml-0.5 hover:text-foreground"><X className="w-3 h-3" /></button>
              </Badge>
            )}
            {activeFilters.status && (
              <Badge variant="secondary" className="gap-1 pr-1 text-xs">
                Status: {activeFilters.status.replace("_", " ")}
                <button onClick={() => removeFilter("status")} className="ml-0.5 hover:text-foreground"><X className="w-3 h-3" /></button>
              </Badge>
            )}
            {activeFilters.type && (
              <Badge variant="secondary" className="gap-1 pr-1 text-xs">
                Type: {activeFilters.type}
                <button onClick={() => removeFilter("type")} className="ml-0.5 hover:text-foreground"><X className="w-3 h-3" /></button>
              </Badge>
            )}
            {activeFilters.priority && (
              <Badge variant="secondary" className="gap-1 pr-1 text-xs">
                Priority: {activeFilters.priority}
                <button onClick={() => removeFilter("priority")} className="ml-0.5 hover:text-foreground"><X className="w-3 h-3" /></button>
              </Badge>
            )}
            {activeFilters.assigneeId && (
              <Badge variant="secondary" className="gap-1 pr-1 text-xs">
                Assignee: {activeFilters.assigneeId === "unassigned" ? "Unassigned" : (users?.find(u => u.id === activeFilters.assigneeId)?.username ?? activeFilters.assigneeId)}
                <button onClick={() => removeFilter("assigneeId")} className="ml-0.5 hover:text-foreground"><X className="w-3 h-3" /></button>
              </Badge>
            )}
            <span className="text-xs text-muted-foreground flex items-center ml-1">
              {issues?.length ?? 0} result{(issues?.length ?? 0) !== 1 ? "s" : ""}
            </span>
          </div>
        )}

        <div className="bg-card border rounded-2xl shadow-sm overflow-hidden flex-1 flex flex-col">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-secondary/50 text-muted-foreground uppercase text-xs tracking-wider border-b border-border font-bold">
                <tr>
                  <th className="px-6 py-4 font-bold">Type</th>
                  <th className="px-6 py-4 font-bold">Key</th>
                  <th className="px-6 py-4 font-bold w-1/3">Title</th>
                  <th className="px-6 py-4 font-bold">Status</th>
                  <th className="px-6 py-4 font-bold">Priority</th>
                  <th className="px-6 py-4 font-bold">Assignee</th>
                  <th className="px-6 py-4 font-bold text-right">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {issuesLoading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : issues?.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground italic">
                      {activeFilterCount > 0 ? "No issues match the current filters." : "No issues yet. Create your first issue!"}
                    </td>
                  </tr>
                ) : (
                  issues?.map(issue => (
                    <tr
                      key={issue.id}
                      onClick={() => setSelectedIssueId(issue.id)}
                      className="hover:bg-secondary/30 cursor-pointer transition-colors group"
                    >
                      <td className="px-6 py-4"><TypeIcon type={issue.type} className="w-5 h-5" /></td>
                      <td className="px-6 py-4 font-mono text-xs font-semibold text-muted-foreground">{issue.key}</td>
                      <td className="px-6 py-4 font-medium text-foreground group-hover:text-primary transition-colors">{issue.title}</td>
                      <td className="px-6 py-4"><StatusBadge status={issue.status} /></td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 capitalize text-muted-foreground">
                          <PriorityIcon priority={issue.priority} /> {issue.priority}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {issue.assignee ? (
                          <div className="flex items-center gap-2">
                            <Avatar className="w-6 h-6 border">
                              {issue.assignee.profileImageUrl ? (
                                <AvatarImage src={issue.assignee.profileImageUrl} />
                              ) : (
                                <AvatarFallback className="text-[10px] font-bold">{issue.assignee.username[0].toUpperCase()}</AvatarFallback>
                              )}
                            </Avatar>
                            <span className="text-muted-foreground">{issue.assignee.username}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic">Unassigned</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right text-muted-foreground whitespace-nowrap">
                        {format(new Date(issue.createdAt), "MMM d, yyyy")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <IssueDetailModal
        issueId={selectedIssueId}
        open={!!selectedIssueId}
        onOpenChange={(isOpen) => !isOpen && setSelectedIssueId(null)}
      />
    </AppLayout>
  );
}
