import { useState } from "react";
import { useRoute } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { useProject } from "@/hooks/use-projects";
import { useIssues } from "@/hooks/use-issues";
import { useUsers } from "@/hooks/use-users";
import { useCustomFields } from "@/hooks/use-fields";
import { CreateIssueDrawer } from "@/components/issues/CreateIssueDrawer";
import { IssueDetailModal } from "@/components/issues/IssueDetailModal";
import { JQLEditor } from "@/components/jql/JQLEditor";
import { Button } from "@/components/ui/button";
import { TypeIcon, PriorityIcon, StatusBadge } from "@/components/issues/IssueIcons";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, Loader2, List as ListIcon, Download, HelpCircle, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";

const QUICK_FILTERS = [
  { label: "All Bugs",       jql: "type = bug" },
  { label: "High Priority",  jql: "priority in (high, critical)" },
  { label: "Open Issues",    jql: "status != done" },
  { label: "Unassigned",     jql: "assignee is EMPTY" },
  { label: "In Progress",    jql: 'status = "in progress"' },
  { label: "Done",           jql: "status = done" },
  { label: "Critical Bugs",  jql: "type = bug AND priority = critical" },
];

const SYNTAX_EXAMPLES = [
  { label: "Filter by status",    example: 'status = "in progress"' },
  { label: "Multiple values",     example: "status in (todo, review)" },
  { label: "Exclude value",       example: "status != done" },
  { label: "Text search",         example: 'summary ~ "login"' },
  { label: "Priority filter",     example: "priority in (high, critical)" },
  { label: "Unassigned issues",   example: "assignee is EMPTY" },
  { label: "Assigned to user",    example: 'assignee = "john"' },
  { label: "Created after date",  example: 'created >= "2024-01-01"' },
  { label: "Combine conditions",  example: "type = bug AND priority = high AND status != done" },
  { label: "Custom field",        example: 'Sprint = "Sprint 1"' },
  { label: "Order results",       example: "status != done ORDER BY created DESC" },
];

export default function ListView() {
  const [, params] = useRoute("/projects/:key/list");
  const projectKey = params?.key || "";

  const { data: project, isLoading: projLoading } = useProject(projectKey);
  const { data: users = [] } = useUsers();
  const { data: customFields = [] } = useCustomFields(projectKey);

  const [jqlInput, setJqlInput] = useState("");
  const [activeJql, setActiveJql] = useState("");
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const { data: issues, isLoading: issuesLoading, isError, error } = useIssues(projectKey, undefined, activeJql);
  const jqlError = isError ? (error as Error)?.message ?? null : null;

  const runQuery = () => setActiveJql(jqlInput.trim());
  const clearQuery = () => { setJqlInput(""); setActiveJql(""); };
  const applyQuickFilter = (jql: string) => { setJqlInput(jql); setActiveJql(jql); };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (activeJql.trim()) params.set("jql", activeJql.trim());
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

  if (projLoading && !project) {
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
      <div className="flex flex-col h-full w-full max-w-7xl mx-auto px-8 py-6 gap-4">

        {/* Header */}
        <div className="flex items-center justify-between">
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

        {/* JQL Box */}
        <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-secondary/30 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">JQL Query</span>
            <button
              onClick={() => setShowHelp(h => !h)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              Syntax help
              {showHelp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>

          <div className="p-3">
            <JQLEditor
              value={jqlInput}
              onChange={setJqlInput}
              onRun={runQuery}
              onClear={clearQuery}
              customFields={customFields}
              users={users}
              error={jqlError}
              isLoading={issuesLoading && !!activeJql}
            />

            {/* Quick filters */}
            <div className="flex flex-wrap gap-1.5 mt-3">
              <span className="text-xs text-muted-foreground self-center mr-1">Quick:</span>
              {QUICK_FILTERS.map(f => (
                <button
                  key={f.label}
                  onClick={() => applyQuickFilter(f.jql)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${activeJql === f.jql
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"
                    }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Syntax help panel */}
          {showHelp && (
            <div className="border-t border-border p-4 bg-secondary/20">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Syntax Reference — click any example to load it</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {SYNTAX_EXAMPLES.map(ex => (
                  <button
                    key={ex.label}
                    onClick={() => { setJqlInput(ex.example); }}
                    className="text-left p-2.5 rounded-lg bg-background border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors group"
                  >
                    <div className="text-xs text-muted-foreground mb-1 group-hover:text-foreground transition-colors">{ex.label}</div>
                    <code className="text-[11px] font-mono text-foreground/80">{ex.example}</code>
                  </button>
                ))}
              </div>
              <div className="mt-4 p-3 bg-background rounded-lg border border-border text-xs text-muted-foreground space-y-1.5">
                <div><span className="font-semibold text-foreground">Built-in fields:</span> status, type, priority, assignee, summary, text, created, updated</div>
                {customFields.length > 0 && (
                  <div><span className="font-semibold text-foreground">Custom fields:</span> {customFields.map(f => f.name).join(", ")}</div>
                )}
                <div><span className="font-semibold text-foreground">Operators:</span> = != ~ !~ &gt; &lt; &gt;= &lt;= in (...) not in (...) is EMPTY is not EMPTY</div>
                <div><span className="font-semibold text-foreground">Combine:</span> condition AND condition (…) ORDER BY field ASC|DESC</div>
              </div>
            </div>
          )}
        </div>

        {/* Result count */}
        {!isError && (
          <div className="flex items-center gap-2 h-5">
            {issuesLoading && activeJql ? (
              <span className="text-sm text-muted-foreground">Searching…</span>
            ) : issues !== undefined ? (
              <>
                <span className="text-sm text-muted-foreground">{issues.length} issue{issues.length !== 1 ? "s" : ""}</span>
                {activeJql && <code className="text-xs font-mono bg-secondary px-2 py-0.5 rounded text-muted-foreground truncate max-w-md">{activeJql}</code>}
              </>
            ) : null}
          </div>
        )}

        {/* Issue Table */}
        <div className="bg-card border rounded-2xl shadow-sm overflow-hidden flex-1 flex flex-col">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-secondary/50 text-muted-foreground uppercase text-xs tracking-wider border-b border-border">
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
                  <tr><td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  </td></tr>
                ) : isError ? (
                  <tr><td colSpan={7} className="px-6 py-12 text-center text-muted-foreground italic">
                    Fix the query above to see results.
                  </td></tr>
                ) : issues?.length === 0 ? (
                  <tr><td colSpan={7} className="px-6 py-12 text-center text-muted-foreground italic">
                    {activeJql ? "No issues match this query." : "No issues yet. Create your first issue!"}
                  </td></tr>
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
                              {issue.assignee.profileImageUrl
                                ? <AvatarImage src={issue.assignee.profileImageUrl} />
                                : <AvatarFallback className="text-[10px] font-bold">{issue.assignee.username[0].toUpperCase()}</AvatarFallback>
                              }
                            </Avatar>
                            <span className="text-muted-foreground">{issue.assignee.username}</span>
                          </div>
                        ) : <span className="text-muted-foreground italic">Unassigned</span>}
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
