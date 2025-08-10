# Report Builder

The Report Builder now guards its initial data fetch and wraps all rendering
inside an error boundary. When the table list fails to load, the page shows a
clear message instead of a blank screen. Any runtime errors triggered by button
presses are caught and displayed, preventing the window from going blank.

When extending the builder, throw descriptive errors rather than letting
failures fall through silently so the boundary can surface them to the user.
