import { useEffect, useState } from "react";
import type { Analysis } from "../flow/analyze";
import {
  removeLink,
  removeScreen,
  renameScreen,
  setStart,
  updateLink,
  updateScreen,
} from "../flow/edit";
import { LINK_KINDS, STATUSES, isSafeUrl, type Flow, type LinkKind, type Status } from "../flow/schema";

interface Props {
  flow: Flow;
  analysis: Analysis;
  screenId: string;
  onChange: (flow: Flow) => void;
  onRename: (from: string, to: string, flow: Flow) => void;
  onSelect: (id: string | null) => void;
  /** A screen that was just added opens with its title selected, ready to be named. */
  isNew?: boolean;
}

export function Inspector({ flow, analysis, screenId, onChange, onRename, onSelect, isNew = false }: Props) {
  const screen = flow.screens.find((s) => s.id === screenId);
  const facts = analysis.facts.get(screenId);
  const [draftId, setDraftId] = useState(screenId);
  const [idError, setIdError] = useState<string | null>(null);

  useEffect(() => {
    setDraftId(screenId);
    setIdError(null);
  }, [screenId]);

  if (!screen || !facts) return null;

  const titleOf = (id: string) => flow.screens.find((s) => s.id === id)?.title ?? id;

  const commitId = () => {
    const result = renameScreen(flow, screenId, draftId.trim());
    if (typeof result === "string") {
      setIdError(result);
    } else if (draftId.trim() !== screenId) {
      setIdError(null);
      onRename(screenId, draftId.trim(), result);
    }
  };

  const urlField = (key: "preview" | "source", label: string) => {
    const value = screen[key] ?? "";
    const invalid = value !== "" && !isSafeUrl(value);
    return (
      <label className="field">
        <span>{label}</span>
        <input
          type="url"
          placeholder="https://"
          value={value}
          aria-invalid={invalid}
          onChange={(e) => onChange(updateScreen(flow, screenId, { [key]: e.target.value }))}
        />
        {invalid && <small className="field-error">Use an http(s) address.</small>}
      </label>
    );
  };

  return (
    <aside className="inspector" aria-label={`Screen: ${screen.title}`}>
      <header className="inspector-head">
        <h2>{screen.title}</h2>
        <button type="button" className="icon-button" aria-label="Close" onClick={() => onSelect(null)}>
          ×
        </button>
      </header>

      <div className="inspector-body">
        <label className="field">
          <span>Title</span>
          <input
            key={screenId}
            autoFocus={isNew}
            onFocus={(e) => isNew && e.target.select()}
            value={screen.title}
            onChange={(e) => onChange(updateScreen(flow, screenId, { title: e.target.value }))}
          />
        </label>

        <label className="field">
          <span>Id</span>
          <input
            className="mono"
            value={draftId}
            aria-invalid={idError !== null}
            onChange={(e) => setDraftId(e.target.value)}
            onBlur={commitId}
            onKeyDown={(e) => e.key === "Enter" && commitId()}
          />
          {idError && <small className="field-error">{idError}</small>}
        </label>

        <div className="field-row">
          <label className="field">
            <span>Status</span>
            <select
              value={screen.status}
              onChange={(e) => onChange(updateScreen(flow, screenId, { status: e.target.value as Status }))}
            >
              {STATUSES.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Owner</span>
            <input
              value={screen.owner ?? ""}
              onChange={(e) => onChange(updateScreen(flow, screenId, { owner: e.target.value }))}
            />
          </label>
        </div>

        <label className="field">
          <span>Notes</span>
          <textarea
            rows={3}
            value={screen.notes ?? ""}
            onChange={(e) => onChange(updateScreen(flow, screenId, { notes: e.target.value }))}
          />
        </label>

        {urlField("preview", "Preview")}
        {urlField("source", "Source")}

        <div className="checks">
          <label>
            <input
              type="checkbox"
              checked={facts.isStart}
              onChange={(e) => onChange(setStart(flow, screenId, e.target.checked))}
            />
            Start screen
          </label>
          <label>
            <input
              type="checkbox"
              checked={screen.terminal ?? false}
              onChange={(e) => onChange(updateScreen(flow, screenId, { terminal: e.target.checked }))}
            />
            Ends the flow
          </label>
        </div>

        <section>
          <h3>Leads to</h3>
          {screen.links.length === 0 && (
            <p className="hint">Drag from the dot on the right of the card to another screen.</p>
          )}
          <ul className="links">
            {screen.links.map((link, index) => (
              <li key={index} className="link-row">
                <input
                  aria-label="Trigger"
                  placeholder="What does the person do?"
                  value={link.on}
                  onChange={(e) => onChange(updateLink(flow, screenId, index, { on: e.target.value }))}
                />
                <div className="link-meta">
                  <select
                    aria-label="Kind"
                    value={link.kind}
                    onChange={(e) =>
                      onChange(updateLink(flow, screenId, index, { kind: e.target.value as LinkKind }))
                    }
                  >
                    {LINK_KINDS.map((kind) => (
                      <option key={kind}>{kind}</option>
                    ))}
                  </select>
                  <span aria-hidden>→</span>
                  <select
                    aria-label="Target screen"
                    value={link.to}
                    onChange={(e) => onChange(updateLink(flow, screenId, index, { to: e.target.value }))}
                  >
                    {!flow.screens.some((s) => s.id === link.to) && <option value={link.to}>{link.to} (missing)</option>}
                    {flow.screens
                      .filter((s) => s.id !== screenId)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.title}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Remove link"
                    onClick={() => onChange(removeLink(flow, screenId, index))}
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3>Reached from</h3>
          {facts.incoming.length === 0 ? (
            <p className="hint">No screen links here.</p>
          ) : (
            <ul className="incoming">
              {facts.incoming.map(({ from, index, link }) => (
                <li key={`${from}:${index}`}>
                  <button type="button" className="text-button" onClick={() => onSelect(from)}>
                    {titleOf(from)}
                  </button>
                  {link.on && <span className="hint"> · {link.on}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <button
          type="button"
          className="danger-button"
          onClick={() => {
            onSelect(null);
            onChange(removeScreen(flow, screenId));
          }}
        >
          Delete screen
        </button>
      </div>
    </aside>
  );
}
