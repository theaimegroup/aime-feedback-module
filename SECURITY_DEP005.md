# DEP-005 Fabric and Feedback artifact

The 0.3.6 source candidate uses Fabric 7.4.0, replacing the Fabric 5.5.2 chain affected by GHSA-hfvx-25r5-qc3w and GHSA-w22m-hvvm-xmwx. Registry history was checked on 2026-10-29: latest published Feedback was 0.3.5 and 0.3.6 was unused. This work builds and packs a local artifact; no npm publication is required or performed.

`NoteBubble` is a registered ES class with inherited Promise-based deserialization and explicit custom properties. Annotation constructors retain top/left anchors. Images, history loading and disposal use the Fabric 7 APIs; asynchronous work is cancelled on replacement/unmount. History stores finished shapes and excludes the screenshot. The renderer exports PNG and note comments; this package has no active SVG-export UI.

Run on Node 22.19 (supported range Node >=20):

```sh
npm ci
npm run build
npm run test:security:fabric
npm run pack:dist
```

The browser script uses real source, Fabric, DOM/canvas, FileReader, ResizeObserver and Chrome. Only its Canvas observation wrapper records instances; drawing and history remain the real implementation. Baseline fixtures came from the unchanged Fabric 5 component at source commit `3e6323088e21a9e433b15cf1c60edbc93c84808a`, captured using Chrome 156.0.8078.48 on macOS with the existing system fonts. Exact PNG/text-metric comparison is scoped to that environment; other OS/font/browser environments need their own baseline review. Set `DEP_EDITOR_CHROME_PATH` to a compatible executable when required.

Checks cover all five drawing tools, image background/PNG/comment output, finished-shape undo/redo, clear/history stacking, note edit/bold/italic/font size/tail dragging, malformed uploaded image recovery, a valid local upload, resizing, malformed screenshot replacement, canvas disposal and key-listener cleanup. Four consumer harnesses additionally import the packed public `FeedbackProvider`, capture their owned page, draw annotations and submit PNG plus note comments to loopback fake endpoints using each host's installed React. Those fixtures do not establish authenticated host-route, real API persistence, deployment or cross-browser acceptance.

For reproducible consumer installs before any registry release, each host checks in the identical reviewed tarball under `vendor/` and uses a relative `file:vendor/...tgz` dependency. Its provenance record must include this publisher's committed source SHA, Node/npm versions, exact tarball SHA256/SHA512, and packed file hashes. Review `npm pack --json` contents and inspect both JS entry points, both declarations and manifest. No `.npmrc`, token, node_modules or workspace path belongs in the artifact. Rebuild from the recorded source commit with `npm ci && npm run pack:dist` and compare bytes; future publisher releases must deliberately replace and retest the artifact across hosts. Reverse consumer adoption before changing/removing their supplier artifact during rollback.
