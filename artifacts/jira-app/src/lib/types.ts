export type IssueType = "bug" | "task" | "story" | "epic";
export type Priority = "low" | "medium" | "high" | "critical";
export type Status = "todo" | "in_progress" | "review" | "done";
export type FieldType = "text" | "number" | "select" | "date";

export interface User {
  id: string;
  username: string;
  profileImageUrl: string | null;
}

export interface Project {
  id: string;
  key: string;
  name: string;
  description: string | null;
  createdAt: string;
  issueCount?: number;
  _count?: {
    issues: number;
  };
}

export interface CustomFieldDef {
  id: string;
  projectId: string;
  name: string;
  fieldType: FieldType;
  options: string[];
  position: number;
  createdAt: string;
}

export interface CustomFieldValue {
  id: string;
  issueId: string;
  fieldId: string;
  value: string | null;
}

export interface Issue {
  id: string;
  key: string;
  projectId: string;
  title: string;
  description: string | null;
  type: IssueType;
  priority: Priority;
  status: Status;
  assigneeId: string | null;
  reporterId: string;
  createdAt: string;
  updatedAt: string;
  assignee?: User | null;
  reporter?: User | null;
  customFieldValues?: CustomFieldValue[];
}

export interface Comment {
  id: string;
  issueId: string;
  userId: string;
  content: string;
  createdAt: string;
  user?: User;
}

export interface AuthUser {
  id: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  profileImage?: string;
  isAdmin: boolean;
}

export interface IssueFilters {
  search?: string;
  status?: string;
  type?: string;
  priority?: string;
  assigneeId?: string;
}
