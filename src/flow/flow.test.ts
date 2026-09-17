import { describe, expect, it } from "vitest";
import sample from "../../examples/stay-booking.flow.json";
import { analyzeFlow } from "./analyze";
import { addScreen, removeScreen, renameScreen, updateScreen } from "./edit";
import { parseFlow, type Flow } from "./schema";

const flow = (screens: Flow["screens"], start = ["a"]): Flow => ({ name: "Test", start, screens });
const screen = (id: string, links: [string, string?][] = [], extra = {}) => ({
  id,
  title: id.toUpperCase(),
  status: "draft" as const,
  links: links.map(([to, on = ""]) => ({ to, on, kind: "navigate" as const })),
  ...extra,
});

describe("parseFlow", () => {
  it("accepts the example flow", () => {
    expect(parseFlow(sample).ok).toBe(true);
  });

  it("reports every problem at once", () => {
    const result = parseFlow({
      name: "",
      start: ["missing"],
      screens: [
        { id: "a", title: "A", status: "done", links: [] },
        { id: "a", title: "", status: "draft", links: [{ to: "b", on: "Go", kind: "teleport" }] },
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(6);
  });

  it("rejects links that are not http(s)", () => {
    const result = parseFlow({
      name: "x",
      start: ["a"],
      screens: [{ id: "a", title: "A", status: "idea", preview: "javascript:alert(1)", links: [] }],
    });
    expect(result.ok).toBe(false);
  });

  it("defaults a link's kind to navigate", () => {
    const result = parseFlow({
      name: "x",
      start: ["a"],
      screens: [
        { id: "a", title: "A", status: "idea", links: [{ to: "b", on: "Go" }] },
        { id: "b", title: "B", status: "idea", terminal: true },
      ],
    });
    expect(result.ok && result.flow.screens[0].links[0].kind).toBe("navigate");
  });
});

describe("analyzeFlow", () => {
  it("finds unreachable screens, dead ends and broken links", () => {
    const { facts, issues } = analyzeFlow(
      flow([
        screen("a", [["b"], ["ghost"]]),
        screen("b", [], { terminal: true }),
        screen("c", [["a"]]),
        screen("d"),
      ]),
    );
    expect(facts.get("c")?.isUnreachable).toBe(true);
    expect(facts.get("b")?.isDeadEnd).toBe(false);
    expect(facts.get("d")?.isDeadEnd).toBe(true);
    expect(issues.map((i) => `${i.kind}:${i.screenId}`).sort()).toEqual(
      ["broken-link:a", "dead-end:d", "unreachable:c", "unreachable:d"].sort(),
    );
  });

  it("does not count a link to itself as a way out", () => {
    const { facts } = analyzeFlow(flow([screen("a", [["a"]])]));
    expect(facts.get("a")?.isDeadEnd).toBe(true);
  });

  it("records incoming links", () => {
    const { facts } = analyzeFlow(flow([screen("a", [["b", "Next"]]), screen("b", [["a", "Back"]])]));
    expect(facts.get("b")?.incoming).toEqual([{ from: "a", index: 0, link: { to: "b", on: "Next", kind: "navigate" } }]);
  });
});

describe("edits", () => {
  const base = flow([screen("a", [["b"]]), screen("b", [["a"]])]);

  it("renames a screen everywhere it is referenced", () => {
    const next = renameScreen(base, "a", "home") as Flow;
    expect(next.start).toEqual(["home"]);
    expect(next.screens.map((s) => s.id)).toEqual(["home", "b"]);
    expect(next.screens[1].links[0].to).toBe("home");
  });

  it("refuses ids that are taken or malformed", () => {
    expect(renameScreen(base, "a", "b")).toBeTypeOf("string");
    expect(renameScreen(base, "a", "Not An Id")).toBeTypeOf("string");
  });

  it("removes links to a deleted screen", () => {
    const next = removeScreen(base, "b");
    expect(next.screens).toHaveLength(1);
    expect(next.screens[0].links).toEqual([]);
  });

  it("gives new screens unique ids", () => {
    const once = addScreen(base, "Checkout");
    const twice = addScreen(once.flow, "Checkout");
    expect([once.id, twice.id]).toEqual(["checkout", "checkout-2"]);
  });

  it("drops empty optional fields", () => {
    const next = updateScreen(base, "a", { owner: "  ", terminal: false });
    expect(next.screens[0]).not.toHaveProperty("owner");
    expect(next.screens[0]).not.toHaveProperty("terminal");
  });
});
