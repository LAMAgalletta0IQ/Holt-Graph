# Holt Graph Builder

An interactive **Holt Resource Allocation Graph** builder and deadlock detection tool,
built with **React 19** and **Vite**.

## What it does

- Create **processes** (circles) and **resources** (rectangles with configurable multiplicity)
- Draw **assignment** arrows (R→P) and **request** arrows (P→R)
- Real-time **deadlock detection** via DFS cycle detection on the wait-for graph
- **Reducibility** check (at least one process can proceed)
- Drag & drop nodes, multi-select, delete, and clear all
- Dark-themed responsive UI

## How it works

The graph is rendered entirely with **custom code** — no third-party graph libraries.
Nodes are absolutely-positioned `div` elements styled with CSS; arrows are SVG `line`
elements with marker-end definitions. The deadlock detection algorithm builds a
wait-for graph from requests and assignments, then runs a DFS to detect cycles
(Coffman's circular wait condition).

## Tech stack

| Layer     | Technology              |
| --------- | ----------------------- |
| UI        | React 19                |
| Bundler   | Vite                    |
| Styling   | CSS (Grid, custom vars) |
| Graphics  | SVG (arrows, markers)   |
| Fonts     | Google Fonts            |

## Getting started

```bash
npm install
npm run dev
```

## Build for production

```bash
npm run build
npm run preview
```
