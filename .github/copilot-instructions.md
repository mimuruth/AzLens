# AzLens — Copilot instructions

AzLens is a TypeScript monorepo: **seven MCP servers** plus a **Next.js 14 chat UI**,
deployable to Azure Container Apps. Keep changes minimal and idiomatic; only do what's asked.

## Layout & ports

- MCP servers (each is `mcp-*/` or `AzLens-mcp/`): `local-coder` :3001, `AzLens-mcp` :3002,
  `personal-assistant` :3003, `github` :3004, `azure-cost` :3005, `knowledge` :3006, `postgres` :3007.
- `chat-ui/` — Next.js App Router, dev server on :3000.
- Each server's logic lives once in `src/server.ts`, reused by `src/index.ts` (stdio) and `src/http.ts` (HTTP).

## Validate before every commit

From `chat-ui/` (most changes are here):

```powershell
npx tsc --noEmit        # type-check (do NOT run `next build` while the dev server is running)
npm test                # Vitest unit tests (lib/__tests__/*.test.ts)
npx playwright test     # E2E (tests/e2e/*.spec.ts)
```

For an MCP server, type-check with `npx tsc --noEmit` in that package.

- Vitest config: include `lib/**/*.test.ts`, exclude `tests/e2e/**` (Playwright specs must not be picked up by Vitest).
- E2E that touch MCP tools should stub `/api/tool` with `page.route` so no live server is needed.

## Commit & push

Always set the identity inline (do not rely on global config):

```powershell
git -c user.name="mimuruth" -c user.email="mimuruth@users.noreply.github.com" commit -m "..."
git push origin main
```

- `git push` may print a red PowerShell `NativeCommandError` yet still succeed — confirm with
  `main -> main` and a clean `git status` (`## main...origin/main`, not "ahead").
- On Windows, `LF will be replaced by CRLF` warnings on staging are expected and harmless.

## Gotchas

- `build/` and `.next/` are gitignored — never commit them.
- After adding a dependency while the dev server is running, the Next dev server caches the old
  resolution: kill :3000, `Remove-Item -Recurse -Force chat-ui/.next`, then restart `npm run dev`.
- `highlight.js` must remain a **direct** dependency of `chat-ui` (else Next throws a 500 resolving
  `highlight.js/lib/languages/...`).
- Cosmos: projects and conversations share one container; projects are tagged `docType: "project"`
  and conversation queries exclude them. `order` is a reserved word — select it as `c["order"]`.
- Prettier reflows multi-line edits; re-read a file before follow-up edits if a match fails.

## Regenerating docs assets

- UI screenshots (`docs/chat-ui-*.png`): run `node scripts/capture-shots.mjs` from `chat-ui/` with the
  dev server running (seeds demo state via localStorage — no model key needed).
- README banner (`docs/banner.png`): edit `chat-ui/scripts/banner.html`, then `node scripts/render-banner.mjs`.

## Style

- Strict TypeScript across servers and UI. Don't add comments/docstrings to code you didn't change.
- Don't add features, refactors, or error handling beyond what's requested.
