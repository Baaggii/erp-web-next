# Policy Authoring UI (Visual Workflow Graph)

The Event Policy Builder now uses a **visual graph editor** instead of separate condition/action forms.

## What changed

- Policies and drafts support `graph_json` with nodes:
  - `id`
  - `type` (`trigger`, `condition`, `action`, `delay`, `merge`)
  - `properties`
  - `nextIds`
- Legacy `condition_json` and `action_json` are still persisted for compatibility.
- A **Convert to Visual Flow** action creates a default graph from legacy JSON.

## Authoring steps

1. Fill policy metadata (name/key/module/priority/enabled).
2. Add nodes from the left palette.
3. Select a node and edit its properties.
4. Connect nodes with `nextIds` (side panel).
5. Verify graph validation and save draft/deploy.

## Simulation

Simulation now accepts `graph_json` and shows:

- Execution path of nodes
- Delay annotations (`Wait X then continue`)
- Generated action preview

## Accessibility and usability

- Keyboard shortcuts: `Delete` (remove node), `Ctrl/Cmd + C` (copy selected node)
- Zoom controls on canvas
- Tooltips and inline node help in the palette
