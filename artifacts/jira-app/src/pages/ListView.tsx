import { useState } from "react";
import { useRoute } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { useProject } from "@/hooks/use-projects";
import { useIssues } from "@/hooks/use-issues";
import { CreateIssueDrawer } from "@/components/issues/CreateIssueDrawer";
import { IssueDetailModal } from "@/components/issues/IssueDetailModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TypeIcon, PriorityIcon, StatusBadge } from "@/components/issues/IssueIcons";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, Loader2, List as ListIcon, Search } from "lucide-react";
import { format } from "date-fns";

export default function ListView() {
  const [, params] = useRoute("/projects/:key/list");
  const projectKey = params?.key || "";
  
  const { data: project, isLoading: projLoading } = useProject(projectKey);
  const { data: issues, isLoading: issuesLoading } = useIssues(projectKey);
  
  const [search, setSearch] = useState("");
  const [selectedIssueId, setSelectedIssueId] = useState<number | null>(null);

  const filteredIssues = issues?.filter(i => 
    i.title.toLowerCase().includes(search.toLowerCase()) || 
    i.key.toLowerCase().includes(search.toLowerCase())
  );

  const isLoading = projLoading || issuesLoading;

  if (isLoading) {
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
        <div className="flex items-center justify-between mb-8">
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

          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input 
                placeholder="Search issues..." 
                className="pl-9 w-64 bg-card"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <CreateIssueDrawer projectKey={project.key}>
              <Button>
                <Plus className="w-4 h-4 mr-2" /> Create Issue
              </Button>
            </CreateIssueDrawer>
          </div>
        </div>

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
                {filteredIssues?.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground italic">
                      No issues found matching your search.
                    </td>
                  </tr>
                ) : (
                  filteredIssues?.map(issue => (
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
