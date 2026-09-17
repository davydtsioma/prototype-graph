import { SCREEN_ID, type Flow, type Link, type Screen } from "./schema";

type ScreenPatch = Partial<Omit<Screen, "id" | "links">>;

const OPTIONAL = ["owner", "notes", "preview", "source"] as const;

const mapScreen = (flow: Flow, id: string, fn: (screen: Screen) => Screen): Flow => ({
  ...flow,
  screens: flow.screens.map((s) => (s.id === id ? fn(s) : s)),
});

export function uniqueId(flow: Flow, base: string): string {
  const slug =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "screen";
  const taken = new Set(flow.screens.map((s) => s.id));
  if (!taken.has(slug)) return slug;
  let n = 2;
  while (taken.has(`${slug}-${n}`)) n++;
  return `${slug}-${n}`;
}

export function addScreen(flow: Flow, title = "New screen"): { flow: Flow; id: string } {
  const id = uniqueId(flow, title);
  const screen: Screen = { id, title, status: "idea", links: [] };
  return {
    id,
    flow: {
      ...flow,
      start: flow.screens.length === 0 ? [id] : flow.start,
      screens: [...flow.screens, screen],
    },
  };
}

export function updateScreen(flow: Flow, id: string, patch: ScreenPatch): Flow {
  return mapScreen(flow, id, (screen) => {
    const next: Screen = { ...screen, ...patch };
    // drop empty fields so the exported file stays clean
    for (const key of OPTIONAL) {
      if (!next[key]?.trim()) delete next[key];
    }
    if (!next.terminal) delete next.terminal;
    return next;
  });
}

// returns an error string if the id can't be used
export function renameScreen(flow: Flow, id: string, nextId: string): Flow | string {
  if (nextId === id) return flow;
  if (!SCREEN_ID.test(nextId)) return "Use lowercase letters, digits and dashes.";
  if (flow.screens.some((s) => s.id === nextId)) return `"${nextId}" is already used.`;

  const swap = (value: string) => (value === id ? nextId : value);
  return {
    ...flow,
    start: flow.start.map(swap),
    screens: flow.screens.map((screen) => ({
      ...screen,
      id: swap(screen.id),
      links: screen.links.map((link) => ({ ...link, to: swap(link.to) })),
    })),
  };
}

export function removeScreen(flow: Flow, id: string): Flow {
  return {
    ...flow,
    start: flow.start.filter((s) => s !== id),
    screens: flow.screens
      .filter((screen) => screen.id !== id)
      .map((screen) => ({ ...screen, links: screen.links.filter((link) => link.to !== id) })),
  };
}

export function setStart(flow: Flow, id: string, isStart: boolean): Flow {
  const rest = flow.start.filter((s) => s !== id);
  return { ...flow, start: isStart ? [...rest, id] : rest };
}

export function addLink(flow: Flow, from: string, link: Link): Flow {
  return mapScreen(flow, from, (screen) => ({ ...screen, links: [...screen.links, link] }));
}

export function updateLink(flow: Flow, from: string, index: number, patch: Partial<Link>): Flow {
  return mapScreen(flow, from, (screen) => ({
    ...screen,
    links: screen.links.map((link, i) => (i === index ? { ...link, ...patch } : link)),
  }));
}

export function removeLink(flow: Flow, from: string, index: number): Flow {
  return mapScreen(flow, from, (screen) => ({
    ...screen,
    links: screen.links.filter((_, i) => i !== index),
  }));
}
