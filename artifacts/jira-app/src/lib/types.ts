export type IssueType = "bug" | "task" | "story" | "epic";
export type Priority = "low" | "medium" | "high" | "critical";
export type Status = "todo" | "in_progress" | "review" | "done";

export interface User {
  id: string;
  username: string;
  profileImageUrl: string | null;
}

export interface Project {
  id: number;
  key: string;
  name: string;
  description: string | null;
  createdAt: string;
  _count?: {
    issues: number;
  };
}

export interface Issue {
  id: number;
  key: string;
  projectId: number;
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
}

export interface Comment {
  id: number;
  issueId: number;
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
