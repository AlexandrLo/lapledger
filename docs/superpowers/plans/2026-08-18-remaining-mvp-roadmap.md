# Remaining MVP Implementation Roadmap

The approved design spans several independently testable subsystems. Implement
it through these plans in order:

1. `2026-08-18-visual-system-and-widget-workspace.md`
2. `2026-08-18-analysis-coordination.md`
3. `2026-08-18-track-map.md`
4. `2026-08-18-persistence-and-cache.md`
5. `2026-08-18-browser-hardening.md`

Each plan ends in a working checkpoint and a full `make check`, `make test`, and
`make build`. Do not begin a later plan until the previous plan is merged into
the working branch. The five plans together cover
`docs/superpowers/specs/2026-08-18-remaining-mvp-design.md`.

| Design sections | Owning plan |
|---|---|
| §5 architecture, §6 visual system, §7 shell, §8 workspace | Visual system and widget workspace |
| §9 basis/cursor/zoom and analytical parts of §8 | Analysis coordination |
| §10 track map | Track map |
| §11 persistence and §12 caching | Persistence and cache |
| §13 remaining errors, §14 testing, §15 definition of done | Browser hardening, with regression work in every preceding plan |

The branch remains `feat/remaining-mvp`. Commit after every task named in the
plans; do not squash the task commits while implementation is in progress.

Before the browser-hardening plan begins, the project owner must supply the
independent MoTeC i2 flag-channel observations described in that plan. MoTeC i2
is an external application unavailable in this repository; implementation must
not fabricate those expected values from LapLedger's own decoder.
