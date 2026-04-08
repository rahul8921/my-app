import { useState, useRef, useCallback, useEffect } from "react";
import type { CustomFieldDef, User } from "@/lib/types";
import { Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Field/operator/value metadata ───────────────────────────────────────────

const BUILTIN_FIELDS = ["status", "type", "priority", "assignee", "summary", "text", "created", "updated"];

const FIELD_OPERATORS: Record<string, string[]> = {
  status:   ["=", "!=", "in", "not in"],
  type:     ["=", "!=", "in", "not in"],
  priority: ["=", "!=", "in", "not in"],
  assignee: ["=", "!=", "in", "is EMPTY", "is not EMPTY"],
  summary:  ["~", "!~", "=", "!="],
  text:     ["~", "!~"],
  created:  [">=", "<=", ">", "<"],
  updated:  [">=", "<=", ">", "<"],
};

const FIELD_VALUES: Record<string, string[]> = {
  status:   ["todo", "in progress", "review", "done"],
  type:     ["bug", "task", "story", "epic"],
  priority: ["low", "medium", "high", "critical"],
};

const FIELD_DESCRIPTIONS: Record<string, string> = {
  status:   "Issue status",
  type:     "Issue type",
  priority: "Priority level",
  assignee: "Assigned user",
  summary:  "Title text search",
  text:     "Text search",
  created:  "Creation date",
  updated:  "Last updated date",
};

// ─── Context detection ────────────────────────────────────────────────────────

type CtxType = "field" | "operator" | "value" | "in-value" | "none";

interface SuggestionCtx {
  type: CtxType;
  suggestions: Array<{ value: string; description?: string }>;
  tokenStart: number;
  tokenEnd: number;
  suffix: string;
}

function findClauseStart(textBefore: string): number {
  let depth = 0, inQ = false, qChar = "";
  let clauseStart = 0;
  for (let i = 0; i < textBefore.length; i++) {
    const ch = textBefore[i];
    if ((ch === '"' || ch === "'") && !inQ) { inQ = true; qChar = ch; }
    else if (ch === qChar && inQ) { inQ = false; }
    else if (ch === "(" && !inQ) depth++;
    else if (ch === ")" && !inQ) depth--;
    else if (!inQ && depth === 0 && /^AND\s/i.test(textBefore.slice(i))) {
      clauseStart = i + 4;
      i += 3;
    }
  }
  return clauseStart;
}

function getValuesForField(
  field: string,
  customFields: CustomFieldDef[],
  users: User[],
): string[] {
  const fLow = field.toLowerCase();
  if (FIELD_VALUES[fLow]) return FIELD_VALUES[fLow];
  if (fLow === "assignee") return ["EMPTY", ...users.map(u => u.username)];
  const cf = customFields.find(f => f.name.toLowerCase() === fLow);
  if (cf?.fieldType === "select" && cf.options?.length) return cf.options;
  return [];
}

function getOperatorsForField(field: string, customFields: CustomFieldDef[]): string[] {
  const fLow = field.toLowerCase();
  if (FIELD_OPERATORS[fLow]) return FIELD_OPERATORS[fLow];
  const cf = customFields.find(f => f.name.toLowerCase() === fLow);
  if (cf) {
    if (cf.fieldType === "number") return ["=", "!=", ">", ">=", "<", "<=", "in", "not in"];
    if (cf.fieldType === "date") return ["=", "!=", ">", ">=", "<", "<="];
    if (cf.fieldType === "select") return ["=", "!=", "in", "not in"];
    return ["=", "!=", "~", "!~"];
  }
  return ["=", "!=", "~", "in", "not in"];
}

function getContext(
  input: string,
  cursor: number,
  customFields: CustomFieldDef[],
  users: User[],
): SuggestionCtx {
  const textBefore = input.slice(0, cursor);
  const clauseStart = findClauseStart(textBefore);
  const clause = textBefore.slice(clauseStart);

  const allFieldNames = [
    ...BUILTIN_FIELDS,
    ...customFields.map(f => f.name.includes(" ") ? `"${f.name}"` : f.name),
  ];
  const fieldSuggestions = allFieldNames.map(f => ({
    value: f,
    description: FIELD_DESCRIPTIONS[f.toLowerCase()] ??
      customFields.find(cf => cf.name.toLowerCase() === f.toLowerCase())?.fieldType ?? "Custom field",
  }));

  const none: SuggestionCtx = { type: "none", suggestions: [], tokenStart: cursor, tokenEnd: cursor, suffix: "" };

  // ── 1. Empty clause → suggest all fields ──
  if (!clause.trim()) {
    return { type: "field", suggestions: fieldSuggestions, tokenStart: cursor, tokenEnd: cursor, suffix: " " };
  }

  // ── 2. IN list value: field in (v1, partial ──
  const inListM = clause.match(/^(\w+)\s+(?:not\s+)?in\s*\(([^)]*,\s*)(\w*)$/i);
  if (inListM) {
    const field = inListM[1];
    const partial = inListM[3].toLowerCase();
    const vals = getValuesForField(field, customFields, users);
    const matching = vals.filter(v => !partial || v.toLowerCase().startsWith(partial));
    return {
      type: "in-value",
      suggestions: matching.map(v => ({ value: v })),
      tokenStart: cursor - inListM[3].length,
      tokenEnd: cursor,
      suffix: "",
    };
  }

  // ── 3. Start of IN list: field in (partial ──
  const inListStartM = clause.match(/^(\w+)\s+(?:not\s+)?in\s*\((\w*)$/i);
  if (inListStartM) {
    const field = inListStartM[1];
    const partial = inListStartM[2].toLowerCase();
    const vals = getValuesForField(field, customFields, users);
    const matching = vals.filter(v => !partial || v.toLowerCase().startsWith(partial));
    return {
      type: "in-value",
      suggestions: matching.map(v => ({ value: v })),
      tokenStart: cursor - inListStartM[2].length,
      tokenEnd: cursor,
      suffix: "",
    };
  }

  // ── 4. Quoted value: field op "partial ──
  const quotedValueM = clause.match(/^(\w+)\s+(=|!=|~|!~)\s+"([^"]*)$/i);
  if (quotedValueM) {
    const field = quotedValueM[1];
    const partial = quotedValueM[3].toLowerCase();
    const vals = getValuesForField(field, customFields, users);
    const matching = vals.filter(v => !partial || v.toLowerCase().startsWith(partial));
    return {
      type: "value",
      suggestions: matching.map(v => ({ value: v })),
      tokenStart: cursor - quotedValueM[3].length - 1, // include opening quote
      tokenEnd: cursor,
      suffix: '" ',
    };
  }

  // ── 5. Unquoted value: field op partial ──
  const valueM = clause.match(/^(\w+)\s+(=|!=|~|!~|>=|<=|>|<)\s+(\w*)$/i);
  if (valueM) {
    const field = valueM[1];
    const partial = valueM[3].toLowerCase();
    const vals = getValuesForField(field, customFields, users);
    const matching = vals.filter(v => !partial || v.toLowerCase().startsWith(partial));
    return {
      type: "value",
      suggestions: matching.map(v => ({ value: v })),
      tokenStart: cursor - valueM[3].length,
      tokenEnd: cursor,
      suffix: " ",
    };
  }

  // ── 6. "is" operator and variants: field is [not] [EMPTY] ──
  const isOpM = clause.match(/^(\w+)\s+(is(?:\s+\w+)?)$/i);
  if (isOpM) {
    const field = isOpM[1];
    const typedIs = isOpM[2]; // "is", "is not", "is EMPTY", etc.
    const opts = ["is EMPTY", "is not EMPTY"];
    const matching = opts.filter(o => o.toLowerCase().startsWith(typedIs.toLowerCase()));
    return {
      type: "operator",
      suggestions: matching.map(o => ({ value: o, description: o === "is EMPTY" ? "Has no value" : "Has a value" })),
      tokenStart: cursor - typedIs.length,
      tokenEnd: cursor,
      suffix: " ",
    };
  }

  // ── 7. Field + space + partial operator ──
  const opM = clause.match(/^(\w+)\s+([!~<>=]?\w*)$/i);
  if (opM) {
    const field = opM[1];
    const partialOp = opM[2].toLowerCase();
    const ops = getOperatorsForField(field, customFields);
    const matching = ops.filter(op => !partialOp || op.toLowerCase().startsWith(partialOp));
    return {
      type: "operator",
      suggestions: matching.map(op => ({ value: op })),
      tokenStart: cursor - opM[2].length,
      tokenEnd: cursor,
      suffix: " ",
    };
  }

  // ── 8. Typing a field name ──
  const fieldM = clause.match(/^(\w*)$/i);
  if (fieldM) {
    const partial = fieldM[1].toLowerCase();
    const matching = partial
      ? fieldSuggestions.filter(f => f.value.toLowerCase().startsWith(partial))
      : fieldSuggestions;
    return {
      type: "field",
      suggestions: matching,
      tokenStart: cursor - fieldM[1].length,
      tokenEnd: cursor,
      suffix: " ",
    };
  }

  return none;
}

function insertSuggestion(
  input: string,
  ctx: SuggestionCtx,
  suggestion: string,
): { newValue: string; newCursor: number } {
  let insert = suggestion;
  let suffix = ctx.suffix;

  // Operator-specific suffixes
  if (ctx.type === "operator") {
    suffix = (suggestion === "in" || suggestion === "not in") ? " (" : " ";
  }

  // For values containing spaces, wrap in quotes
  if (ctx.type === "value" && suggestion.includes(" ") && !suffix.startsWith('"')) {
    insert = `"${suggestion}"`;
  }
  if (ctx.type === "in-value" && suggestion.includes(" ")) {
    insert = `"${suggestion}"`;
  }

  const newValue = input.slice(0, ctx.tokenStart) + insert + suffix + input.slice(ctx.tokenEnd);
  const newCursor = ctx.tokenStart + insert.length + suffix.length;
  return { newValue, newCursor };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface JQLEditorProps {
  value: string;
  onChange: (v: string) => void;
  onRun: () => void;
  onClear: () => void;
  customFields: CustomFieldDef[];
  users: User[];
  error: string | null;
  isLoading: boolean;
}

export function JQLEditor({ value, onChange, onRun, onClear, customFields, users, error, isLoading }: JQLEditorProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<{ value: string; description?: string }>>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [ctx, setCtx] = useState<SuggestionCtx | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const updateSuggestions = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const cursor = el.selectionStart ?? 0;
    const context = getContext(value, cursor, customFields, users);
    setCtx(context);
    if (context.type === "none" || context.suggestions.length === 0) {
      setShowDropdown(false);
    } else {
      setSuggestions(context.suggestions.slice(0, 12));
      setSelectedIdx(0);
      setShowDropdown(true);
    }
  }, [value, customFields, users]);

  useEffect(() => {
    if (document.activeElement === textareaRef.current) {
      updateSuggestions();
    }
  }, [value, updateSuggestions]);

  const applySuggestion = (suggestion: string) => {
    if (!ctx) return;
    const { newValue, newCursor } = insertSuggestion(value, ctx, suggestion);
    onChange(newValue);
    setShowDropdown(false);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(newCursor, newCursor);
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showDropdown) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx(i => Math.min(i + 1, suggestions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.metaKey && !e.ctrlKey)) {
        e.preventDefault();
        if (suggestions[selectedIdx]) applySuggestion(suggestions[selectedIdx].value);
        return;
      }
      if (e.key === "Escape") {
        setShowDropdown(false);
        return;
      }
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      setShowDropdown(false);
      onRun();
    }
  };

  const ctxTypeLabel: Record<CtxType, string> = {
    field: "fields",
    operator: "operators",
    value: "values",
    "in-value": "values",
    none: "",
  };

  return (
    <div className="relative" onBlur={(e) => {
      if (!dropdownRef.current?.contains(e.relatedTarget as Node)) {
        setShowDropdown(false);
      }
    }}>
      <div className={`flex items-start gap-2 border rounded-lg transition-colors bg-background ${error ? "border-destructive" : "border-border focus-within:border-primary/60"}`}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onSelect={updateSuggestions}
          onClick={() => { updateSuggestions(); }}
          onFocus={updateSuggestions}
          rows={1}
          placeholder='status = "in progress" AND priority in (high, critical)'
          className="flex-1 font-mono text-sm py-2.5 px-3 bg-transparent resize-none outline-none min-h-[42px] max-h-32 leading-relaxed placeholder:text-muted-foreground/50"
          style={{ fieldSizing: "content" } as any}
        />
        <div className="flex items-center gap-1 p-1.5 shrink-0">
          {value && (
            <button
              onClick={onClear}
              className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <Button size="sm" onClick={() => { setShowDropdown(false); onRun(); }} disabled={isLoading} className="h-7 gap-1 text-xs">
            {isLoading ? (
              <span className="w-3 h-3 border border-primary-foreground border-t-transparent rounded-full animate-spin" />
            ) : (
              <Play className="w-3 h-3" />
            )}
            Run
          </Button>
        </div>
      </div>

      {/* Autocomplete dropdown */}
      {showDropdown && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg overflow-hidden"
        >
          <div className="px-3 py-1.5 border-b border-border bg-muted/50 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {ctx && ctxTypeLabel[ctx.type]}
            </span>
            <span className="text-[10px] text-muted-foreground">↑↓ navigate · Tab/Enter to select · Esc to close</span>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {suggestions.map((s, i) => (
              <button
                key={s.value}
                onMouseDown={e => { e.preventDefault(); applySuggestion(s.value); }}
                className={`w-full text-left px-3 py-2 flex items-center justify-between gap-3 transition-colors ${i === selectedIdx ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
              >
                <span className="font-mono text-sm">{s.value}</span>
                {s.description && (
                  <span className={`text-xs shrink-0 ${i === selectedIdx ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {s.description}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-2 p-2.5 bg-destructive/10 border border-destructive/30 rounded-md text-xs font-mono text-destructive whitespace-pre-wrap leading-relaxed">
          {error}
        </div>
      )}
    </div>
  );
}
