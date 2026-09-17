# Prototype graph

A map of how the screens in a prototype connect. You describe the flow in a JSON file, and it draws the graph and points out screens that can't be reached or lead nowhere.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshot-dark.png">
  <img alt="A booking flow drawn as a graph. The Listing screen is selected, its links are highlighted and its details are open in a side panel." src="docs/screenshot-light.png">
</picture>

I first built a version of this for a design team working on multi-screen prototypes. Past about ten screens nobody could say how everything connected, and clicking through never showed the screen that nothing links to.

## Features

- Left-to-right layout with labelled links: solid for navigation, dashed for overlays, dotted for redirects
- Issues list: unreachable screens, dead ends, links to missing screens
- Preview and source links on every screen
- Add, link (drag from one card to another), rename and delete screens, then export the file
- Open a file from disk, by dropping it on the page, or with `?src=https://…/app.flow.json`

## Flow file

```json
{
  "name": "Stay booking",
  "start": ["search"],
  "screens": [
    {
      "id": "search",
      "title": "Search",
      "status": "ready",
      "preview": "https://example.com/prototype/search",
      "links": [{ "to": "results", "on": "Submits a search", "kind": "navigate" }]
    },
    { "id": "results", "title": "Results", "status": "draft", "terminal": true, "links": [] }
  ]
}
```

`start` is where reachability is measured from. `terminal` marks a screen that is supposed to end the flow, so it isn't flagged as a dead end. `kind` is `navigate` (default), `overlay` or `redirect`. Full example: [`examples/stay-booking.flow.json`](examples/stay-booking.flow.json).

## Notes on how it's built

The file is the source of truth. I didn't read routes from the prototype's code because that ties the tool to one framework, and routes don't know about overlays or screens that are still just an idea.

Layout isn't saved. Positions are recalculated each time, so the file only changes when the flow does. The downside is that dragging cards around doesn't stick.

ELK does the layout and also routes the lines and places the labels. When I only used it for card positions, return links ran behind cards and labels piled up. After you drag a card its lines switch to simple step paths until you hit *Tidy layout*.

A file with broken links still opens and lists them as issues. Only invalid files are rejected, with every error listed at once.

Preview and source links must be http(s), since files can be loaded from any URL.

Code: [`schema.ts`](src/flow/schema.ts) validates, [`analyze.ts`](src/flow/analyze.ts) finds issues, [`layout.ts`](src/flow/layout.ts) calls ELK, [`edit.ts`](src/flow/edit.ts) has the edits as pure functions.

## Run

```bash
npm install
npm run dev
npm test
npm run build
```

React, TypeScript, [React Flow](https://reactflow.dev), [ELK](https://eclipse.dev/elk/).

## Not done yet

- Links are written by hand. Generating a first draft from a router config would help.
- Export downloads the file; there's no saving back to a repo.
- It opens on a phone but isn't meant for editing there.

MIT
