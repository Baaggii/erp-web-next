# Prompt: Unlock `idField` dropdown interactivity

Use this prompt with your coding assistant to ensure the identifier column behaves like other relation-driven dropdowns:

> "In the dynamic transaction stack, treat any column configured as an `idField` as a first-class relation input. When the field receives focus, the UI should render it with the same `AsyncSearchSelect` component used for other relation columns so the dropdown opens immediately. Strip the column out of all guard/disabled-field sets (including locked defaults, temporary-flow guards, and modal-level `disabledFields`) to keep the input editable, and wire the usual `onChange`/`onSelect` handlers so the user can choose an option and persist the value."

If you also need regression coverage, add this follow-up prompt:

> "Add a component test that renders a transaction modal with an `idField` relation. Assert that the `AsyncSearchSelect` for the identifier is enabled, exposes the dropdown options once focused, and captures the selected value in form state even when temporary-only configuration flags are active."
