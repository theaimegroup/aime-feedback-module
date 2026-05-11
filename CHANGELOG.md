# Changelog

All notable changes to this package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-05-08

### Added
- `FeedbackProvider` with reactive `useFeedback()` hook exposing `{ open, close, isOpen, isCapturing }` for programmatic control from anywhere in the consumer tree.
- `showFab` prop on `FeedbackProvider` to suppress the built-in floating action button (drive entirely via `useFeedback()`).
- Bold / italic text formatting on sticky notes, with toolbar toggles that update the selected note live.
- Note background and text color pickers (visible when the note tool is active or a note is selected).
- Default yellow post-it style for new notes (`#fde68a` background, `#1a1a1a` text).
- Tail-clamping on sticky notes — tail cannot be dragged inside the bubble body, preserving the chat-bubble shape.

### Changed
- **Package renamed** from `@theaimegroup/model-feedback` to `@theaimegroup/aime-feedback-module`.
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
