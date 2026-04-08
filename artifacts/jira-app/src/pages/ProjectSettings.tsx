import { useState } from "react";
import { useRoute } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { useProject } from "@/hooks/use-projects";
import { useCustomFields, useCreateCustomField, useDeleteCustomField, useUpdateCustomField } from "@/hooks/use-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, Settings, Tag, Hash, List, Calendar } from "lucide-react";
import type { FieldType } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";

const FIELD_TYPE_ICONS: Record<FieldType, React.ReactNode> = {
  text: <Tag className="w-4 h-4" />,
  number: <Hash className="w-4 h-4" />,
  select: <List className="w-4 h-4" />,
  date: <Calendar className="w-4 h-4" />,
};

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Text",
  number: "Number",
  select: "Select",
  date: "Date",
};

export default function ProjectSettings() {
  const [, params] = useRoute("/projects/:key/settings");
  const projectKey = params?.key || "";
  const { data: project, isLoading: projLoading } = useProject(projectKey);
  const { data: fields, isLoading: fieldsLoading } = useCustomFields(projectKey);
  const createField = useCreateCustomField(projectKey);
  const deleteField = useDeleteCustomField(projectKey);
  const updateField = useUpdateCustomField(projectKey);
  const { toast } = useToast();

  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<FieldType>("text");
  const [newOptions, setNewOptions] = useState("");
  const [editingOptions, setEditingOptions] = useState<string | null>(null);
  const [editOptionsValue, setEditOptionsValue] = useState("");

  const handleCreate = () => {
    if (!newName.trim()) return;
    const options = newType === "select" ? newOptions.split(",").map(s => s.trim()).filter(Boolean) : undefined;
    createField.mutate({ name: newName.trim(), fieldType: newType, options }, {
      onSuccess: () => {
        setNewName("");
        setNewOptions("");
        toast({ title: "Field created" });
      },
      onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
    });
  };

  const handleDelete = (fieldId: string, name: string) => {
    if (!window.confirm(`Delete field "${name}"? All values will be lost.`)) return;
    deleteField.mutate(fieldId, {
      onSuccess: () => toast({ title: "Field deleted" }),
      onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
    });
  };

  const handleSaveOptions = (fieldId: string) => {
    const options = editOptionsValue.split(",").map(s => s.trim()).filter(Boolean);
    updateField.mutate({ fieldId, data: { options } }, {
      onSuccess: () => {
        setEditingOptions(null);
        toast({ title: "Options updated" });
      },
    });
  };

  const isLoading = projLoading || fieldsLoading;

  if (isLoading) return (
    <AppLayout>
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    </AppLayout>
  );

  if (!project) return <AppLayout><div className="p-8">Project not found</div></AppLayout>;

  return (
    <AppLayout>
      <div className="flex flex-col h-full w-full max-w-3xl mx-auto px-8 py-6">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 rounded-xl bg-secondary text-foreground flex items-center justify-center border border-border">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono bg-secondary px-2 py-0.5 rounded text-muted-foreground font-semibold tracking-wider">{project.key}</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground leading-none">Project Settings</h1>
          </div>
        </div>

        <div className="bg-card border rounded-2xl shadow-sm p-6 mb-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Custom Fields</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Add custom fields to capture extra data on issues — like sprint, story points, environment, or any metadata you need.
          </p>

          {fields?.length === 0 && (
            <div className="text-center py-8 border border-dashed rounded-xl text-muted-foreground text-sm italic mb-6">
              No custom fields yet. Add one below.
            </div>
          )}

          <div className="space-y-3 mb-6">
            {fields?.map(field => (
              <div key={field.id} className="flex items-start gap-3 p-4 bg-secondary/40 rounded-xl border border-border group">
                <div className="text-muted-foreground mt-0.5">{FIELD_TYPE_ICONS[field.fieldType]}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm text-foreground">{field.name}</span>
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5">{FIELD_TYPE_LABELS[field.fieldType]}</Badge>
                  </div>
                  {field.fieldType === "select" && (
                    <div>
                      {editingOptions === field.id ? (
                        <div className="flex gap-2 mt-2">
                          <Input
                            value={editOptionsValue}
                            onChange={e => setEditOptionsValue(e.target.value)}
                            placeholder="Option 1, Option 2, Option 3"
                            className="h-7 text-xs"
                          />
                          <Button size="sm" className="h-7 text-xs" onClick={() => handleSaveOptions(field.id)}>Save</Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingOptions(null)}>Cancel</Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 flex-wrap mt-1">
                          {field.options.length > 0 ? field.options.map(opt => (
                            <Badge key={opt} variant="secondary" className="text-[10px]">{opt}</Badge>
                          )) : <span className="text-xs text-muted-foreground italic">No options</span>}
                          <button
                            onClick={() => { setEditingOptions(field.id); setEditOptionsValue(field.options.join(", ")); }}
                            className="text-xs text-primary hover:underline ml-1"
                          >
                            edit
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => handleDelete(field.id, field.name)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>

          <div className="border-t border-border pt-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Add New Field</h3>
            <div className="flex gap-2 flex-wrap">
              <Input
                placeholder="Field name (e.g. Sprint, Points, Environment)"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="flex-1 min-w-48"
                onKeyDown={e => e.key === "Enter" && handleCreate()}
              />
              <Select value={newType} onValueChange={v => setNewType(v as FieldType)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="select">Select</SelectItem>
                  <SelectItem value="date">Date</SelectItem>
                </SelectContent>
              </Select>
              {newType === "select" && (
                <Input
                  placeholder="Options: A, B, C"
                  value={newOptions}
                  onChange={e => setNewOptions(e.target.value)}
                  className="flex-1 min-w-48"
                />
              )}
              <Button onClick={handleCreate} disabled={!newName.trim() || createField.isPending}>
                {createField.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
                Add Field
              </Button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
