export const STATUSES = ["idea", "draft", "review", "ready"] as const;
export const LINK_KINDS = ["navigate", "overlay", "redirect"] as const;

export type Status = (typeof STATUSES)[number];
export type LinkKind = (typeof LINK_KINDS)[number];

export interface Link {
  to: string;
  on: string;
  kind: LinkKind;
}

export interface Screen {
  id: string;
  title: string;
  status: Status;
  owner?: string;
  notes?: string;
  preview?: string;
  source?: string;
  /** intended end of the flow, not a dead end */
  terminal?: boolean;
  links: Link[];
}

export interface Flow {
  name: string;
  start: string[];
  screens: Screen[];
}

export type ParseResult =
  | { ok: true; flow: Flow }
  | { ok: false; errors: string[] };

export const SCREEN_ID = /^[a-z0-9][a-z0-9-]*$/;

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

// files can come from any URL, so no javascript: links
export function isSafeUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

// Collects all errors. Links to missing screens are allowed (shown as issues instead).
export function parseFlow(input: unknown): ParseResult {
  const errors: string[] = [];

  if (!isObject(input)) {
    return { ok: false, errors: ["The file must contain a JSON object."] };
  }

  if (!isNonEmptyString(input.name)) {
    errors.push("`name` must be a non-empty string.");
  }

  const start = input.start;
  if (!Array.isArray(start) || !start.every(isNonEmptyString)) {
    errors.push("`start` must be a list of screen ids.");
  }

  if (!Array.isArray(input.screens)) {
    errors.push("`screens` must be a list.");
    return { ok: false, errors };
  }

  const ids = new Set<string>();
  const screens: Screen[] = [];

  input.screens.forEach((raw, i) => {
    const at = `screens[${i}]`;
    if (!isObject(raw)) {
      errors.push(`${at} must be an object.`);
      return;
    }

    const id = raw.id;
    const label = isNonEmptyString(id) ? `Screen "${id}"` : at;

    if (!isNonEmptyString(id) || !SCREEN_ID.test(id)) {
      errors.push(`${at}.id must use lowercase letters, digits and dashes.`);
    } else if (ids.has(id)) {
      errors.push(`${label} is defined more than once.`);
    } else {
      ids.add(id);
    }

    if (!isNonEmptyString(raw.title)) {
      errors.push(`${label}: \`title\` must be a non-empty string.`);
    }

    if (!STATUSES.includes(raw.status as Status)) {
      errors.push(`${label}: \`status\` must be one of ${STATUSES.join(", ")}.`);
    }

    for (const key of ["owner", "notes"] as const) {
      if (raw[key] !== undefined && typeof raw[key] !== "string") {
        errors.push(`${label}: \`${key}\` must be a string.`);
      }
    }

    for (const key of ["preview", "source"] as const) {
      const value = raw[key];
      if (value !== undefined && (typeof value !== "string" || !isSafeUrl(value))) {
        errors.push(`${label}: \`${key}\` must be an http(s) URL.`);
      }
    }

    if (raw.terminal !== undefined && typeof raw.terminal !== "boolean") {
      errors.push(`${label}: \`terminal\` must be true or false.`);
    }

    const links: Link[] = [];
    if (raw.links !== undefined && !Array.isArray(raw.links)) {
      errors.push(`${label}: \`links\` must be a list.`);
    }
    (Array.isArray(raw.links) ? raw.links : []).forEach((link, j) => {
      const linkAt = `${label}, links[${j}]`;
      if (!isObject(link)) {
        errors.push(`${linkAt} must be an object.`);
        return;
      }
      if (!isNonEmptyString(link.to)) {
        errors.push(`${linkAt}: \`to\` must be a screen id.`);
      }
      if (typeof link.on !== "string") {
        errors.push(`${linkAt}: \`on\` must describe what triggers the link.`);
      }
      const kind = link.kind ?? "navigate";
      if (!LINK_KINDS.includes(kind as LinkKind)) {
        errors.push(`${linkAt}: \`kind\` must be one of ${LINK_KINDS.join(", ")}.`);
      }
      links.push({ to: String(link.to), on: String(link.on ?? ""), kind: kind as LinkKind });
    });

    screens.push({
      id: String(id),
      title: String(raw.title),
      status: raw.status as Status,
      ...(typeof raw.owner === "string" && raw.owner ? { owner: raw.owner } : {}),
      ...(typeof raw.notes === "string" && raw.notes ? { notes: raw.notes } : {}),
      ...(typeof raw.preview === "string" ? { preview: raw.preview } : {}),
      ...(typeof raw.source === "string" ? { source: raw.source } : {}),
      ...(raw.terminal === true ? { terminal: true } : {}),
      links,
    });
  });

  if (Array.isArray(start)) {
    for (const id of start) {
      if (isNonEmptyString(id) && !ids.has(id)) {
        errors.push(`\`start\` lists "${id}", which is not a screen.`);
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, flow: { name: String(input.name), start: start as string[], screens } };
}
