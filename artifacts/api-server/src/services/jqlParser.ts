import { eq, ne, ilike, inArray, not, gt, lt, gte, lte, isNull, isNotNull, sql, and, SQL } from "drizzle-orm";
import { db, jiraIssuesTable, usersTable, jiraCustomFieldDefsTable, jiraCustomFieldValuesTable } from "@workspace/db";

type StatusVal = "todo" | "in_progress" | "review" | "done";
type TypeVal = "bug" | "task" | "story" | "epic";
type PriorityVal = "low" | "medium" | "high" | "critical";

const STATUS_MAP: Record<string, StatusVal> = {
  "todo": "todo", "to do": "todo", "to_do": "todo",
  "in_progress": "in_progress", "in progress": "in_progress", "inprogress": "in_progress",
  "review": "review", "in review": "review", "in_review": "review",
  "done": "done", "complete": "done", "completed": "done",
};

const TYPE_MAP: Record<string, TypeVal> = {
  "bug": "bug", "task": "task", "story": "story", "epic": "epic",
};

const PRIORITY_MAP: Record<string, PriorityVal> = {
  "low": "low",
  "medium": "medium", "med": "medium",
  "high": "high",
  "critical": "critical", "crit": "critical",
};

export class JQLError extends Error {
  constructor(message: string) { super(message); this.name = "JQLError"; }
}

function stripQuotes(s: string): string {
  return s.trim().replace(/^["'`]|["'`]$/g, "");
}

function parseList(raw: string): string[] {
  const inner = raw.replace(/^\s*\(\s*|\s*\)\s*$/g, "");
  const values: string[] = [];
  let cur = "", inQ = false, qChar = "";
  for (const ch of inner) {
    if ((ch === '"' || ch === "'" || ch === "`") && !inQ) { inQ = true; qChar = ch; }
    else if (ch === qChar && inQ) { inQ = false; }
    else if (ch === "," && !inQ) { values.push(stripQuotes(cur)); cur = ""; }
    else { cur += ch; }
  }
  if (cur.trim()) values.push(stripQuotes(cur));
  return values.filter(Boolean);
}

function splitByAnd(jql: string): string[] {
  const clauses: string[] = [];
  let depth = 0, inQ = false, qChar = "", start = 0, i = 0;
  while (i < jql.length) {
    const ch = jql[i];
    if ((ch === '"' || ch === "'" || ch === "`") && !inQ) { inQ = true; qChar = ch; }
    else if (ch === qChar && inQ) { inQ = false; }
    else if (ch === "(" && !inQ) { depth++; }
    else if (ch === ")" && !inQ) { depth--; }
    else if (!inQ && depth === 0 && /^AND\s/i.test(jql.slice(i))) {
      clauses.push(jql.slice(start, i).trim());
      i += 4;
      start = i;
      continue;
    }
    i++;
  }
  if (start < jql.length) clauses.push(jql.slice(start).trim());
  return clauses.filter(Boolean);
}

export interface ParsedOrder { field: string; dir: "asc" | "desc"; }

function extractOrderBy(jql: string): { query: string; order?: ParsedOrder } {
  const m = jql.match(/\s+ORDER\s+BY\s+(\w+)(?:\s+(ASC|DESC))?\s*$/i);
  if (!m) return { query: jql.trim() };
  const field = m[1].toLowerCase();
  const dir = (m[2]?.toLowerCase() ?? "asc") as "asc" | "desc";
  return { query: jql.slice(0, jql.length - m[0].length).trim(), order: { field, dir } };
}

async function getCustomField(field: string, projectId: string) {
  const [cf] = await db.select()
    .from(jiraCustomFieldDefsTable)
    .where(and(
      eq(jiraCustomFieldDefsTable.projectId, projectId),
      sql`lower(${jiraCustomFieldDefsTable.name}) = ${field.toLowerCase()}`,
    ));
  return cf ?? null;
}

async function buildCustomFieldCondition(
  cf: typeof jiraCustomFieldDefsTable.$inferSelect,
  op: string,
  value: string,
): Promise<SQL> {
  let valueCondition: SQL;
  if (op === "=" || op === "~") {
    valueCondition = op === "~"
      ? ilike(jiraCustomFieldValuesTable.value, `%${value}%`)
      : eq(jiraCustomFieldValuesTable.value, value);
  } else if (op === "!=" || op === "!~") {
    valueCondition = op === "!~"
      ? not(ilike(jiraCustomFieldValuesTable.value, `%${value}%`))
      : ne(jiraCustomFieldValuesTable.value, value);
  } else if ([">", ">=", "<", "<="].includes(op)) {
    if (cf.fieldType === "number") {
      const num = parseFloat(value);
      if (isNaN(num)) throw new JQLError(`"${value}" is not a valid number for field "${cf.name}"`);
      if (op === ">") valueCondition = sql`cast(${jiraCustomFieldValuesTable.value} as numeric) > ${num}`;
      else if (op === ">=") valueCondition = sql`cast(${jiraCustomFieldValuesTable.value} as numeric) >= ${num}`;
      else if (op === "<") valueCondition = sql`cast(${jiraCustomFieldValuesTable.value} as numeric) < ${num}`;
      else valueCondition = sql`cast(${jiraCustomFieldValuesTable.value} as numeric) <= ${num}`;
    } else if (cf.fieldType === "date") {
      const d = new Date(value);
      if (isNaN(d.getTime())) throw new JQLError(`"${value}" is not a valid date for field "${cf.name}"`);
      if (op === ">") valueCondition = sql`cast(${jiraCustomFieldValuesTable.value} as date) > ${value}::date`;
      else if (op === ">=") valueCondition = sql`cast(${jiraCustomFieldValuesTable.value} as date) >= ${value}::date`;
      else if (op === "<") valueCondition = sql`cast(${jiraCustomFieldValuesTable.value} as date) < ${value}::date`;
      else valueCondition = sql`cast(${jiraCustomFieldValuesTable.value} as date) <= ${value}::date`;
    } else {
      throw new JQLError(`Operator "${op}" requires a number or date field. "${cf.name}" is type "${cf.fieldType}"`);
    }
  } else {
    throw new JQLError(`Operator "${op}" is not supported for custom field "${cf.name}"`);
  }

  const sub = db.select({ id: jiraCustomFieldValuesTable.issueId })
    .from(jiraCustomFieldValuesTable)
    .where(and(eq(jiraCustomFieldValuesTable.fieldId, cf.id), valueCondition));
  return inArray(jiraIssuesTable.id, sub);
}

export async function parseJQL(
  jql: string,
  projectId: string,
): Promise<{ conditions: SQL[]; order?: ParsedOrder }> {
  if (!jql.trim()) return { conditions: [eq(jiraIssuesTable.projectId, projectId)] };

  const { query: queryPart, order } = extractOrderBy(jql);
  const conditions: SQL[] = [eq(jiraIssuesTable.projectId, projectId)];
  const clauses = splitByAnd(queryPart);

  for (const clause of clauses) {
    const c = clause.trim();
    if (!c) continue;

    // --- IS EMPTY / IS NOT EMPTY ---
    if (/^\w+\s+is\s+not\s+empty$/i.test(c)) {
      const field = c.match(/^(\w+)/i)![1].toLowerCase();
      if (field === "assignee") { conditions.push(isNotNull(jiraIssuesTable.assigneeId)); continue; }
      throw new JQLError(`"is not EMPTY" is only supported for the "assignee" field`);
    }
    if (/^\w+\s+is\s+empty$/i.test(c)) {
      const field = c.match(/^(\w+)/i)![1].toLowerCase();
      if (field === "assignee") { conditions.push(isNull(jiraIssuesTable.assigneeId)); continue; }
      throw new JQLError(`"is EMPTY" is only supported for the "assignee" field`);
    }

    // --- NOT IN ---
    const notInM = c.match(/^(\w+)\s+not\s+in\s*(\([\s\S]*\))$/i);
    if (notInM) {
      await applyListCondition(notInM[1].toLowerCase(), parseList(notInM[2]), true, conditions, projectId);
      continue;
    }

    // --- IN ---
    const inM = c.match(/^(\w+)\s+in\s*(\([\s\S]*\))$/i);
    if (inM) {
      await applyListCondition(inM[1].toLowerCase(), parseList(inM[2]), false, conditions, projectId);
      continue;
    }

    // --- Quoted field name (custom fields with spaces) ---
    const quotedFieldM = c.match(/^["']([^"']+)["']\s*(>=|<=|!=|!~|=|~|>|<)\s*([\s\S]+)$/);
    if (quotedFieldM) {
      const fieldName = quotedFieldM[1];
      const op = quotedFieldM[2];
      const value = stripQuotes(quotedFieldM[3].trim());
      const cf = await getCustomField(fieldName, projectId);
      if (!cf) throw new JQLError(`Unknown field: "${fieldName}"`);
      conditions.push(await buildCustomFieldCondition(cf, op, value));
      continue;
    }

    // --- Standard: field op value ---
    const opM = c.match(/^(\w+)\s*(>=|<=|!=|!~|=|~|>|<)\s*([\s\S]+)$/);
    if (!opM) throw new JQLError(`Cannot parse: "${c}"\nExpected format: field operator value`);

    const [, rawField, op, rawVal] = opM;
    const field = rawField.toLowerCase();
    const value = stripQuotes(rawVal.trim());
    const vLow = value.toLowerCase();

    switch (field) {
      case "status": {
        const mapped = STATUS_MAP[vLow];
        if (!mapped) throw new JQLError(`Unknown status: "${value}"\nValid: todo, "in progress", review, done`);
        conditions.push(op === "!=" ? ne(jiraIssuesTable.status, mapped) : eq(jiraIssuesTable.status, mapped));
        break;
      }
      case "type":
      case "issuetype": {
        const mapped = TYPE_MAP[vLow];
        if (!mapped) throw new JQLError(`Unknown type: "${value}"\nValid: bug, task, story, epic`);
        conditions.push(op === "!=" ? ne(jiraIssuesTable.type, mapped) : eq(jiraIssuesTable.type, mapped));
        break;
      }
      case "priority": {
        const mapped = PRIORITY_MAP[vLow];
        if (!mapped) throw new JQLError(`Unknown priority: "${value}"\nValid: low, medium, high, critical`);
        conditions.push(op === "!=" ? ne(jiraIssuesTable.priority, mapped) : eq(jiraIssuesTable.priority, mapped));
        break;
      }
      case "assignee": {
        if (vLow === "empty" || vLow === "null" || vLow === "unassigned") {
          conditions.push(op === "!=" ? isNotNull(jiraIssuesTable.assigneeId) : isNull(jiraIssuesTable.assigneeId));
        } else {
          const [user] = await db.select({ id: usersTable.id })
            .from(usersTable).where(sql`lower(${usersTable.username}) = ${vLow}`);
          if (!user) throw new JQLError(`No user found with username "${value}"`);
          conditions.push(op === "!=" ? ne(jiraIssuesTable.assigneeId, user.id) : eq(jiraIssuesTable.assigneeId, user.id));
        }
        break;
      }
      case "summary":
      case "text":
      case "title": {
        if (op === "~") conditions.push(ilike(jiraIssuesTable.title, `%${value}%`));
        else if (op === "!~") conditions.push(not(ilike(jiraIssuesTable.title, `%${value}%`)));
        else if (op === "=") conditions.push(eq(jiraIssuesTable.title, value));
        else if (op === "!=") conditions.push(ne(jiraIssuesTable.title, value));
        else throw new JQLError(`Use ~ for text contains, e.g.: summary ~ "login"`);
        break;
      }
      case "created": {
        const d = new Date(value);
        if (isNaN(d.getTime())) throw new JQLError(`Invalid date: "${value}" — use YYYY-MM-DD`);
        if (op === ">") conditions.push(gt(jiraIssuesTable.createdAt, d));
        else if (op === "<") conditions.push(lt(jiraIssuesTable.createdAt, d));
        else if (op === ">=") conditions.push(gte(jiraIssuesTable.createdAt, d));
        else if (op === "<=") conditions.push(lte(jiraIssuesTable.createdAt, d));
        else throw new JQLError(`Use >, <, >=, <= for "created"`);
        break;
      }
      case "updated": {
        const d = new Date(value);
        if (isNaN(d.getTime())) throw new JQLError(`Invalid date: "${value}" — use YYYY-MM-DD`);
        if (op === ">") conditions.push(gt(jiraIssuesTable.updatedAt, d));
        else if (op === "<") conditions.push(lt(jiraIssuesTable.updatedAt, d));
        else if (op === ">=") conditions.push(gte(jiraIssuesTable.updatedAt, d));
        else if (op === "<=") conditions.push(lte(jiraIssuesTable.updatedAt, d));
        else throw new JQLError(`Use >, <, >=, <= for "updated"`);
        break;
      }
      default: {
        const cf = await getCustomField(field, projectId);
        if (!cf) {
          throw new JQLError(`Unknown field: "${field}"\nBuilt-in fields: status, type, priority, assignee, summary, created, updated\nCustom fields can be used by name (e.g. Sprint = "Sprint 1")`);
        }
        conditions.push(await buildCustomFieldCondition(cf, op, value));
        break;
      }
    }
  }

  return { conditions, order };
}

async function applyListCondition(
  field: string,
  values: string[],
  negate: boolean,
  conditions: SQL[],
  projectId: string,
): Promise<void> {
  if (!values.length) throw new JQLError(`Empty list in IN clause for "${field}"`);

  switch (field) {
    case "status": {
      const mapped = values.map(v => STATUS_MAP[v.toLowerCase()]).filter(Boolean) as StatusVal[];
      if (!mapped.length) throw new JQLError(`Invalid status values: ${values.join(", ")}`);
      conditions.push(negate ? not(inArray(jiraIssuesTable.status, mapped)) : inArray(jiraIssuesTable.status, mapped));
      break;
    }
    case "type":
    case "issuetype": {
      const mapped = values.map(v => TYPE_MAP[v.toLowerCase()]).filter(Boolean) as TypeVal[];
      if (!mapped.length) throw new JQLError(`Invalid type values: ${values.join(", ")}`);
      conditions.push(negate ? not(inArray(jiraIssuesTable.type, mapped)) : inArray(jiraIssuesTable.type, mapped));
      break;
    }
    case "priority": {
      const mapped = values.map(v => PRIORITY_MAP[v.toLowerCase()]).filter(Boolean) as PriorityVal[];
      if (!mapped.length) throw new JQLError(`Invalid priority values: ${values.join(", ")}`);
      conditions.push(negate ? not(inArray(jiraIssuesTable.priority, mapped)) : inArray(jiraIssuesTable.priority, mapped));
      break;
    }
    case "assignee": {
      const conds: SQL[] = [];
      const empties = values.filter(v => ["empty", "null", "unassigned"].includes(v.toLowerCase()));
      const names = values.filter(v => !["empty", "null", "unassigned"].includes(v.toLowerCase()));
      if (empties.length) conds.push(isNull(jiraIssuesTable.assigneeId));
      if (names.length) {
        const users = await db.select({ id: usersTable.id }).from(usersTable)
          .where(sql`lower(${usersTable.username}) = ANY(ARRAY[${sql.join(names.map(n => sql`${n.toLowerCase()}`), sql`, `)}]::text[])`);
        if (users.length) conds.push(inArray(jiraIssuesTable.assigneeId, users.map(u => u.id)));
      }
      if (!conds.length) throw new JQLError(`No matching users for assignee list`);
      const combined = conds.length === 1 ? conds[0] : sql`(${sql.join(conds, sql` OR `)})`;
      conditions.push(negate ? not(combined) : combined);
      break;
    }
    default: {
      const cf = await getCustomField(field, projectId);
      if (!cf) throw new JQLError(`Field "${field}" does not support IN operator, or is not a known field`);
      const subQuery = db.select({ id: jiraCustomFieldValuesTable.issueId })
        .from(jiraCustomFieldValuesTable)
        .where(and(
          eq(jiraCustomFieldValuesTable.fieldId, cf.id),
          inArray(jiraCustomFieldValuesTable.value, values),
        ));
      conditions.push(negate ? not(inArray(jiraIssuesTable.id, subQuery)) : inArray(jiraIssuesTable.id, subQuery));
      break;
    }
  }
}
