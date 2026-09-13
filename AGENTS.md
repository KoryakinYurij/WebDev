# AGENTS.md

## Scope
This repository contains web experiments/projects. Work inside the target project directory; do not stage a Windows project on the VPS just to edit it.

## Read first
For `Test 1`, read:
- `Test 1/README.md`
- `Test 1/docs/DESIGN-CODEX.md`
- `Test 1/docs/WEB-DESIGN-KNOWLEDGE.md`
- `Test 1/docs/WORKLOG.md`

## Working rules
- Prefer direct Desktop Commander access to Windows device `Mrnal`.
- Keep source-of-truth data in its canonical file; generated files are never hand-edited.
- Prefer platform/native CSS first, then WAAPI/Motion, then GSAP only when complexity justifies it.
- Treat discovery/awesome lists as leads, not architecture authority.
- Do not expand Three/WebGL without an explicit product reason, fallback, reduced-motion path, and performance budget.
- Make the change first, then run the smallest useful verification; avoid repeated full-project audits.
- For `Test 1`, `npm run check` is the final automated gate when available.
- Automated checks complement visual judgment; they do not replace it.

## Worklog
After a meaningful completed block, append 1–4 short lines to `Test 1/docs/WORKLOG.md`: what changed and why. Do not log routine file reads or command noise.
