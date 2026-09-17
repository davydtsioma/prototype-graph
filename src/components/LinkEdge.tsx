import { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "@xyflow/react";
import type { LinkEdge as LinkEdgeType } from "../flow/graph";
import type { XY } from "../flow/layout";

function roundedPath(points: XY[], radius = 8): string {
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [prev, point, next] = [points[i - 1], points[i], points[i + 1]];
    const r = Math.min(
      radius,
      Math.hypot(point.x - prev.x, point.y - prev.y) / 2,
      Math.hypot(next.x - point.x, next.y - point.y) / 2,
    );
    const toward = (from: XY, to: XY) => {
      const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
      return { x: from.x + ((to.x - from.x) / length) * r, y: from.y + ((to.y - from.y) / length) * r };
    };
    const a = toward(point, prev);
    const b = toward(point, next);
    path += ` L ${a.x} ${a.y} Q ${point.x} ${point.y} ${b.x} ${b.y}`;
  }
  const last = points[points.length - 1];
  return `${path} L ${last.x} ${last.y}`;
}

// No route means a card was dragged since the last layout.
export const LinkEdge = memo(function LinkEdge(props: EdgeProps<LinkEdgeType>) {
  const { id, data, markerEnd, style, label } = props;

  let path: string;
  let labelAt: XY;
  if (data?.route) {
    path = roundedPath(data.route.points);
    const { points } = data.route;
    labelAt = data.route.label ?? points[Math.floor(points.length / 2)];
  } else {
    const [stepPath, x, y] = getSmoothStepPath({ ...props, borderRadius: 8, offset: 24 });
    path = stepPath;
    labelAt = { x, y };
  }

  return (
    <>
      <BaseEdge path={path} markerEnd={markerEnd} style={style} />
      {label && (
        <EdgeLabelRenderer>
          <div
            className={["edge-label", data?.isActive && "is-active", data?.isDimmed && "is-dimmed"]
              .filter(Boolean)
              .join(" ")}
            data-edge={id}
            style={{ transform: `translate(-50%, -50%) translate(${labelAt.x}px, ${labelAt.y}px)` }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
