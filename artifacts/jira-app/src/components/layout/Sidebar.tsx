import { Link, useLocation } from "wouter";
import { useProjects } from "@/hooks/use-projects";
import { useAuth } from "@/hooks/use-auth";
import { 
  Briefcase, 
  LayoutDashboard, 
  List, 
  Settings, 
  Layers,
  Plus,
  LogOut,
  ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState } from "react";

export function Sidebar() {
  const [location] = useLocation();
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const { user, logout } = useAuth();
  
  const currentProjectKey = location.match(/\/projects\/([^\/]+)/)?.[1];

  return (
    <div className="w-64 h-screen bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col transition-all duration-300 flex-shrink-0">
      <div className="p-4 flex items-center gap-3 border-b border-sidebar-border/50">
        <div className="w-8 h-8 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center font-bold shadow-lg shadow-sidebar-primary/20">
          <Layers className="w-5 h-5" />
        </div>
        <span className="font-bold text-lg tracking-tight">TaskFlow</span>
      </div>

      <div className="flex-1 overflow-y-auto py-4 kanban-scroll">
        <div className="px-3 mb-2">
          <Link href="/">
            <Button variant="ghost" className={`w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${location === '/' ? 'bg-sidebar-accent text-sidebar-accent-foreground' : ''}`}>
              <Briefcase className="w-4 h-4 mr-2" />
              All Projects
            </Button>
          </Link>
        </div>

        {currentProjectKey && (
          <div className="px-3 mt-6">
            <div className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-2 px-2">
              Current Project
            </div>
            <div className="space-y-1">
              <Link href={`/projects/${currentProjectKey}`}>
                <Button variant="ghost" className={`w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${location.endsWith(currentProjectKey) ? 'bg-sidebar-accent text-sidebar-accent-foreground' : ''}`}>
                  <LayoutDashboard className="w-4 h-4 mr-2" />
                  Kanban Board
                </Button>
              </Link>
              <Link href={`/projects/${currentProjectKey}/list`}>
                <Button variant="ghost" className={`w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${location.includes('/list') ? 'bg-sidebar-accent text-sidebar-accent-foreground' : ''}`}>
                  <List className="w-4 h-4 mr-2" />
                  List View
                </Button>
              </Link>
            </div>
          </div>
        )}

        <div className="px-3 mt-8">
          <div className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-2 px-2 flex justify-between items-center">
            <span>Recent Projects</span>
          </div>
          
          <div className="space-y-1">
            {projectsLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="px-4 py-2 flex items-center gap-2">
                  <Skeleton className="w-4 h-4 rounded bg-sidebar-accent" />
                  <Skeleton className="h-4 w-24 bg-sidebar-accent" />
                </div>
              ))
            ) : projects?.length === 0 ? (
              <div className="px-4 py-2 text-sm text-sidebar-foreground/50">No projects yet</div>
            ) : (
              projects?.slice(0, 5).map(project => (
                <Link key={project.id} href={`/projects/${project.key}`}>
                  <Button variant="ghost" className={`w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground truncate ${currentProjectKey === project.key ? 'text-sidebar-primary font-medium' : ''}`}>
                    <div className="w-4 h-4 rounded bg-sidebar-accent/50 text-[9px] flex items-center justify-center mr-2 font-mono flex-shrink-0">
                      {project.key.charAt(0)}
                    </div>
                    <span className="truncate">{project.name}</span>
                  </Button>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-sidebar-border/50">
        {user ? (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-start p-2 h-auto hover:bg-sidebar-accent">
                <Avatar className="w-8 h-8 mr-3 border border-sidebar-border">
                  {user.profileImage ? (
                    <AvatarImage src={user.profileImage} />
                  ) : (
                    <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs">
                      {user.username?.[0]?.toUpperCase() || 'U'}
                    </AvatarFallback>
                  )}
                </Avatar>
                <div className="flex-1 text-left truncate">
                  <div className="text-sm font-medium text-sidebar-foreground truncate">{user.username}</div>
                </div>
                <ChevronDown className="w-4 h-4 text-sidebar-foreground/50" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <Button variant="ghost" onClick={logout} className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-400/10">
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </CollapsibleContent>
          </Collapsible>
        ) : (
          <Skeleton className="w-full h-10 bg-sidebar-accent rounded-md" />
        )}
      </div>
    </div>
  );
}
