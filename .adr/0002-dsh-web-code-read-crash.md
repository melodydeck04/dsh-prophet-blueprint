# DSH Web 0.1.1-rc.2 client throws on `something.code` during render

<!-- blueprint-current:0002-dsh-web-code-read-crash.md -->

## Status

Accepted. 2026-09-06.

## Context and problem statement

While shipping Blueprint Web (the `conversation.view` slot entry rendered by
`@dsh-plugins/design-blueprint`), users see the following browser console
error every time the chat view re-renders:

```
index-Df-65__b.js:56 TypeError: Cannot read properties of undefined (reading 'code')
    at wp (index-Df-65__b.js:89:51)
    at r2 (index-Df-65__b.js:87:625)
    at index-Df-65__b.js:84:3372
    at Array.map (<anonymous>)
    at Ul (index-Df-65__b.js:84:3365)
    at Mp (index-Df-65__b.js:91:2955)
    at index-Df-65__b.js:95:298
    at Object.useMemo (index-Df-65__b.js:54:23590)
```

The stack frames (`wp`, `r2`, `Ul`, `Mp`) are minified inside the
`@deepseek-ai/dsh-web-frontend` bundle, **not** in our plugin's
`lib/client.js`. `lib/client.js` line 110 (the `BlueprintView` render
function) and the new `BlueprintErrorBoundary` wrapper surface this error
as a local fallback message but do not propagate it. Before the wrapper
existed, the DSH slot-level error boundary reported
`client.js:526 slot entry crashed in 'conversation.view'`, killing the
Blueprint tab entirely.

## Decision

- Treat the error as a DSH Web bug, not a Blueprint bug. The stack is in
  `index-Df-65__b.js`, which is shipped as part of
  `@deepseek-ai/dsh-web-frontend/dist/assets/`.
- Keep `BlueprintErrorBoundary` in `lib/client.js` as a defensive wrapper.
  It catches sibling slot entry throws, keeps BlueprintView alive, and
  surfaces the actual error message in a fallback alert inside the Blueprint
  tab. This unblocks shipping the tab; the underlying DSH bug is
  out of our scope.
- File a separate issue against `@deepseek-ai/dsh-web-frontend` for the
  `something.code` read on a mapped element. The most likely candidate is a
  chat or trajectory entry that builds children via `.map()` and assumes
  every entry carries a `code` field; the entry produced by some recent
  session does not.

## Consequences

- Blueprint Web users see one console warning per render
  (`[design-blueprint] local render error caught`) but the Blueprint tab
  continues to render. Without the boundary, the entire
  `conversation.view` slot crashes (DSH slot error wrapper is a coarser
  layer that hides the real cause).
- The DSH Web bug must be fixed upstream before we can drop the boundary.
- A regression in the boundary's `componentDidCatch` is silent: if it ever
  re-throws, BlueprintView will fall back to the DSH slot-level crash
  message. The `tests/client-render-smoke.test.js` walker
  (`walk(node)`) flags any non-array children, which would catch
  single-element / list-rendering regressions in the same code path.

## Reproduction

1. Start `dsh web` against a project containing `design-blueprint.json`.
2. Open the web UI at `http://127.0.0.1:3080/`.
3. Open the Blueprint tab (or any tab that mounts the
   `design-blueprint` `conversation.view` slot entry).
4. Open DevTools → Console.
5. Observe the stack above. The error appears once per React render where
   a sibling slot entry iterates a list and reads `.code`.

## Reference

- `lib/client.js` `BlueprintErrorBoundary` (defensive wrapper)
- `lib/client.js` `BlueprintView` `useEffect` `load()` (our own data path,
  proves the bug is not in our `dashboard` call: `next` arrives as a
  well-shaped object with all expected keys)
- `tests/client-render-smoke.test.js` (JSX balance walker)
