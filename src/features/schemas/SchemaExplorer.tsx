import { ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { branchIds, filterTree, type SchemaNode, type SchemaTree } from "./schemaTree";

function Highlight({ text, query }: { text: string; query: string }): ReactNode {
  const needle = query.trim();
  const at = needle === "" ? -1 : text.toLowerCase().indexOf(needle.toLowerCase());
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-sm bg-accent/40 px-0.5 text-inherit">{text.slice(at, at + needle.length)}</mark>
      {text.slice(at + needle.length)}
    </>
  );
}

interface Row {
  node: SchemaNode;
  parent: string | undefined;
}

const withId = (source: ReadonlySet<string>, id: string): ReadonlySet<string> => new Set(source).add(id);
const withoutId = (source: ReadonlySet<string>, id: string): ReadonlySet<string> => {
  const next = new Set(source);
  next.delete(id);
  return next;
};

/** A schema as a tree that can be searched, opened and closed, and walked with the keyboard (the WAI-ARIA tree pattern). */
export function SchemaExplorer({ tree }: { tree: SchemaTree }) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  // Nodes the search opened that the person closed again.
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string>();
  const items = useRef(new Map<string, HTMLDivElement>());

  const filtered = useMemo(() => filterTree(tree.nodes, query), [tree, query]);
  const isOpen = (id: string) => !closed.has(id) && (expanded.has(id) || filtered.open.has(id));

  const rows = useMemo(() => {
    const out: Row[] = [];
    const walk = (nodes: readonly SchemaNode[], parent: string | undefined) => {
      for (const node of nodes) {
        out.push({ node, parent });
        if (node.children.length > 0 && !closed.has(node.id) && (expanded.has(node.id) || filtered.open.has(node.id))) walk(node.children, node.id);
      }
    };
    walk(filtered.nodes, undefined);
    return out;
  }, [filtered, expanded, closed]);

  const tabbable = focusedId !== undefined && rows.some((row) => row.node.id === focusedId) ? focusedId : rows[0]?.node.id;

  // Moving the focus is done by the browser; this puts it where the state says.
  useEffect(() => {
    if (focusedId === undefined) return;
    const element = items.current.get(focusedId);
    element?.focus();
    element?.scrollIntoView?.({ block: "nearest" });
  }, [focusedId]);

  const open = (id: string) => {
    setExpanded((current) => withId(current, id));
    setClosed((current) => withoutId(current, id));
  };
  const close = (id: string) => {
    setExpanded((current) => withoutId(current, id));
    setClosed((current) => withId(current, id));
  };
  const toggle = (id: string) => (isOpen(id) ? close(id) : open(id));

  const jump = (id: string) => {
    const target = tree.index.get(id);
    if (!target) return;
    const ancestors: string[] = [];
    for (let parent = target.parent; parent !== undefined; parent = tree.index.get(parent)?.parent) ancestors.push(parent);
    setQuery("");
    setClosed(new Set());
    setExpanded((current) => new Set([...current, ...ancestors]));
    setFocusedId(id);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const current = rows.findIndex((row) => row.node.id === focusedId);
    const row = rows[current];
    if (!row) return;
    const move = (index: number) => {
      const target = rows[Math.min(Math.max(index, 0), rows.length - 1)];
      if (target) setFocusedId(target.node.id);
    };
    const hasChildren = row.node.children.length > 0;
    switch (event.key) {
      case "ArrowDown":
        move(current + 1);
        break;
      case "ArrowUp":
        move(current - 1);
        break;
      case "Home":
        move(0);
        break;
      case "End":
        move(rows.length - 1);
        break;
      case "ArrowRight":
        if (hasChildren && !isOpen(row.node.id)) open(row.node.id);
        else if (hasChildren) move(current + 1);
        break;
      case "ArrowLeft":
        if (hasChildren && isOpen(row.node.id)) close(row.node.id);
        else if (row.parent !== undefined) setFocusedId(row.parent);
        break;
      case "Enter":
      case " ":
        if (hasChildren) toggle(row.node.id);
        else if (row.node.ref) jump(row.node.ref);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const renderNodes = (nodes: readonly SchemaNode[], level: number): ReactNode => (
    <ul role={level === 1 ? "tree" : "group"} aria-label={level === 1 ? t("schemas.tree.definitions") : undefined} onKeyDown={level === 1 ? onKeyDown : undefined} className="flex flex-col">
      {nodes.map((node, position) => {
        const hasChildren = node.children.length > 0;
        const expandedNow = hasChildren && isOpen(node.id);
        const target = node.ref ? tree.index.get(node.ref) : undefined;
        return (
          <li key={node.id} role="none">
            <div
              role="treeitem"
              ref={(element) => {
                if (element) items.current.set(node.id, element);
                else items.current.delete(node.id);
              }}
              aria-level={level}
              aria-setsize={nodes.length}
              aria-posinset={position + 1}
              aria-expanded={hasChildren ? expandedNow : undefined}
              tabIndex={node.id === tabbable ? 0 : -1}
              onFocus={() => setFocusedId(node.id)}
              onClick={() => {
                setFocusedId(node.id);
                if (hasChildren) toggle(node.id);
              }}
              style={{ paddingLeft: `${level * 0.75}rem` }}
              className={cn(
                "flex cursor-default flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-sm py-1 pr-2 hover:bg-muted focus-visible:bg-muted focus-visible:outline-2 focus-visible:outline-accent",
                hasChildren && "cursor-pointer",
              )}
            >
              <ChevronRight aria-hidden className={cn("size-4 shrink-0 self-center text-muted-foreground transition-transform", hasChildren ? (expandedNow ? "rotate-90" : "") : "invisible")} />
              <span className={cn("font-mono text-sm", node.kind === "definition" || node.kind === "property" ? "font-semibold" : "text-muted-foreground italic")}>
                <Highlight text={node.label} query={query} />
              </span>
              {node.required && <Badge tone="info">{t("schemas.tree.required")}</Badge>}
              {node.summary && (
                <span className="text-sm text-muted-foreground">
                  <Highlight text={node.summary} query={query} />
                </span>
              )}
              {target && (
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={t("schemas.tree.goToLabel", { label: target.node.label })}
                  onClick={(event) => {
                    event.stopPropagation();
                    jump(target.node.id);
                  }}
                  className="rounded-sm px-1 text-xs font-medium text-foreground underline underline-offset-2 hover:bg-muted"
                >
                  {t("schemas.tree.goTo")}
                </button>
              )}
              {node.facts.map((fact) => (
                <code key={fact} className="rounded-sm bg-muted px-1 text-xs">
                  <Highlight text={fact} query={query} />
                </code>
              ))}
              {node.description && (
                <p className="basis-full pl-6 text-xs text-muted-foreground">
                  <Highlight text={node.description} query={query} />
                </p>
              )}
            </div>
            {expandedNow && renderNodes(node.children, level + 1)}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <Field label={t("schemas.search.label")} hint={t("schemas.search.hint")} className="w-full max-w-md">
          {(control) => (
            <Input
              {...control}
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setClosed(new Set());
              }}
              autoComplete="off"
              spellCheck={false}
            />
          )}
        </Field>
        <div className="flex gap-2 pb-6">
          <Button
            variant="secondary"
            onClick={() => {
              setExpanded(new Set(branchIds(filtered.nodes)));
              setClosed(new Set());
            }}
          >
            {t("schemas.tree.expandAll")}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setExpanded(new Set());
              setClosed(new Set(branchIds(filtered.nodes)));
            }}
          >
            {t("schemas.tree.collapseAll")}
          </Button>
        </div>
      </div>

      <p role="status" className="text-sm text-muted-foreground">
        {query.trim() === ""
          ? t("schemas.tree.definitionCount", { count: tree.nodes.length })
          : filtered.nodes.length === 0
            ? t("schemas.tree.noMatches")
            : `${t("schemas.tree.matchCount", { count: filtered.matches })}${t("schemas.tree.matchCountIn")}${t("schemas.tree.definitionCount", { count: filtered.nodes.length })}`}
      </p>

      {filtered.nodes.length > 0 && <div className="max-h-[70dvh] overflow-auto rounded-md border border-border py-2">{renderNodes(filtered.nodes, 1)}</div>}
    </div>
  );
}
