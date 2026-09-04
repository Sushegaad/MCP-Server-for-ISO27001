# ARD well-known site files

These files belong in a **separate repository**: `Sushegaad/sushegaad.github.io` (a GitHub Pages *user site*, which serves at the domain root — a project site cannot).

Once pushed there, they serve:

- `https://sushegaad.github.io/.well-known/ard.json` — the primary ARD discovery path every conformant consumer fetches (ARD spec §5.1)
- `https://sushegaad.github.io/robots.txt` — carries the `Agentmap:` directive pointing crawlers at the manifest

## One-time setup

```bash
# Create the user-site repo on GitHub: Sushegaad/sushegaad.github.io (public)
git clone https://github.com/Sushegaad/sushegaad.github.io.git
cp -r wellknown-site/.well-known wellknown-site/robots.txt wellknown-site/.nojekyll sushegaad.github.io/
cd sushegaad.github.io
git add -A && git commit -m "ARD discovery: .well-known/ard.json + Agentmap" && git push
```

> **`.nojekyll` is required.** GitHub Pages runs Jekyll by default, and Jekyll excludes
> dot-directories — without `.nojekyll` at the repo root, `.well-known/` is silently
> dropped from the published site and the manifest 404s.

GitHub Pages for a `<user>.github.io` repo deploys automatically from `main` — no settings needed. Verify with:

```bash
curl -s https://sushegaad.github.io/.well-known/ard.json | head -5
```

## Keeping it in sync

`scripts/generate-ard.ts` (run automatically by `npm run build`) regenerates `wellknown-site/.well-known/ard.json` alongside `docs/ard.json` from the same sources. After each release, copy the refreshed file into the user-site repo and push. The release checklist in the threat model includes this step.

If the user-site repo is never created, discovery still works: the `<link rel="ard">` tag and in-page JSON-LD on the demo page are fully conformant mechanisms on their own.
