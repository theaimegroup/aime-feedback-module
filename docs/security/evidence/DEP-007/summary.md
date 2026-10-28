# DEP-007 - form-data multipart metadata/boundary fix

Validated 2026-10-28 on Node22.19.0/npm10.9.3, macOS arm64.
Repository: `aime-feedback-module`. Baseline HEAD: `54ff8fb312eb584ef991ce0be179d5aebbad9df7`.

All physical form-data copies now resolve4.0.6. Current public registry metadata
and vendor advisories GHSA-hmw2-7cc7-3qxx / GHSA-fjxv-7rqg-78g4 were checked.
The new version requires hasown^2.0.4 and es-set-tostringtag^2.1.0, explaining
its reviewed helper-chain lock changes. Direct declarations changed only in
Core/Projects; transitive consumers did not gain artificial direct dependencies.

The focused regression was red on the original artifact (normal uploads still
passed; hostile metadata and/or predictable-boundary checks failed). It passes
on the clean installed4.0.6 artifact: real local HTTP receiver, unchanged binary
bytes/text, quote/CR/LF/boundary-like field/filename escaping and actual delegation
to crypto.randomBytes with Math.random forced to throw in a bounded child process.
This does not infer secure randomness merely from observing distinct boundaries.

Commands/exits, package graph changes and remaining audit counts are captured in
validation.json. Clean npm ci, focused tests, applicable existing regression suite
and npm run build all passed in a disposable checkout. Manifest/lock hashes did
not change during install/build. Native browser downloads were disabled because
the relevant browser boundary is mocked; no real-browser or deployed pass is
claimed. Frontend builds use synthetic URL/secret environment fixtures.

Full and production audits ran successfully as scans (exit1 means other known
findings remain). Neither reports a form-data vulnerability. Raw results and
installed package-path inventory are adjacent. Other dependency findings stay
open; an audit/build pass alone is not app or production exploitation evidence.

A clean build first exposed an existing incomplete Rollup optional-platform lock.
Used npm's resolver to hydrate its26 published optional binary descriptors,
then removed temporary root optional declarations and re-resolved. Rollup stays
4.60.3; no native integrity fields were hand-edited. The reviewed lock now records
all platform binaries and npm ci + tsup passed. Root lock version metadata was
also corrected from0.3.4 to the existing manifest0.3.5, without a package release.

## Remaining report acceptance

Verify the released/deployed graph/SBOM and any applicable scoped staging upload
path against these same reviewed bytes. No Git push, package publication,
production deployment or live customer/provider test occurred. Existing working
node_modules were preserved; clean validation used the committed dependency
specifications in disposable checkouts.
