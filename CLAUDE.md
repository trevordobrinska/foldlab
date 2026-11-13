# FoldLab

A paperless origami practice app for one child on an iPad. A Game in the Dobrinska Arcade, published at `https://trevordobrinska.github.io/foldlab/`.

`DESIGN.md` is the design, `GLOSSARY.md` the vocabulary, `docs/adr/` the hard-to-reverse decisions.

**Follow the suite rules:** https://github.com/trevordobrinska/trevordobrinska.github.io/blob/main/SUITE-RULES.md (locally `..\arcade\SUITE-RULES.md`). The Game shares one browser origin with the Arcade and every other Game. This starter already meets them; keep it that way:

- Relative URLs only (Vite `base: "./"`, `./` paths in `index.html`).
- Save data only through `src/storage.ts`, which starts every name with `foldlab`.
- Keep the house button in `index.html` linking to `/`.
- No manifest, no service worker, nothing that asks to be installed.
- Replace the placeholder `public/icon-512.png` with real 512×512 Tile art before asking for a Ready check.

## Code

Vite + TypeScript. `npm install`, then `npm run dev` to view locally, `npm run build` to check it builds. Every push to `main` deploys to GitHub Pages (`.github/workflows/deploy.yml`).

## Private Sources

Sources (diagram images, PDFs, book photos) never enter git or the build (ADR 0002). They live in `import/inbox/` and `import/work/`, which are gitignored.

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), as `Status:` lines. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
