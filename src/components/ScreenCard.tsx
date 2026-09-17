import { memo } from "react";
import { Handle, Position, useConnection, type NodeProps } from "@xyflow/react";
import type { ScreenNode } from "../flow/graph";
import { isSafeUrl } from "../flow/schema";

const stop = (event: React.MouseEvent) => event.stopPropagation();

export const ScreenCard = memo(function ScreenCard({ id, data, selected }: NodeProps<ScreenNode>) {
  const { screen, facts, dimmed } = data;
  // While a link is being dragged from another screen, the whole card accepts the drop.
  const isDropTarget = useConnection((c) => c.inProgress && c.fromNode.id !== id);
  // Fields can hold half-typed addresses while being edited; only safe ones become links.
  const preview = screen.preview && isSafeUrl(screen.preview) ? screen.preview : null;
  const source = screen.source && isSafeUrl(screen.source) ? screen.source : null;
  const className = [
    "card",
    selected && "is-selected",
    dimmed && "is-dimmed",
    facts.isUnreachable && "is-unreachable",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={className}>
      <Handle type="target" position={Position.Left} id="in" />
      <Handle type="source" position={Position.Right} id="out" />
      <Handle type="target" position={Position.Bottom} id="back-in" className="handle-back-in" />
      <Handle type="source" position={Position.Bottom} id="back-out" className="handle-back-out" />
      {isDropTarget && <Handle type="target" position={Position.Left} id="drop" className="handle-drop" />}

      <header className="card-tags">
        <span className={`status status-${screen.status}`}>{screen.status}</span>
        {facts.isStart && <span className="tag tag-start">Start</span>}
        {screen.terminal && <span className="tag">End</span>}
        {facts.isUnreachable && <span className="tag tag-warn">Unreachable</span>}
        {facts.isDeadEnd && <span className="tag tag-warn">Dead end</span>}
      </header>

      <h2 className="card-title">{screen.title}</h2>
      {screen.notes && <p className="card-notes">{screen.notes}</p>}

      {(screen.owner || preview || source) && (
        <footer className="card-foot">
          {screen.owner && <span className="card-owner">{screen.owner}</span>}
          {preview && (
            <a className="nodrag" href={preview} target="_blank" rel="noreferrer" onClick={stop}>
              Preview ↗
            </a>
          )}
          {source && (
            <a className="nodrag" href={source} target="_blank" rel="noreferrer" onClick={stop}>
              Source ↗
            </a>
          )}
        </footer>
      )}
    </article>
  );
});
