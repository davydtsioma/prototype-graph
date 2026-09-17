import type { ElkExtendedEdge } from "elkjs/lib/elk-api";
import { isDrawable } from "./analyze";
import type { Flow } from "./schema";

export interface XY {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Route {
  source: XY;
  target: XY;
  points: XY[];
  label?: XY;
}

export interface Layout {
  positions: Record<string, XY>;
  routes: Record<string, Route>;
}

export const edgeId = (from: string, index: number) => `${from}:${index}`;

// ELK is ~1.4MB, load it lazily
let elk: Promise<InstanceType<typeof import("elkjs/lib/elk.bundled.js").default>> | null = null;
const getElk = () =>
  (elk ??= import("elkjs/lib/elk.bundled.js").then(({ default: ELK }) => new ELK()));

let context: CanvasRenderingContext2D | null = null;
function labelSize(text: string): Size {
  context ??= document.createElement("canvas").getContext("2d");
  if (context) context.font = "500 11px ui-sans-serif, system-ui, sans-serif";
  const width = context ? context.measureText(text).width : text.length * 6;
  return { width: Math.ceil(width) + 14, height: 20 };
}

export async function layoutFlow(flow: Flow, sizes: Map<string, Size>): Promise<Layout> {
  const start = new Set(flow.start);

  const edges: ElkExtendedEdge[] = flow.screens.flatMap((screen) =>
    screen.links.flatMap((link, index) => {
      if (!isDrawable(flow, screen.id, link)) return [];
      const id = edgeId(screen.id, index);
      return [
        {
          id,
          sources: [screen.id],
          targets: [link.to],
          labels: link.on ? [{ id: `${id}:label`, text: link.on, ...labelSize(link.on) }] : [],
        },
      ];
    }),
  );

  const graph = await (await getElk()).layout({
    id: "flow",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.edgeLabels.placement": "CENTER",
      "elk.spacing.nodeNode": "40",
      "elk.spacing.edgeNode": "20",
      "elk.spacing.edgeEdge": "14",
      "elk.spacing.edgeLabel": "4",
      "elk.layered.spacing.nodeNodeBetweenLayers": "48",
      "elk.layered.spacing.edgeNodeBetweenLayers": "20",
      "elk.layered.spacing.edgeEdgeBetweenLayers": "14",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.padding": "[top=40,left=40,bottom=40,right=40]",
    },
    children: flow.screens.map((screen) => ({
      id: screen.id,
      ...(sizes.get(screen.id) ?? { width: 260, height: 120 }),
      layoutOptions: start.has(screen.id) ? { "elk.layered.layering.layerConstraint": "FIRST" } : undefined,
    })),
    edges,
  });

  const positions: Record<string, XY> = {};
  for (const child of graph.children ?? []) {
    positions[child.id] = { x: child.x ?? 0, y: child.y ?? 0 };
  }

  const routes: Record<string, Route> = {};
  for (const edge of graph.edges ?? []) {
    const section = edge.sections?.[0];
    if (!section) continue;
    const label = edge.labels?.[0];
    routes[edge.id] = {
      source: positions[edge.sources[0]],
      target: positions[edge.targets[0]],
      points: [section.startPoint, ...(section.bendPoints ?? []), section.endPoint],
      label:
        label?.x !== undefined && label.y !== undefined
          ? { x: label.x + (label.width ?? 0) / 2, y: label.y + (label.height ?? 0) / 2 }
          : undefined,
    };
  }

  return { positions, routes };
}
