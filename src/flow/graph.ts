import { MarkerType, type Edge, type Node } from "@xyflow/react";
import { isDrawable, type Analysis, type ScreenFacts } from "./analyze";
import { edgeId, type Layout, type Route, type XY } from "./layout";
import type { Flow, Screen } from "./schema";

export type ScreenNodeData = {
  screen: Screen;
  facts: ScreenFacts;
  dimmed: boolean;
};

export type ScreenNode = Node<ScreenNodeData, "screen">;

export type LinkEdge = Edge<{ route: Route | null; isActive: boolean; isDimmed: boolean }, "link">;

export function neighbourhood(flow: Flow, analysis: Analysis, id: string | null): Set<string> | null {
  const screen = flow.screens.find((s) => s.id === id);
  if (!screen) return null;
  return new Set([
    screen.id,
    ...screen.links.map((link) => link.to),
    ...(analysis.facts.get(screen.id)?.incoming.map((i) => i.from) ?? []),
  ]);
}

// keeps position and measured size from the previous nodes
export function toNodes(
  flow: Flow,
  analysis: Analysis,
  previous: ScreenNode[],
  focus: Set<string> | null,
  selectedId: string | null,
  place: (id: string, index: number) => { x: number; y: number },
): ScreenNode[] {
  const byId = new Map(previous.map((node) => [node.id, node]));
  return flow.screens.map((screen, index) => {
    const old = byId.get(screen.id);
    return {
      ...old,
      id: screen.id,
      type: "screen",
      position: old?.position ?? place(screen.id, index),
      selected: screen.id === selectedId,
      data: {
        screen,
        facts: analysis.facts.get(screen.id)!,
        dimmed: focus !== null && !focus.has(screen.id),
      },
    };
  });
}

const samePlace = (a: XY | undefined, b: XY) => a !== undefined && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;

// ELK route is only valid while both cards are where ELK put them.
// Fallback: back links use the bottom handles so they don't overlap forward ones.
export function toEdges(flow: Flow, nodes: ScreenNode[], selectedId: string | null, layout: Layout | null): LinkEdge[] {
  const position = new Map(nodes.map((node) => [node.id, node.position]));

  return flow.screens.flatMap((screen) =>
    screen.links.flatMap((link, index): LinkEdge[] => {
      if (!isDrawable(flow, screen.id, link)) return [];

      const id = edgeId(screen.id, index);
      const from = position.get(screen.id);
      const to = position.get(link.to);
      const candidate = layout?.routes[id];
      const route =
        candidate && from && to && samePlace(from, candidate.source) && samePlace(to, candidate.target)
          ? candidate
          : null;

      const isBack = (to?.x ?? 0) <= (from?.x ?? 0);
      const isActive = selectedId === screen.id || selectedId === link.to;
      const isDimmed = selectedId !== null && !isActive;

      return [
        {
          id,
          source: screen.id,
          target: link.to,
          sourceHandle: isBack ? "back-out" : "out",
          targetHandle: isBack ? "back-in" : "in",
          type: "link",
          label: link.on || undefined,
          data: { route, isActive, isDimmed },
          className: [`kind-${link.kind}`, isActive && "is-active", isDimmed && "is-dimmed"]
            .filter(Boolean)
            .join(" "),
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 16,
            height: 16,
            color: isActive ? "var(--accent)" : "var(--edge)",
          },
          zIndex: isActive ? 1 : 0,
        },
      ];
    }),
  );
}
