# @theaimegroup/aime-feedback-module

In-app feedback widget for AIME model previews. Captures a screenshot, lets users annotate it, then submits structured feedback to the AIME platform.

---

## Installation

Published as a **public** package on GitHub Packages. No auth, no `.npmrc` required — just install.

### 1. Point your scope at GitHub Packages (one-time per project)

Add to `.npmrc` at your project root:

```ini
@theaimegroup:registry=https://npm.pkg.github.com
```

That's it — no token needed for installs.

### 2. Install

```bash
npm install @theaimegroup/aime-feedback-module
```

Peer dependencies (must already be in your project):

```bash
npm install react react-dom
```

---

## Quick start

Wrap your app with `FeedbackProvider`. It mounts the FAB and wires up context.

```tsx
import { FeedbackProvider } from '@theaimegroup/aime-feedback-module'

export default function App() {
  return (
    <FeedbackProvider
      projectId="your-aime-project-id"
      projectsMsToken={process.env.PROJECTS_MS_TOKEN!}
      projectsMsBaseUrl={process.env.PROJECTS_MS_URL!}
      filesMsApiBaseUrl={process.env.FILES_MS_URL!}
      filesMsToken={process.env.FILES_MS_TOKEN!}
    >
      <YourApp />
    </FeedbackProvider>
  )
}
```

A floating action button appears in the bottom-left corner. Drag it to any corner — position persists in `localStorage`.

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
| `userName` | `string` | — | Display name attached to comments on annotated screenshots |

> **Placeholder detection** — if any required string prop starts with `__`, the widget is disabled and renders nothing. Useful for environments where tokens aren't configured yet.

---

## Opening the widget

- **Click the FAB** — bottom-left by default; drag to any corner to reposition.
- **Keyboard** — `Ctrl + Shift + F` (Windows/Linux) or `Cmd + Shift + F` (macOS).

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
import { useFeedback } from '@theaimegroup/aime-feedback-module'

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
| Rectangle | Draw a rectangle |
| Ellipse | Draw an ellipse |
| Arrow | Draw a directional arrow |
| Sticky note | Add a coloured note with a draggable tail and bold/italic formatting |
| Image | Upload an image from disk |

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

## Building from source

```bash
npm run build      # outputs to dist/
npm run dev        # watch mode
npm run pack:dist  # build + pack tarball
```

---

## Publishing

```bash
npm version patch    # bumps version + creates a git tag
npm run build
npm publish          # publishes to GitHub Packages (uses publishConfig from package.json)
git push --follow-tags
```

**Auth for publishing only:** maintainers need `GITHUB_TOKEN` in their environment (PAT with `write:packages` scope). Set it via a local `.npmrc` like:

```ini
@theaimegroup:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

(Gitignore this file; consumers don't need it — installs are public.)
