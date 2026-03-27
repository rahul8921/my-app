import { useRoute } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { useProject } from "@/hooks/use-projects";
import { useIssues } from "@/hooks/use-issues";
import { KanbanBoard } from "@/components/board/KanbanBoard";
import { CreateIssueDrawer } from "@/components/issues/CreateIssueDrawer";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, LayoutDashboard } from "lucide-react";

export default function Board() {
  const [, params] = useRoute("/projects/:key");
  const projectKey = params?.key || "";
  
  const { data: project, isLoading: projLoading } = useProject(projectKey);
  const { data: issues, isLoading: issuesLoading } = useIssues(projectKey);

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

  if (!project) {
    return (
      <AppLayout>
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          Project not found
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full w-full">
        {/* Board Header */}
        <div className="px-8 py-6 border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/20">
                <LayoutDashboard className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono bg-secondary px-2 py-0.5 rounded text-muted-foreground font-semibold tracking-wider">
                    {project.key}
                  </span>
                </div>
                <h1 className="text-2xl font-bold text-foreground leading-none">{project.name} Board</h1>
              </div>
            </div>

            <CreateIssueDrawer projectKey={project.key}>
              <Button size="lg" className="shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-all">
                <Plus className="w-5 h-5 mr-2" /> Create Issue
              </Button>
            </CreateIssueDrawer>
          </div>
        </div>

        {/* Board Content */}
        <div className="flex-1 p-8 overflow-hidden bg-background">
          <KanbanBoard issues={issues || []} />
        </div>
      </div>
    </AppLayout>
  );
}
