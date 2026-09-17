import type { Flow, Link } from "./schema";

export interface Incoming {
  from: string;
  index: number;
  link: Link;
}

export interface ScreenFacts {
  isStart: boolean;
  /** No start screen leads here. */
  isUnreachable: boolean;
  /** Nothing leads out, and the screen is not marked as an intended end. */
  isDeadEnd: boolean;
  incoming: Incoming[];
}

export type IssueKind = "no-start" | "unreachable" | "dead-end" | "broken-link" | "self-link";

export interface Issue {
  kind: IssueKind;
  screenId?: string;
  message: string;
}

export interface Analysis {
  facts: Map<string, ScreenFacts>;
  issues: Issue[];
}

/** A link is drawn only when it points at another screen that exists. */
export const isDrawable = (flow: Flow, from: string, link: Link) =>
  link.to !== from && flow.screens.some((s) => s.id === link.to);

export function analyzeFlow(flow: Flow): Analysis {
  const byId = new Map(flow.screens.map((s) => [s.id, s]));
  const issues: Issue[] = [];
  const incoming = new Map<string, Incoming[]>(flow.screens.map((s) => [s.id, []]));

  for (const screen of flow.screens) {
    screen.links.forEach((link, index) => {
      if (link.to === screen.id) {
        issues.push({
          kind: "self-link",
          screenId: screen.id,
          message: `"${screen.title}" links to itself.`,
        });
      } else if (!byId.has(link.to)) {
        issues.push({
          kind: "broken-link",
          screenId: screen.id,
          message: `"${screen.title}" links to "${link.to}", which does not exist.`,
        });
      } else {
        incoming.get(link.to)!.push({ from: screen.id, index, link });
      }
    });
  }

  const start = flow.start.filter((id) => byId.has(id));
  if (start.length === 0 && flow.screens.length > 0) {
    issues.push({ kind: "no-start", message: "No start screen, so nothing is reachable." });
  }

  // Breadth-first walk from every start screen.
  const reached = new Set(start);
  const queue = [...start];
  while (queue.length > 0) {
    const screen = byId.get(queue.shift()!)!;
    for (const link of screen.links) {
      if (byId.has(link.to) && !reached.has(link.to)) {
        reached.add(link.to);
        queue.push(link.to);
      }
    }
  }

  const facts = new Map<string, ScreenFacts>();
  for (const screen of flow.screens) {
    const isUnreachable = !reached.has(screen.id);
    const isDeadEnd =
      !screen.terminal && !screen.links.some((link) => isDrawable(flow, screen.id, link));

    if (isUnreachable && start.length > 0) {
      issues.push({
        kind: "unreachable",
        screenId: screen.id,
        message: `"${screen.title}" cannot be reached from a start screen.`,
      });
    }
    if (isDeadEnd) {
      issues.push({
        kind: "dead-end",
        screenId: screen.id,
        message: `"${screen.title}" has no way out. Add a link or mark it as an end screen.`,
      });
    }

    facts.set(screen.id, {
      isStart: start.includes(screen.id),
      isUnreachable,
      isDeadEnd,
      incoming: incoming.get(screen.id)!,
    });
  }

  return { facts, issues };
}
