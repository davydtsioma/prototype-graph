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

/** An edge path computed for one exact arrangement of its two screens. */
export interface Route {
  source: XY;
  target: XY;
  points: XY[];
  /** Centre of the label, placed by ELK so labels never overlap cards or each other. */
  label?: XY;
}

export interface Layout {
  positions: Record<string, XY>;
  routes: Record<string, Route>;
}

export const edgeId = (from: string, index: number) => `${from}:${index}`;

// ELK is most of the bundle, so it loads with the first layout instead of with the page.
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

/**
 * Lays the flow out in columns, left to right, in the order a person moves
 * through it, and routes every link around the cards. Start screens are
 * pinned to the first column. Layout is never written to the flow file, so
 * the file only changes when the flow itself changes.
 */
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
