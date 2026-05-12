# Changelog

All notable changes to this package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.6] - 2026-05-12

### Changed
- Modal header link redesigned: "View in Teams" → **[A] AIME Teams [BADGE]** with a small AIME logo mark and an environment badge auto-derived from the `teamsUrl` hostname.
- Badge tells users which environment the feedback is going to:
  - `localhost` / `127.x` / `192.168.x` / `100.x` → **DEV** (orange)
  - hostname contains `beta` / `staging` / `dev.` → **BETA** (orange)
  - everything else → **GO** (green, production)

## [0.1.5] - 2026-05-12

### Fixed
- Modal canvas could grow unboundedly and push the form column off-screen when the parent app's CSS interacted with flex children's default `min-width: auto`. Added `min-width: 0` to the body's flex columns and made the annotation canvas's `ResizeObserver` defensive (skip sub-pixel changes and absurdly small widths) to break feedback loops.

## [0.1.4] - 2026-05-12

### Fixed
- `FeedbackProvider` was silently dropping the `teamsUrl` prop instead of forwarding it to `FeedbackWidget`. The "View in Teams" link added in 0.1.3 never rendered. Now wired correctly.

## [0.1.3] - 2026-05-12

### Added
- New `teamsUrl` prop on `FeedbackProvider`. When set, the modal header renders a "View in Teams" link deep-linking to `${teamsUrl}/projects/${projectId}/feedback`. Hidden when omitted. **Note: 0.1.3 has a prop-forwarding bug — upgrade directly to 0.1.4.**

## [0.1.2] - 2026-05-12

### Changed
- **Moved to public npmjs.org registry** as `@aime-platform/aime-feedback-module` (was `@theaimegroup/aime-feedback-module` on GitHub Packages). WebContainer's npm proxy can't reach GitHub Packages reliably, so this is necessary for in-browser previews of generated apps.
- Consumers no longer need an `.npmrc` — npm defaults to npmjs.org.

### Migration
- Replace dep `@theaimegroup/aime-feedback-module` → `@aime-platform/aime-feedback-module`.
- Remove the `@theaimegroup:registry=...` line from any `.npmrc`.

## [0.1.1] - 2026-05-11

### Changed
- (Intermediate version on GitHub Packages — superseded by 0.1.2 on npmjs.org.) Public visibility flip; README simplified.

## [0.1.0] - 2026-05-08

### Added
- `FeedbackProvider` with reactive `useFeedback()` hook exposing `{ open, close, isOpen, isCapturing }` for programmatic control from anywhere in the consumer tree.
- `showFab` prop on `FeedbackProvider` to suppress the built-in floating action button (drive entirely via `useFeedback()`).
- Bold / italic text formatting on sticky notes, with toolbar toggles that update the selected note live.
- Note background and text color pickers (visible when the note tool is active or a note is selected).
- Default yellow post-it style for new notes (`#fde68a` background, `#1a1a1a` text).
- Tail-clamping on sticky notes — tail cannot be dragged inside the bubble body, preserving the chat-bubble shape.

### Changed
- **Package renamed** from `@theaimegroup/model-feedback` to `@aime-platform/aime-feedback-module`.
- **Published to GitHub Packages** instead of distributed as a tarball.
- `FeedbackWidget` is no longer exported — `FeedbackProvider` is the only public entry point.
- `useFeedback()` now **throws** when used outside a `<FeedbackProvider>` (previously returned `null`).
- FAB now re-snaps to the nearest corner when the window is resized.
- Keybinding changed from `Shift + F` to `Ctrl + Shift + F` (`Cmd + Shift + F` on macOS) to avoid conflicts with text input.
- Edit-mode textarea for notes now matches the note's corner radius and inherits its bold/italic styling.

### Removed
- `appId` prop — accepted but never used internally. Drop it from consumer call sites.
- Drawing color picker from the annotation toolbar (per-tool colors retained internally; only the user-facing input was removed).
- Undo / Redo toolbar buttons (keyboard shortcuts `Ctrl+Z` / `Ctrl+Y` still work).
