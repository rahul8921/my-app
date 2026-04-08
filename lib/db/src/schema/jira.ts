import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, varchar, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const jiraProjectsTable = pgTable("jira_projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: varchar("key", { length: 10 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  ownerId: varchar("owner_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const jiraIssuesTable = pgTable(
  "jira_issues",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    projectId: varchar("project_id")
      .notNull()
      .references(() => jiraProjectsTable.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    type: varchar("type", { enum: ["bug", "task", "story", "epic"] }).notNull().default("task"),
    priority: varchar("priority", { enum: ["low", "medium", "high", "critical"] }).notNull().default("medium"),
    status: varchar("status", { enum: ["todo", "in_progress", "review", "done"] }).notNull().default("todo"),
    assigneeId: varchar("assignee_id").references(() => usersTable.id, { onDelete: "set null" }),
    reporterId: varchar("reporter_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("jira_issues_project_idx").on(table.projectId),
    index("jira_issues_assignee_idx").on(table.assigneeId),
  ],
);

export const jiraCommentsTable = pgTable(
  "jira_comments",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    issueId: varchar("issue_id")
      .notNull()
      .references(() => jiraIssuesTable.id, { onDelete: "cascade" }),
    authorId: varchar("author_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [index("jira_comments_issue_idx").on(table.issueId)],
);

export const jiraCustomFieldDefsTable = pgTable(
  "jira_custom_field_defs",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    projectId: varchar("project_id")
      .notNull()
      .references(() => jiraProjectsTable.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    fieldType: varchar("field_type", { enum: ["text", "number", "select", "date"] }).notNull().default("text"),
    options: text("options"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("jira_custom_fields_project_idx").on(table.projectId)],
);

export const jiraCustomFieldValuesTable = pgTable(
  "jira_custom_field_values",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    issueId: varchar("issue_id")
      .notNull()
      .references(() => jiraIssuesTable.id, { onDelete: "cascade" }),
    fieldId: varchar("field_id")
      .notNull()
      .references(() => jiraCustomFieldDefsTable.id, { onDelete: "cascade" }),
    value: text("value"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("jira_cfv_unique_idx").on(table.issueId, table.fieldId),
    index("jira_cfv_issue_idx").on(table.issueId),
  ],
);

export type JiraProject = typeof jiraProjectsTable.$inferSelect;
export type InsertJiraProject = typeof jiraProjectsTable.$inferInsert;
export type JiraIssue = typeof jiraIssuesTable.$inferSelect;
export type InsertJiraIssue = typeof jiraIssuesTable.$inferInsert;
export type JiraComment = typeof jiraCommentsTable.$inferSelect;
export type InsertJiraComment = typeof jiraCommentsTable.$inferInsert;
export type JiraCustomFieldDef = typeof jiraCustomFieldDefsTable.$inferSelect;
export type JiraCustomFieldValue = typeof jiraCustomFieldValuesTable.$inferSelect;
