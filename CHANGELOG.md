# Changelog

## 0.3.0 — 2026-09-05

- Add `discoverJobBoards`, `readJobBoard` and `toJobPosting`, a fully English,
  backward-compatible public API.
- Keep `discoverBoards` and `readBoard` unchanged for existing integrations.
- Add offline representative fixtures for all 12 providers and explicit result
  contract tests.
- Test Node 22 and 24 in GitHub Actions and verify the npm package contents.
- Require Node 22+, replacing direct TypeScript execution with `tsx`.
- Add contribution guidance, issue forms and private security reporting.

## 0.2.1 — 2026-09-04

- Parse relative Workday posting dates on German and English career sites.
- Keep ambiguous “30+ days” dates empty instead of inventing a day.
