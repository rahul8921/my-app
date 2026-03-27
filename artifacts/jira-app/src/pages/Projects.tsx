import { useState } from "react";
import { Link } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { useProjects, useCreateProject } from "@/hooks/use-projects";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Briefcase, Plus, Loader2, ArrowRight, AlertCircle } from "lucide-react";
import { format } from "date-fns";

export default function Projects() {
  const { data: projects, isLoading } = useProjects();
  const createMutation = useCreateProject();
  const [open, setOpen] = useState(false);

  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [mutationError, setMutationError] = useState<string | null>(null);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    if (!keyTouched) {
      const generated = val.split(/\s+/).filter(Boolean).map(w => w[0]).join("").slice(0, 4).toUpperCase();
      setKey(generated);
    }
  };

  const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setKey(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 10));
    setKeyTouched(true);
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (name.trim().length < 2) errs.name = "Name must be at least 2 characters";
    if (key.length < 2) errs.key = "Key must be at least 2 characters";
    if (key.length > 10) errs.key = "Key must be at most 10 characters";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMutationError(null);
    if (!validate()) return;
    createMutation.mutate(
      { name: name.trim(), key, description: description.trim() || undefined },
      {
        onSuccess: () => {
          setOpen(false);
          setName(""); setKey(""); setKeyTouched(false); setDescription(""); setErrors({});
        },
        onError: (err) => setMutationError(err.message),
      }
    );
  };

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) { setErrors({}); setMutationError(null); }
  };

  return (
    <AppLayout>
      <div className="p-8 max-w-7xl mx-auto w-full">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
              <Briefcase className="w-8 h-8 text-primary" />
              Projects
            </h1>
            <p className="text-muted-foreground mt-1">Manage your workspaces and boards</p>
          </div>

          <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
              <Button size="lg" className="font-semibold shadow-lg shadow-primary/20">
                <Plus className="w-5 h-5 mr-2" />
                Create Project
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create new project</DialogTitle>
                <DialogDescription>Set up a new workspace for your team.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-foreground">Project Name</label>
                  <Input
                    value={name}
                    onChange={handleNameChange}
                    placeholder="e.g. Website Redesign"
                  />
                  {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-foreground">Project Key</label>
                  <Input
                    value={key}
                    onChange={handleKeyChange}
                    placeholder="WEB"
                    className="uppercase font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground">Used as prefix for issue IDs (e.g. {key || "WEB"}-123)</p>
                  {errors.key && <p className="text-xs text-destructive">{errors.key}</p>}
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-foreground">Description <span className="text-muted-foreground font-normal">(optional)</span></label>
                  <Textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="What is this project about?"
                    rows={3}
                  />
                </div>

                {mutationError && (
                  <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg p-3">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {mutationError}
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Create Project
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : projects?.length === 0 ? (
          <div className="text-center py-24 bg-card border-2 border-dashed rounded-3xl">
            <div className="w-20 h-20 bg-secondary text-muted-foreground rounded-full flex items-center justify-center mx-auto mb-4">
              <Briefcase className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-bold mb-2">No projects yet</h3>
            <p className="text-muted-foreground mb-6">Create your first project to start tracking work.</p>
            <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-2" />Create Project</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects?.map(project => (
              <Link key={project.id} href={`/projects/${project.key}`}>
                <Card className="hover-elevate cursor-pointer h-full flex flex-col group border-border/60 hover:border-primary/50 transition-colors">
                  <CardHeader className="pb-4">
                    <div className="flex justify-between items-start">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-lg font-mono">
                        {project.key.charAt(0)}
                      </div>
                      <span className="text-xs font-mono bg-secondary px-2 py-1 rounded-md text-muted-foreground font-semibold">{project.key}</span>
                    </div>
                    <CardTitle className="text-xl mt-4 group-hover:text-primary transition-colors">{project.name}</CardTitle>
                    {project.description && (
                      <CardDescription className="line-clamp-2 mt-2">{project.description}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="mt-auto pt-4 border-t border-border/50 flex justify-between items-center text-sm text-muted-foreground">
                    <div className="font-medium">{project.issueCount ?? 0} issues</div>
                    <div className="flex items-center text-primary font-semibold opacity-0 group-hover:opacity-100 transition-opacity -translate-x-2 group-hover:translate-x-0 duration-200">
                      Open Board <ArrowRight className="w-4 h-4 ml-1" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
