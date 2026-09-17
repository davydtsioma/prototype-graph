import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  type OnConnect,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import sample from "../examples/stay-booking.flow.json";
import { Inspector } from "./components/Inspector";
import { LinkEdge } from "./components/LinkEdge";
import { ScreenCard } from "./components/ScreenCard";
import { analyzeFlow } from "./flow/analyze";
import { addLink, addScreen } from "./flow/edit";
import { neighbourhood, toEdges, toNodes, type ScreenNode } from "./flow/graph";
import { layoutFlow, type Layout } from "./flow/layout";
import { parseFlow, type Flow } from "./flow/schema";

const nodeTypes = { screen: ScreenCard };

// ?embed: running inside another page (a portfolio hero). The wheel scrolls
// that page instead of zooming, and file actions are hidden.
const params = new URLSearchParams(window.location.search);
const embed = params.has("embed");

type Theme = "light" | "dark" | "system";
const initialTheme = (["light", "dark"].includes(params.get("theme") ?? "") ? params.get("theme") : "system") as Theme;
const edgeTypes = { link: LinkEdge };

function loadSample(): Flow {
  const result = parseFlow(sample);
  if (!result.ok) throw new Error(`Sample flow is invalid:\n${result.errors.join("\n")}`);
  return result.flow;
}

const sampleFlow = loadSample();

function Editor() {
  const [flow, setFlow] = useState<Flow>(sampleFlow);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<ScreenNode>([]);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [needsLayout, setNeedsLayout] = useState(true);
  const [loadErrors, setLoadErrors] = useState<string[] | null>(null);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(initialTheme);


  // positions for screens that don't have a node yet
  const placement = useRef(new Map<string, { x: number; y: number }>());
  const fileInput = useRef<HTMLInputElement>(null);

  const { fitView, screenToFlowPosition } = useReactFlow();

  // the embedding page can switch light and dark: postMessage({ theme: "dark" })
  useEffect(() => {
    if (theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    if (!embed) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const next = event.data?.theme;
      if (next === "light" || next === "dark" || next === "system") setTheme(next);
      if (event.data?.fit) fitView({ padding: 0.12 });
    };
    // an embedded frame can change size after the first fit (the host page
    // settling its layout), so the flow is fitted again whenever it does
    let timer = 0;
    const onResize = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => fitView({ padding: 0.12 }), 120);
    };
    window.addEventListener("message", onMessage);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("resize", onResize);
      clearTimeout(timer);
    };
  }, [fitView]);
  const nodesInitialized = useNodesInitialized();

  const analysis = useMemo(() => analyzeFlow(flow), [flow]);
  const focus = useMemo(() => neighbourhood(flow, analysis, selectedId), [flow, analysis, selectedId]);

  useEffect(() => {
    setNodes((previous) =>
      toNodes(flow, analysis, previous, focus, selectedId, (id, index) => {
        const placed = placement.current.get(id);
        placement.current.delete(id);
        return placed ?? { x: 0, y: index * 160 };
      }),
    );
  }, [flow, analysis, focus, selectedId, setNodes]);

  // wait for measured sizes before running ELK
  useEffect(() => {
    if (!needsLayout || !nodesInitialized || nodes.length !== flow.screens.length) return;
    let cancelled = false;
    const sizes = new Map(
      nodes.map((node) => [node.id, { width: node.measured?.width ?? 260, height: node.measured?.height ?? 120 }]),
    );
    layoutFlow(flow, sizes).then((next) => {
      if (cancelled) return;
      setLayout(next);
      setNodes((current) => current.map((node) => ({ ...node, position: next.positions[node.id] ?? node.position })));
      setNeedsLayout(false);
      requestAnimationFrame(() => fitView({ padding: 0.12, duration: 300 }));
    });
    return () => {
      cancelled = true;
    };
  }, [needsLayout, nodesInitialized, nodes, flow, setNodes, fitView]);

  const edges = useMemo(() => toEdges(flow, nodes, selectedId, layout), [flow, nodes, selectedId, layout]);

  const loadFlow = useCallback(
    (input: unknown) => {
      const result = parseFlow(input);
      if (!result.ok) {
        setLoadErrors(result.errors);
        return;
      }
      setLoadErrors(null);
      setSelectedId(null);
      setNodes([]);
      setFlow(result.flow);
      setNeedsLayout(true);
    },
    [setNodes],
  );

  const loadText = useCallback(
    (text: string) => {
      try {
        loadFlow(JSON.parse(text));
      } catch {
        setLoadErrors(["The file is not valid JSON."]);
      }
    },
    [loadFlow],
  );

  // ?src=https://… opens a flow file published anywhere, e.g. next to a deployed prototype.
  useEffect(() => {
    const src = new URLSearchParams(window.location.search).get("src");
    if (!src) return;
    fetch(src)
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status}`);
        return response.text();
      })
      .then(loadText)
      .catch((error) => setLoadErrors([`Could not load ${src} (${error.message}).`]));
  }, [loadText]);

  useEffect(() => {
    const onDragOver = (event: DragEvent) => {
      event.preventDefault();
      setDragging(true);
    };
    const onDragLeave = (event: DragEvent) => {
      if (event.relatedTarget === null) setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      setDragging(false);
      event.dataTransfer?.files[0]?.text().then(loadText);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [loadText]);

  const onConnect: OnConnect = useCallback(({ source, target }) => {
    if (source === target) return;
    setFlow((current) => addLink(current, source, { to: target, on: "", kind: "navigate" }));
    setSelectedId(source);
  }, []);

  const onAddScreen = () => {
    const { flow: next, id } = addScreen(flow);
    const centre = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const width = 260;
    const height = 110;
    const spot = { x: centre.x - width / 2, y: centre.y - height / 2 };
    const overlaps = () =>
      nodes.some((node) => {
        const w = node.measured?.width ?? width;
        const h = node.measured?.height ?? height;
        return (
          spot.x < node.position.x + w + 16 &&
          spot.x + width + 16 > node.position.x &&
          spot.y < node.position.y + h + 16 &&
          spot.y + height + 16 > node.position.y
        );
      });
    while (overlaps()) spot.y += 40;
    placement.current.set(id, spot);
    setFlow(next);
    setSelectedId(id);
    setJustAdded(id);
  };

  const onRename = (from: string, to: string, next: Flow) => {
    const node = nodes.find((n) => n.id === from);
    if (node) placement.current.set(to, node.position);
    setFlow(next);
    setSelectedId(to);
  };

  const onExport = () => {
    const blob = new Blob([`${JSON.stringify(flow, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${flow.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "flow"}.flow.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const goTo = (id: string) => {
    setSelectedId(id);
    setIssuesOpen(false);
    fitView({ nodes: [{ id }], duration: 300, maxZoom: 1.1, padding: 0.6 });
  };

  const linkCount = flow.screens.reduce((sum, screen) => sum + screen.links.length, 0);

  return (
    <div className="app">
      <header className="toolbar">
        <div className="toolbar-title">
          <input
            className="flow-name"
            aria-label="Flow name"
            value={flow.name}
            onChange={(e) => setFlow({ ...flow, name: e.target.value })}
          />
          <span className="hint">
            {flow.screens.length} screens · {linkCount} links
          </span>
        </div>

        <div className="toolbar-actions">
          <div className="issues">
            <button
              type="button"
              className={analysis.issues.length ? "button is-warn" : "button"}
              aria-expanded={issuesOpen}
              onClick={() => setIssuesOpen((open) => !open)}
            >
              {analysis.issues.length === 0 ? "No issues" : `${analysis.issues.length} issues`}
            </button>
            {issuesOpen && analysis.issues.length > 0 && (
              <ul className="issues-list">
                {analysis.issues.map((issue, i) => (
                  <li key={i}>
                    {issue.screenId ? (
                      <button type="button" className="text-button" onClick={() => goTo(issue.screenId!)}>
                        {issue.message}
                      </button>
                    ) : (
                      issue.message
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button type="button" className="button" onClick={onAddScreen}>
            Add screen
          </button>
          <button type="button" className="button" onClick={() => setNeedsLayout(true)}>
            Tidy layout
          </button>
          {!embed && (
            <>
              <button type="button" className="button" onClick={() => fileInput.current?.click()}>
                Open…
              </button>
              <button type="button" className="button is-primary" onClick={onExport}>
                Export
              </button>
            </>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              e.target.files?.[0]?.text().then(loadText);
              e.target.value = "";
            }}
          />
        </div>
      </header>

      <main className="canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => setSelectedId(node.id)}
          onPaneClick={() => setSelectedId(null)}
          deleteKeyCode={null}
          elementsSelectable={false}
          colorMode={theme}
          zoomOnScroll={!embed}
          preventScrolling={!embed}
          minZoom={0.2}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
          <Controls showInteractive={false} />
          {!embed && <MiniMap pannable zoomable className="minimap" />}
          <div className="legend" aria-label="Legend">
            <span className="legend-item kind-navigate">navigate</span>
            <span className="legend-item kind-overlay">overlay</span>
            <span className="legend-item kind-redirect">redirect</span>
          </div>
        </ReactFlow>

        {selectedId && (
          <Inspector
            flow={flow}
            analysis={analysis}
            screenId={selectedId}
            onChange={setFlow}
            onRename={onRename}
            onSelect={setSelectedId}
            isNew={selectedId === justAdded}
          />
        )}

        {loadErrors && (
          <div className="dialog" role="alertdialog" aria-labelledby="load-errors-title">
            <h2 id="load-errors-title">This flow could not be opened</h2>
            <ul>
              {loadErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
            <button type="button" className="button" onClick={() => setLoadErrors(null)}>
              Keep the current flow
            </button>
          </div>
        )}

        {dragging && <div className="drop-hint">Drop a .flow.json file to open it</div>}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  );
}
