import { Router, type Request, type Response } from "express";
import { db, jiraProjectsTable, jiraIssuesTable, jiraCommentsTable, usersTable, jiraCustomFieldDefsTable, jiraCustomFieldValuesTable } from "@workspace/db";
import { eq, and, desc, asc, sql, ilike, inArray } from "drizzle-orm";

const router = Router();

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return req.user.id;
}

async function enrichUser(userId: string | null) {
  if (!userId) return null;
  const [u] = await db.select({
    id: usersTable.id,
    username: usersTable.username,
    firstName: usersTable.firstName,
    lastName: usersTable.lastName,
    profileImageUrl: usersTable.profileImageUrl,
  }).from(usersTable).where(eq(usersTable.id, userId));
  return u ?? null;
}

// ─── Projects ────────────────────────────────────────────────────────────────

router.get("/projects", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const projects = await db.select().from(jiraProjectsTable).orderBy(desc(jiraProjectsTable.createdAt));
  const enriched = await Promise.all(projects.map(async p => {
    const [issueCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(jiraIssuesTable)
      .where(eq(jiraIssuesTable.projectId, p.id));
    const owner = await enrichUser(p.ownerId);
    return { ...p, issueCount: issueCount?.count ?? 0, owner };
  }));
  res.json(enriched);
});

router.post("/projects", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { name, key, description } = req.body as { name?: string; key?: string; description?: string };
  if (!name || !key) return res.status(400).json({ error: "name and key are required" });
  if (!/^[A-Z]{1,10}$/.test(key.toUpperCase())) return res.status(400).json({ error: "key must be 1-10 uppercase letters" });

  const [existing] = await db.select().from(jiraProjectsTable).where(eq(jiraProjectsTable.key, key.toUpperCase()));
  if (existing) return res.status(400).json({ error: "Project key already exists" });

  const [project] = await db.insert(jiraProjectsTable).values({
    name,
    key: key.toUpperCase(),
    description: description || null,
    ownerId: userId,
  }).returning();
  res.status(201).json({ ...project, issueCount: 0, owner: await enrichUser(userId) });
});

router.get("/projects/:key", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [project] = await db.select().from(jiraProjectsTable).where(eq(jiraProjectsTable.key, req.params.key));
  if (!project) return res.status(404).json({ error: "Project not found" });

  const [issueCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(jiraIssuesTable)
    .where(eq(jiraIssuesTable.projectId, project.id));
  const owner = await enrichUser(project.ownerId);
  res.json({ ...project, issueCount: issueCount?.count ?? 0, owner });
});

router.delete("/projects/:key", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [project] = await db.select().from(jiraProjectsTable).where(eq(jiraProjectsTable.key, req.params.key));
  if (!project) return res.status(404).json({ error: "Project not found" });
  if (project.ownerId !== userId) return res.status(403).json({ error: "Only the project owner can delete it" });

  await db.delete(jiraProjectsTable).where(eq(jiraProjectsTable.id, project.id));
  res.json({ success: true });
});

// ─── Custom Fields ────────────────────────────────────────────────────────────

function parseFieldDef(f: typeof jiraCustomFieldDefsTable.$inferSelect) {
  return { ...f, options: f.options ? (JSON.parse(f.options) as string[]) : [] };
}

router.get("/projects/:key/fields", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [project] = await db.select().from(jiraProjectsTable).where(eq(jiraProjectsTable.key, req.params.key));
  if (!project) return res.status(404).json({ error: "Project not found" });

  const fields = await db.select().from(jiraCustomFieldDefsTable)
    .where(eq(jiraCustomFieldDefsTable.projectId, project.id))
    .orderBy(asc(jiraCustomFieldDefsTable.position));
  res.json(fields.map(parseFieldDef));
});

router.post("/projects/:key/fields", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [project] = await db.select().from(jiraProjectsTable).where(eq(jiraProjectsTable.key, req.params.key));
  if (!project) return res.status(404).json({ error: "Project not found" });

  const { name, fieldType, options } = req.body as { name?: string; fieldType?: string; options?: string[] };
  if (!name || !fieldType) return res.status(400).json({ error: "name and fieldType are required" });
  if (!["text", "number", "select", "date"].includes(fieldType)) return res.status(400).json({ error: "invalid fieldType" });

  const [maxPos] = await db
    .select({ max: sql<number>`coalesce(max(position), 0)::int` })
    .from(jiraCustomFieldDefsTable)
    .where(eq(jiraCustomFieldDefsTable.projectId, project.id));

  const [field] = await db.insert(jiraCustomFieldDefsTable).values({
    projectId: project.id,
    name,
    fieldType: fieldType as any,
    options: (fieldType === "select" && options?.length) ? JSON.stringify(options) : null,
    position: (maxPos?.max ?? 0) + 1,
  }).returning();

  res.status(201).json(parseFieldDef(field));
});

router.patch("/projects/:key/fields/:fieldId", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [project] = await db.select().from(jiraProjectsTable).where(eq(jiraProjectsTable.key, req.params.key));
  if (!project) return res.status(404).json({ error: "Project not found" });

  const [field] = await db.select().from(jiraCustomFieldDefsTable)
    .where(and(eq(jiraCustomFieldDefsTable.id, req.params.fieldId), eq(jiraCustomFieldDefsTable.projectId, project.id)));
  if (!field) return res.status(404).json({ error: "Field not found" });

  const { name, options } = req.body as { name?: string; options?: string[] };
  const updates: Record<string, unknown> = {};
  if (name) updates.name = name;
  if (options !== undefined) updates.options = JSON.stringify(options);

  const [updated] = await db.update(jiraCustomFieldDefsTable).set(updates as any).where(eq(jiraCustomFieldDefsTable.id, field.id)).returning();
  res.json(parseFieldDef(updated));
});

router.delete("/projects/:key/fields/:fieldId", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [project] = await db.select().from(jiraProjectsTable).where(eq(jiraProjectsTable.key, req.params.key));
  if (!project) return res.status(404).json({ error: "Project not found" });

  const [field] = await db.select().from(jiraCustomFieldDefsTable)
    .where(and(eq(jiraCustomFieldDefsTable.id, req.params.fieldId), eq(jiraCustomFieldDefsTable.projectId, project.id)));
  if (!field) return res.status(404).json({ error: "Field not found" });

  await db.delete(jiraCustomFieldDefsTable).where(eq(jiraCustomFieldDefsTable.id, field.id));
  res.json({ success: true });
});

// ─── Issues ───────────────────────────────────────────────────────────────────

async function enrichIssue(issue: typeof jiraIssuesTable.$inferSelect, projectKey: string) {
  const assignee = await enrichUser(issue.assigneeId ?? null);
  const reporter = await enrichUser(issue.reporterId);
  const [commentCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(jiraCommentsTable)
    .where(eq(jiraCommentsTable.issueId, issue.id));
  return {
    ...issue,
    key: `${projectKey}-${issue.number}`,
    assignee,
    reporter,
    commentCount: commentCount?.count ?? 0,
  };
}

router.get("/projects/:key/issues", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [project] = await db.select().from(jiraProjectsTable).where(eq(jiraProjectsTable.key, req.params.key));
  if (!project) return res.status(404).json({ error: "Project not found" });

  const { status, type, priority, assigneeId, search } = req.query as Record<string, string>;
  const conditions = [eq(jiraIssuesTable.projectId, project.id)];
  if (status) conditions.push(eq(jiraIssuesTable.status, status as any));
  if (type) conditions.push(eq(jiraIssuesTable.type, type as any));
  if (priority) conditions.push(eq(jiraIssuesTable.priority, priority as any));
  if (assigneeId === "unassigned") conditions.push(sql`${jiraIssuesTable.assigneeId} IS NULL`);
  else if (assigneeId) conditions.push(eq(jiraIssuesTable.assigneeId, assigneeId));
  if (search) conditions.push(ilike(jiraIssuesTable.title, `%${search}%`));

  const issues = await db.select().from(jiraIssuesTable)
    .where(and(...conditions))
    .orderBy(asc(jiraIssuesTable.position), desc(jiraIssuesTable.createdAt));

  const enriched = await Promise.all(issues.map(i => enrichIssue(i, project.key)));
  res.json(enriched);
});

router.post("/projects/:key/issues", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [project] = await db.select().from(jiraProjectsTable).where(eq(jiraProjectsTable.key, req.params.key));
  if (!project) return res.status(404).json({ error: "Project not found" });

  const { title, description, type, priority, assigneeId } = req.body as {
    title?: string; description?: string; type?: string; priority?: string; assigneeId?: string;
  };
  if (!title) return res.status(400).json({ error: "title is required" });

  const [maxNum] = await db
    .select({ max: sql<number>`coalesce(max(number), 0)::int` })
    .from(jiraIssuesTable)
    .where(eq(jiraIssuesTable.projectId, project.id));
  const nextNumber = (maxNum?.max ?? 0) + 1;

  const [maxPos] = await db
    .select({ max: sql<number>`coalesce(max(position), 0)::int` })
    .from(jiraIssuesTable)
    .where(and(eq(jiraIssuesTable.projectId, project.id), eq(jiraIssuesTable.status, "todo")));

  const [issue] = await db.insert(jiraIssuesTable).values({
    projectId: project.id,
    number: nextNumber,
    title,
    description: description || null,
    type: (type as any) || "task",
    priority: (priority as any) || "medium",
    status: "todo",
    assigneeId: assigneeId || null,
    reporterId: userId,
    position: (maxPos?.max ?? 0) + 1,
  }).returning();

  res.status(201).json(await enrichIssue(issue, project.key));
});

router.get("/issues/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [issue] = await db.select().from(jiraIssuesTable).where(eq(jiraIssuesTable.id, req.params.id));
  if (!issue) return res.status(404).json({ error: "Issue not found" });

  const [project] = await db.select().from(jiraProjectsTable).where(eq(jiraProjectsTable.id, issue.projectId));
  const enriched = await enrichIssue(issue, project!.key);

  const comments = await db.select().from(jiraCommentsTable)
    .where(eq(jiraCommentsTable.issueId, issue.id))
    .orderBy(asc(jiraCommentsTable.createdAt));
  const enrichedComments = await Promise.all(comments.map(async c => ({
    ...c,
    author: await enrichUser(c.authorId),
  })));

  const customFieldValues = await db.select().from(jiraCustomFieldValuesTable)
    .where(eq(jiraCustomFieldValuesTable.issueId, issue.id));

  res.json({ ...enriched, comments: enrichedComments, customFieldValues });
});

router.patch("/issues/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [issue] = await db.select().from(jiraIssuesTable).where(eq(jiraIssuesTable.id, req.params.id));
  if (!issue) return res.status(404).json({ error: "Issue not found" });

  const { title, description, status, priority, type, assigneeId, position } = req.body as Record<string, any>;
  const updates: Record<string, any> = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (status !== undefined) updates.status = status;
  if (priority !== undefined) updates.priority = priority;
  if (type !== undefined) updates.type = type;
  if (assigneeId !== undefined) updates.assigneeId = assigneeId || null;
  if (position !== undefined) updates.position = position;

  const [updated] = await db.update(jiraIssuesTable).set(updates).where(eq(jiraIssuesTable.id, issue.id)).returning();
  const [project] = await db.select().from(jiraProjectsTable).where(eq(jiraProjectsTable.id, updated.projectId));
  res.json(await enrichIssue(updated, project!.key));
});

router.patch("/issues/:id/status", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { status } = req.body as { status?: string };
  if (!status || !["todo", "in_progress", "review", "done"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  const [issue] = await db.select().from(jiraIssuesTable).where(eq(jiraIssuesTable.id, req.params.id));
  if (!issue) return res.status(404).json({ error: "Issue not found" });

  const [updated] = await db.update(jiraIssuesTable)
    .set({ status: status as any })
    .where(eq(jiraIssuesTable.id, issue.id))
    .returning();
  const [project] = await db.select().from(jiraProjectsTable).where(eq(jiraProjectsTable.id, updated.projectId));
  res.json(await enrichIssue(updated, project!.key));
});

router.patch("/issues/:id/custom-fields", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [issue] = await db.select().from(jiraIssuesTable).where(eq(jiraIssuesTable.id, req.params.id));
  if (!issue) return res.status(404).json({ error: "Issue not found" });

  const { values } = req.body as { values: Record<string, string | null> };
  if (!values || typeof values !== "object") return res.status(400).json({ error: "values object required" });

  for (const [fieldId, value] of Object.entries(values)) {
    if (value === null || value === "") {
      await db.delete(jiraCustomFieldValuesTable)
        .where(and(eq(jiraCustomFieldValuesTable.issueId, issue.id), eq(jiraCustomFieldValuesTable.fieldId, fieldId)));
    } else {
      await db.insert(jiraCustomFieldValuesTable)
        .values({ issueId: issue.id, fieldId, value })
        .onConflictDoUpdate({
          target: [jiraCustomFieldValuesTable.issueId, jiraCustomFieldValuesTable.fieldId],
          set: { value, updatedAt: new Date() },
        });
    }
  }

  const updated = await db.select().from(jiraCustomFieldValuesTable)
    .where(eq(jiraCustomFieldValuesTable.issueId, issue.id));
  res.json({ customFieldValues: updated });
});

router.delete("/issues/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [issue] = await db.select().from(jiraIssuesTable).where(eq(jiraIssuesTable.id, req.params.id));
  if (!issue) return res.status(404).json({ error: "Issue not found" });

  await db.delete(jiraIssuesTable).where(eq(jiraIssuesTable.id, issue.id));
  res.json({ success: true });
});

// ─── Export ───────────────────────────────────────────────────────────────────

router.get("/projects/:key/issues/export", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [project] = await db.select().from(jiraProjectsTable).where(eq(jiraProjectsTable.key, req.params.key));
  if (!project) return res.status(404).json({ error: "Project not found" });

  const { status, type, priority, assigneeId, search } = req.query as Record<string, string>;
  const conditions = [eq(jiraIssuesTable.projectId, project.id)];
  if (status) conditions.push(eq(jiraIssuesTable.status, status as any));
  if (type) conditions.push(eq(jiraIssuesTable.type, type as any));
  if (priority) conditions.push(eq(jiraIssuesTable.priority, priority as any));
  if (assigneeId === "unassigned") conditions.push(sql`${jiraIssuesTable.assigneeId} IS NULL`);
  else if (assigneeId) conditions.push(eq(jiraIssuesTable.assigneeId, assigneeId));
  if (search) conditions.push(ilike(jiraIssuesTable.title, `%${search}%`));

  const issues = await db.select().from(jiraIssuesTable)
    .where(and(...conditions))
    .orderBy(asc(jiraIssuesTable.position), desc(jiraIssuesTable.createdAt));

  const fieldDefs = await db.select().from(jiraCustomFieldDefsTable)
    .where(eq(jiraCustomFieldDefsTable.projectId, project.id))
    .orderBy(asc(jiraCustomFieldDefsTable.position));

  const allUsers = await db.select({ id: usersTable.id, username: usersTable.username }).from(usersTable);
  const userMap = new Map(allUsers.map(u => [u.id, u.username ?? ""]));

  let allValues: (typeof jiraCustomFieldValuesTable.$inferSelect)[] = [];
  if (issues.length > 0) {
    allValues = await db.select().from(jiraCustomFieldValuesTable)
      .where(inArray(jiraCustomFieldValuesTable.issueId, issues.map(i => i.id)));
  }

  const valueMap = new Map<string, Map<string, string>>();
  for (const v of allValues) {
    if (!valueMap.has(v.issueId)) valueMap.set(v.issueId, new Map());
    valueMap.get(v.issueId)!.set(v.fieldId, v.value ?? "");
  }

  const csvEscape = (val: string) => `"${String(val ?? "").replace(/"/g, '""')}"`;
  const headers = ["Key", "Title", "Type", "Status", "Priority", "Assignee", "Reporter", "Created", "Updated", ...fieldDefs.map(f => f.name)];

  const rows = [
    headers.map(csvEscape).join(","),
    ...issues.map(issue => {
      const issueVals = valueMap.get(issue.id) ?? new Map<string, string>();
      return [
        `${project.key}-${issue.number}`,
        issue.title,
        issue.type,
        issue.status,
        issue.priority,
        issue.assigneeId ? (userMap.get(issue.assigneeId) ?? "") : "",
        userMap.get(issue.reporterId) ?? "",
        new Date(issue.createdAt).toISOString().split("T")[0],
        new Date(issue.updatedAt).toISOString().split("T")[0],
        ...fieldDefs.map(f => issueVals.get(f.id) ?? ""),
      ].map(csvEscape).join(",");
    }),
  ];

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${project.key}-issues.csv"`);
  res.send(rows.join("\n"));
});

// ─── Comments ─────────────────────────────────────────────────────────────────

router.get("/issues/:id/comments", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const comments = await db.select().from(jiraCommentsTable)
    .where(eq(jiraCommentsTable.issueId, req.params.id))
    .orderBy(asc(jiraCommentsTable.createdAt));
  const enriched = await Promise.all(comments.map(async c => ({
    ...c,
    author: await enrichUser(c.authorId),
  })));
  res.json(enriched);
});

router.post("/issues/:id/comments", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { content } = req.body as { content?: string };
  if (!content?.trim()) return res.status(400).json({ error: "content is required" });

  const [issue] = await db.select().from(jiraIssuesTable).where(eq(jiraIssuesTable.id, req.params.id));
  if (!issue) return res.status(404).json({ error: "Issue not found" });

  const [comment] = await db.insert(jiraCommentsTable).values({
    issueId: req.params.id,
    authorId: userId,
    content: content.trim(),
  }).returning();

  res.status(201).json({ ...comment, author: await enrichUser(userId) });
});

router.delete("/comments/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [comment] = await db.select().from(jiraCommentsTable).where(eq(jiraCommentsTable.id, req.params.id));
  if (!comment) return res.status(404).json({ error: "Comment not found" });
  if (comment.authorId !== userId) return res.status(403).json({ error: "Cannot delete another user's comment" });

  await db.delete(jiraCommentsTable).where(eq(jiraCommentsTable.id, req.params.id));
  res.json({ success: true });
});

// ─── Members / Users ──────────────────────────────────────────────────────────

router.get("/projects/:key/members", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [project] = await db.select().from(jiraProjectsTable).where(eq(jiraProjectsTable.key, req.params.key));
  if (!project) return res.status(404).json({ error: "Project not found" });

  const issues = await db.select({ assigneeId: jiraIssuesTable.assigneeId, reporterId: jiraIssuesTable.reporterId })
    .from(jiraIssuesTable)
    .where(eq(jiraIssuesTable.projectId, project.id));

  const userIds = [...new Set([
    project.ownerId,
    ...issues.flatMap(i => [i.assigneeId, i.reporterId].filter(Boolean) as string[])
  ])];

  const members = await Promise.all(userIds.map(id => enrichUser(id)));
  res.json(members.filter(Boolean));
});

router.get("/users", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const users = await db.select({
    id: usersTable.id,
    username: usersTable.username,
    firstName: usersTable.firstName,
    lastName: usersTable.lastName,
    profileImageUrl: usersTable.profileImageUrl,
  }).from(usersTable).orderBy(asc(usersTable.username));
  res.json(users);
});

export default router;
