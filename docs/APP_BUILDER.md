# App Builder

[Return to User Guide](USER_GUIDE.md)

SAUS ships **three** ways to build an app. The recommended one runs **inside ComfyUI** and uses the real ComfyUI graph.

| Builder | Where | Notes |
| --- | --- | --- |
| **SAUS App Builder** (recommended) | inside ComfyUI — topbar button **SAUS Builder** | 3 steps over the **live ComfyUI graph**. No separate graph is drawn. |
| Classic | `/saus/builder` | Single screen, node-centric |
| Guided (legacy) | `/saus/builder_v2` | Thin wrapper: embeds the **real ComfyUI frontend** — no custom graph |

## Recommended: SAUS App Builder (inside ComfyUI)

Shipped as a ComfyUI frontend extension (`web/core/js/common/scripts/sausAppBuilder.js`, exposed through `WEB_DIRECTORY`, so ComfyUI loads it automatically). It **does not draw its own graph** — it drives the live ComfyUI canvas using the same APIs ComfyUI itself uses (`app.canvas.convertEventToCanvasOffset`, `graph.getNodeOnPos`, `node.getWidgetOnPos`) and exports the workflow with `app.graphToPrompt()` — so sub-graphs / blueprints are handled by ComfyUI itself, not re-implemented.

1. **Inputs** — open your workflow in ComfyUI (drag & drop the JSON onto the canvas), press **SAUS Builder**, then **click a parameter** on a node to expose it. Selected parameters are outlined **green** on the canvas; hovering shows the node/widget under the cursor. Change a widget's kind with the dropdown next to each row (`prompt`, `stepper`, `dropdown`, `seeder`, `imageLoader`, `toggle`, `input`).
2. **Outputs** — **click the node(s)** whose results the app should display (outlined **purple**). Select none to show every output.
3. **Preview** — set the app name/description, then **Save App** (writes a normal app into `web/apps/`), **Copy appConfig**, or **Open preview**.

While picking, the canvas is set read-only (the same technique ComfyUI's own App Builder uses) and restored when you leave the step.

> If the topbar button does not appear, open the browser console and run `__sausAppBuilder.open()`.

## Classic builder — `/saus/builder`
Single screen: load a workflow (API format), pick nodes from a dropdown, add components one at a time, group them into multi-components, and save.

## `/saus/builder_v2` — the builder, embedded
This page is a thin wrapper: it embeds the **real ComfyUI frontend** (`/`) in a frame and adds nothing of its own — there is no custom graph. ComfyUI draws the graph; the SAUS extension (loaded automatically by ComfyUI) supplies the **SAUS Builder** button and the 3-step panel.

Use it if you prefer to stay on a SAUS URL:

1. Open `http://<host>:<port>/saus/builder_v2`
2. Drag your workflow JSON anywhere onto the graph.
3. Click **SAUS Builder** (top bar) &rarr; step 1 &rarr; **Next** &rarr; step 2 &rarr; **Next** &rarr; step 3 &rarr; **Save App**.

If the page reports that the extension was not detected, reload ComfyUI once (so it picks up `sausAppBuilder.js`) or run `__sausAppBuilder.open()` in the browser console.

### Formats
- **UI format** (the normal *Save* / drag-out JSON) — loaded directly by ComfyUI.
- **API format** (*Workflow → Export (API)*) — ComfyUI loads it too.

The saved `wf.json` always comes from ComfyUI's own `app.graphToPrompt()`, so it is exactly what ComfyUI itself would run.

> If a UI workflow contains front-end-only nodes (sub-graphs / blueprints), a warning is shown — re-export with **Export (API)** if the saved app does not run. Notes and reroute nodes are handled automatically.


## Widget layout &amp; style (`appConfig.json`)
Both builders write the standard `appConfig.json`. The guided builder additionally records, per component, an optional block:

```json
{
  "id": "stepper12ab34",
  "label": "Steps",
  "nodePath": "3.inputs.steps",
  "layout": { "region": "basic", "order": 0 },
  "style":  { "width": "50%" }
}
```

and, when outputs are selected, a top-level list:

```json
"outputs": [ { "id": "output9", "label": "Save Image", "nodeId": "9", "type": "media" } ]
```

The app runtime:
- honours `layout.region` (`basic` / `advanced`) and `layout.order`, **falling back to the legacy label-based placement and DOM order when the keys are absent**;
- applies `style` entries as inline CSS on the widget container (camelCase or kebab-case keys);
- when `outputs` is present, only shows media produced by the listed `nodeId`s.

Because all three keys are optional, components without them behave exactly as before — **existing apps are unaffected**.
