import { useState } from "react";
import { Link } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { useProjects, useCreateProject } from "@/hooks/use-projects";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Briefcase, Plus, Loader2, ArrowRight } from "lucide-react";
import { format } from "date-fns";

const createSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  key: z.string().min(2, "Key must be at least 2 characters").max(10, "Key too long").toUpperCase(),
  description: z.string().optional(),
});

export default function Projects() {
  const { data: projects, isLoading } = useProjects();
  const createMutation = useCreateProject();
  const [open, setOpen] = useState(false);

  const form = useForm<z.infer<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: "", key: "", description: "" }
  });

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    form.setValue("name", name);
    // auto-generate key: grab first letters of words, max 4 chars
    if (!form.formState.dirtyFields.key) {
      const generated = name.split(/\s+/).map(w => w[0]).join('').substring(0, 4).toUpperCase();
      form.setValue("key", generated);
    }
  };

  const onSubmit = (values: z.infer<typeof createSchema>) => {
    createMutation.mutate(values, {
      onSuccess: () => {
        setOpen(false);
        form.reset();
      }
    });
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

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="font-semibold shadow-lg shadow-primary/20">
                <Plus className="w-5 h-5 mr-2" />
                Create Project
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create new project</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project Name</FormLabel>
                      <FormControl><Input placeholder="e.g. Website Redesign" {...field} onChange={(e) => { field.onChange(e); handleNameChange(e); }} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="key" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project Key</FormLabel>
                      <FormControl><Input placeholder="WEB" {...field} className="uppercase" /></FormControl>
                      <p className="text-[10px] text-muted-foreground">Used as prefix for issue IDs (e.g. WEB-123)</p>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="description" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl><Textarea placeholder="Optional details about this project..." {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="flex justify-end pt-4">
                    <Button type="submit" disabled={createMutation.isPending}>
                      {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Create Project
                    </Button>
                  </div>
                </form>
              </Form>
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
            <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-2"/> Create Project</Button>
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
                      <span className="text-xs font-mono bg-secondary px-2 py-1 rounded-md text-muted-foreground font-semibold">Key: {project.key}</span>
                    </div>
                    <CardTitle className="text-xl mt-4 group-hover:text-primary transition-colors">{project.name}</CardTitle>
                    {project.description && (
                      <CardDescription className="line-clamp-2 mt-2">{project.description}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="mt-auto pt-4 border-t border-border/50 flex justify-between items-center text-sm text-muted-foreground">
                    <div className="font-medium">
                      {project._count?.issues || 0} issues
                    </div>
                    <div className="flex items-center text-primary font-semibold opacity-0 group-hover:opacity-100 transition-opacity translate-x-[-10px] group-hover:translate-x-0">
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
