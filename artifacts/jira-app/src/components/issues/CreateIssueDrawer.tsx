import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateIssue } from "@/hooks/use-issues";
import { useUsers } from "@/hooks/use-users";
import { TypeIcon, PriorityIcon } from "./IssueIcons";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  type: z.enum(["bug", "task", "story", "epic"]),
  priority: z.enum(["low", "medium", "high", "critical"]),
  assigneeId: z.string().optional().nullable(),
});

export function CreateIssueDrawer({ projectKey, children }: { projectKey: string, children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { data: users } = useUsers();
  const createMutation = useCreateIssue();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      type: "task",
      priority: "medium",
      assigneeId: null,
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    createMutation.mutate({
      projectKey,
      data: {
        ...values,
        status: "todo",
      }
    }, {
      onSuccess: () => {
        toast({ title: "Issue created successfully" });
        setOpen(false);
        form.reset();
      },
      onError: (err) => {
        toast({ title: "Failed to create issue", description: err.message, variant: "destructive" });
      }
    });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {children}
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>Create Issue</SheetTitle>
          <SheetDescription>Add a new issue to {projectKey}</SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Issue Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="task"><div className="flex items-center"><TypeIcon type="task" className="mr-2 w-4 h-4"/> Task</div></SelectItem>
                      <SelectItem value="bug"><div className="flex items-center"><TypeIcon type="bug" className="mr-2 w-4 h-4"/> Bug</div></SelectItem>
                      <SelectItem value="story"><div className="flex items-center"><TypeIcon type="story" className="mr-2 w-4 h-4"/> Story</div></SelectItem>
                      <SelectItem value="epic"><div className="flex items-center"><TypeIcon type="epic" className="mr-2 w-4 h-4"/> Epic</div></SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Summary</FormLabel>
                  <FormControl>
                    <Input placeholder="What needs to be done?" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Add more details..." className="min-h-[120px]" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select priority" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="low"><div className="flex items-center"><PriorityIcon priority="low" className="mr-2 w-4 h-4"/> Low</div></SelectItem>
                        <SelectItem value="medium"><div className="flex items-center"><PriorityIcon priority="medium" className="mr-2 w-4 h-4"/> Medium</div></SelectItem>
                        <SelectItem value="high"><div className="flex items-center"><PriorityIcon priority="high" className="mr-2 w-4 h-4"/> High</div></SelectItem>
                        <SelectItem value="critical"><div className="flex items-center"><PriorityIcon priority="critical" className="mr-2 w-4 h-4"/> Critical</div></SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="assigneeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assignee</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || undefined}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {users?.map(u => (
                          <SelectItem key={u.id} value={u.id}>{u.username}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="pt-6 border-t flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create Issue
              </Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
