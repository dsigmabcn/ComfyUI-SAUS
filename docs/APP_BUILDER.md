# App Builder

[Return to User Guide](USER_GUIDE.md)

SAUS app building is **not part of ComfyUI-SAUS core**. It is provided by the companion **ComfyUI-SAUS-builder** package, installed next to `ComfyUI-SAUS` inside `custom_nodes/`:

```
custom_nodes/
├── ComfyUI-SAUS/            # runtime (serves + runs apps)
└── ComfyUI-SAUS-builder/    # the App Builder
```

The builder runs **inside ComfyUI** and drives the **live ComfyUI graph** — no separate graph is drawn — writing finished apps into `ComfyUI-SAUS/web/apps/`.

## Using it

1. Open ComfyUI.
2. Left sidebar → **hammer icon** → **Create new SAUS app**.
   (If it is missing, run `__sausBuilder.open()` in the browser console.)
3. **Inputs** — click a parameter's tick-box on a node to expose it (selected parameters are highlighted blue).
4. **Outputs** — pickable output nodes are outlined orange with a tick-box in their corner; click to select.
5. **Preview** — the left pane is the real SAUS app runtime (embedded iframe). Edit the name, components and layout on the right, then **Save App**.

See the package's own `README.md` for the full workflow, editing existing apps, and the list of component types.

### Formats
- **UI format** (the normal *Save* / drag-out JSON) — loaded directly by ComfyUI.
- **API format** (*Workflow → Export (API)*) — ComfyUI loads it too.

The saved `wf.json` always comes from ComfyUI's own `app.graphToPrompt()`, so it is exactly what ComfyUI itself would run.

> If a UI workflow contains front-end-only nodes (sub-graphs / blueprints), a warning is shown — re-export with **Export (API)** if the saved app does not run. Notes and reroute nodes are handled automatically.


## Widget layout &amp; style (`appConfig.json`)
The builder writes the standard `appConfig.json`, recording per component an optional block:

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
