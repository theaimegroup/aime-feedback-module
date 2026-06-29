# @aime-platform/aime-feedback-module

In-app feedback widget for AIME model previews. Captures a screenshot, lets users annotate it, then submits structured feedback to the AIME platform.

---

## Installation

Public package on **npmjs.org** — no auth, no `.npmrc`, just install.

```bash
npm install @aime-platform/aime-feedback-module
```

Peer dependencies (must already be in your project):

```bash
npm install react react-dom
```

---

## Quick start

Wrap your app with `FeedbackProvider`. It mounts the FAB and wires up context.

```tsx
import { FeedbackProvider } from '@aime-platform/aime-feedback-module'

export default function App() {
  return (
    <FeedbackProvider
      projectId="your-aime-project-id"
      projectsMsToken={FEEDBACK_PROJECTS_MS_TOKEN}
      projectsMsBaseUrl={FEEDBACK_PROJECTS_MS_URL}
      filesMsApiBaseUrl={FEEDBACK_FILES_MS_URL}
      filesMsToken={FEEDBACK_FILES_MS_TOKEN}
    >
      <YourApp />
    </FeedbackProvider>
  )
}
```

No stylesheet import is required — the widget is fully self-styled.

A floating action button appears in the bottom-left corner. Drag it to any corner — position persists in `localStorage`.

### Environment variables (read this)

`FeedbackProvider` is a **client component**, so the four URL/token values must be exposed to the **browser** using your framework's public env prefix. A bare `process.env.PROJECTS_MS_TOKEN` is `undefined` in the browser — the widget will still render, but every API call (submit feedback, upload image) silently fails.

| Framework | How to read it client-side |
|---|---|
| **Next.js** | `process.env.NEXT_PUBLIC_FEEDBACK_PROJECTS_MS_TOKEN` (prefix `NEXT_PUBLIC_`) |
| **Vite** | `import.meta.env.VITE_FEEDBACK_PROJECTS_MS_TOKEN` (prefix `VITE_`) |
| **CRA** | `process.env.REACT_APP_FEEDBACK_PROJECTS_MS_TOKEN` (prefix `REACT_APP_`) |

> **Security:** `projectsMsToken` and `filesMsToken` are shipped to the browser — unavoidable for a client-side widget. Use tokens scoped to feedback + file upload only, not broad admin tokens.

> **Tip:** fall back to a `"__missing__"` sentinel when a var is unset, e.g. `projectsMsToken={process.env.NEXT_PUBLIC_FEEDBACK_PROJECTS_MS_TOKEN || "__missing_token__"}`. Any required prop starting with `__` cleanly disables the widget instead of firing broken requests (see [Props](#props)).

---

## Props

Both `FeedbackProvider` and `FeedbackWidget` accept the same props (provider also accepts `children`).

| Prop | Type | Required | Description |
|---|---|---|---|
| `projectId` | `string` | ✓ | AIME project identifier the feedback belongs to |
| `projectsMsToken` | `string` | ✓ | Bearer token for the feedback API |
| `projectsMsBaseUrl` | `string` | ✓ | Base URL of the projects microservice |
| `filesMsApiBaseUrl` | `string` | ✓ | Base URL of the files microservice |
| `filesMsToken` | `string` | ✓ | Bearer token for image uploads |
| `fabBackground` | `string` | — | Any CSS `background` value (color, gradient). Defaults to built-in purple gradient. |
| `showFab` | `boolean` | — | Render the built-in floating action button. Set to `false` to drive the widget entirely via `useFeedback()`. Defaults to `true`. |
| `teamsUrl` | `string` | — | URL of your AIME teams app (e.g. `https://teams.aime.works`). When set, the modal header renders a "View in Teams" link that deep-links to the project's feedback inbox. |
| `userName` | `string` | — | Name of the logged-in user. Pre-fills the "Your name" field in the feedback form on open. |
| `userEmail` | `string` | — | Submitter's email from your app's session. When set, the email field is pre-filled and "Notify me when resolved" is pre-checked. |
| `notifyUsers` | `{ id: string; name: string }[] \| string` | — | Team members shown in the notification dropdown so the submitter can choose who to alert. Accepts an array or a raw env string (JSON/CSV) — parsed defensively, malformed values are ignored. Validated server-side; only actual project members receive emails. |

> **Placeholder detection** — if any required string prop starts with `__`, the widget is disabled and renders nothing. Useful for environments where tokens aren't configured yet.

---

## Opening the widget

- **Click the FAB** — bottom-left by default; drag to any corner to reposition.
- **Keyboard** — `Ctrl + Shift + F` / `Cmd + Shift + F` — captures screenshot then opens.
- **Keyboard (no screenshot)** — `Ctrl + Shift + Alt + F` / `Cmd + Shift + Alt + F` — opens immediately, skips capture.
- **Shift-click the FAB** — also skips screenshot capture.

---

## Customising the FAB

`fabBackground` accepts any CSS `background` value:

```tsx
// Solid colour
<FeedbackProvider fabBackground="#e11d48" {...rest} />

// Gradient
<FeedbackProvider fabBackground="linear-gradient(135deg, #4540E8, #7c47d8)" {...rest} />
```

> Invalid CSS values fail silently — the FAB becomes transparent. Pass a valid value.

---

## Controlling the widget programmatically

Anywhere inside `<FeedbackProvider>`, call `useFeedback()` to open or close the widget from your own UI (e.g. a custom button in your topbar, or after a user completes a flow). Pair with `showFab={false}` on the Provider if you don't want the built-in FAB at all.

```tsx
import { useFeedback } from '@aime-platform/aime-feedback-module'

function ReportBugButton() {
  const { open, isOpen, isCapturing } = useFeedback()
  return (
    <button onClick={open} disabled={isOpen || isCapturing}>
      {isCapturing ? 'Capturing…' : 'Report a bug'}
    </button>
  )
}
```

`useFeedback()` returns:

| Key | Type | Description |
|---|---|---|
| `open` | `() => void` | Triggers screenshot capture and opens the modal |
| `close` | `() => void` | Closes the modal |
| `isOpen` | `boolean` | Whether the modal is currently open |
| `isCapturing` | `boolean` | Whether a screenshot capture is in progress |

> Calling `useFeedback()` outside a `<FeedbackProvider>` throws.

---

## Annotation canvas

When the widget opens, it captures a screenshot of the current viewport and loads it into a Fabric.js annotation canvas.

| Tool | Description |
|---|---|
| Select | Move, resize, or delete objects |
| Text | Add a text label |
| Rectangle | Draw a rectangle (fill + stroke colour controls when selected) |
| Ellipse | Draw an ellipse (fill + stroke colour controls when selected) |
| Arrow | Draw a directional arrow (stroke colour when selected) |
| Line | Draw a straight line (stroke colour when selected) |
| Sticky note | Add a coloured note with a draggable tail and bold/italic formatting |
| Image | Upload an image from disk |

Objects are **automatically selected** after placement — no need to switch back to the Select tool.

A **free colour picker** appears in the toolbar. For shapes, separate fill and stroke pickers are shown when an object is selected; fill can be toggled transparent.

**Keyboard shortcuts:** `Ctrl/Cmd + Z` undo · `Ctrl/Cmd + Y` redo · `Del` delete selected.

The annotated screenshot is uploaded automatically on submit.

---

## Feedback form fields

| Field | Notes |
|---|---|
| **Title** | Required. Max 200 characters. |
| **Description** | Required. Free text. |
| **Type** | `bug` · `feature_request` · `improvement` · `question` |
| **Priority** | `low` · `medium` · `high` · `critical` (default: `medium`) |
| **Tags** | Freeform. Commit a tag with `Tab`. |

---

## FAQ

**How do I get my `projectId`?**
Open the project in the AIME platform — the one you want feedback routed to — and copy the ID from its URL. Feedback submitted through the widget is attached to that project.

**Do I need a separate "feedback project" for each app?**
No. Point `projectId` at the same project you build and deploy in — feedback lands there alongside everything else. There's no need to create a dedicated feedback project in AIME Teams.

**The FAB shows but nothing submits, or image uploads fail.**
Almost always an env-var issue. `FeedbackProvider` runs in the browser, so the tokens/URLs must use your framework's public prefix (`NEXT_PUBLIC_`, `VITE_`, `REACT_APP_`) — a bare `process.env.X` is `undefined` client-side and the calls silently fail. See [Environment variables](#environment-variables-read-this).

**Where does submitted feedback show up?**
In that project's feedback inbox in AIME Teams. Set `teamsUrl` to add a deep link to it from the widget's modal header.

**Can I trigger the widget from my own button instead of the FAB?**
Yes — set `showFab={false}` and call `open()` from the `useFeedback()` hook. See [Controlling the widget programmatically](#controlling-the-widget-programmatically).

---

## Building from source

```bash
npm run build      # outputs to dist/
npm run dev        # watch mode
npm run pack:dist  # build + pack tarball
```

---

## Publishing

```bash
npm login            # login to npmjs.com (maintainers only)
npm version patch    # bumps version + creates a git tag
npm run build
npm publish          # publishes to public npm (publishConfig.access = public)
git push --follow-tags
```

First publish of a new scope may need `npm publish --access public` explicitly.
