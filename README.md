# @theaimegroup/model-feedback

In-app feedback widget for AIME model previews. Captures a screenshot, lets users annotate it, then submits structured feedback to the AIME platform.

---

## Installation

The package is distributed as a tarball. Install it locally:

```bash
npm install ./theaimegroup-model-feedback-0.1.0.tgz
```

Peer dependencies (must already be in your project):

```bash
npm install react react-dom
```

---

## Quick start

Wrap your app with `FeedbackProvider`. It mounts the FAB and wires up context.

```tsx
import { FeedbackProvider } from '@theaimegroup/model-feedback'

export default function App() {
  return (
    <FeedbackProvider
      projectId="your-project-id"
      appId="your-app-id"
      projectsMsToken="your-feedback-token"
      projectsMsBaseUrl="https://api.example.com"
      filesMsApiBaseUrl="https://files.example.com"
      filesMsToken="your-files-token"
    >
      <YourApp />
    </FeedbackProvider>
  )
}
```

That's it — a floating action button appears in the bottom-left corner.

---

## Props

### `FeedbackProvider` / `FeedbackWidget`

| Prop | Type | Required | Description |
|---|---|---|---|
| `projectId` | `string` | ✓ | AIME project identifier |
| `appId` | `string` | ✓ | App identifier |
| `projectsMsToken` | `string` | ✓ | Auth token for the feedback API |
| `projectsMsBaseUrl` | `string` | ✓ | Base URL of the feedback microservice |
| `filesMsApiBaseUrl` | `string` | ✓ | Base URL of the file upload microservice |
| `filesMsToken` | `string` | ✓ | Auth token for file uploads |
| `fabBackground` | `string` | — | Any valid CSS `background` value (solid colour, gradient). Defaults to the built-in purple gradient. |

> **Placeholder detection** — if any of the required string props starts with `__`, the widget is disabled and renders nothing. Useful for environments where tokens haven't been configured yet.

---

## Customising the FAB

`fabBackground` accepts any CSS `background` value:

```tsx
// Solid colour
<FeedbackProvider fabBackground="#e11d48" .../>

// Gradient
<FeedbackProvider fabBackground="linear-gradient(135deg, #f97316, #eab308)" .../>

// Default (omit the prop)
<FeedbackProvider .../>
```

> Invalid CSS values fail silently — the FAB becomes transparent rather than throwing. Pass a valid value.

---

## Opening the widget

**Click the FAB** — bottom-left by default. Drag it to any corner; position is saved to `localStorage`.

**Keyboard shortcut** — `Shift + F` opens the widget from anywhere on the page.

---

## Annotation canvas

When the widget opens it captures a screenshot of the current viewport and loads it into an annotation canvas. Available tools:

| Tool | Description |
|---|---|
| Select | Move, resize, or delete objects |
| Text | Add a text label |
| Rectangle | Draw a rectangle |
| Ellipse | Draw an ellipse |
| Arrow | Draw a directional arrow |
| Sticky note | Add a colour-coded note |
| Image | Upload an image from disk |

The annotated screenshot is uploaded automatically on submit.

---

## Feedback form fields

| Field | Notes |
|---|---|
| **Title** | Required. Max 200 characters. |
| **Description** | Optional free text. |
| **Type** | `bug` · `feature_request` · `improvement` · `question` |
| **Priority** | `low` · `medium` · `high` · `critical` (default: `medium`) |
| **Tags** | Freeform. Commit a tag with `Enter` or `Space`. |

---

## Using `FeedbackWidget` directly

If you don't want the context provider, use `FeedbackWidget` on its own — it takes the same props minus `children`.

```tsx
import { FeedbackWidget } from '@theaimegroup/model-feedback'

<FeedbackWidget
  projectId="..."
  appId="..."
  projectsMsToken="..."
  projectsMsBaseUrl="..."
  filesMsApiBaseUrl="..."
  filesMsToken="..."
/>
```

---

## Building from source

```bash
npm run build      # outputs to dist/
npm run dev        # watch mode
npm run pack:dist  # build + pack tarball
```
