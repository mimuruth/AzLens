# AGENTS.md

Guidance for AI coding agents working in this repository.

**The canonical instructions live in [.github/copilot-instructions.md](.github/copilot-instructions.md) — read that first.**

AzLens is a TypeScript monorepo: seven MCP servers (`mcp-*/`, `AzLens-mcp/`, ports :3001–:3007)
plus a Next.js 14 chat UI (`chat-ui/`, :3000). Keep changes minimal and idiomatic.

## Validate before every commit (from `chat-ui/`)

```powershell
npx tsc --noEmit        # type-check — do NOT run `next build` while the dev server is running
npm test                # Vitest unit tests (lib/__tests__/*.test.ts)
npx playwright test     # E2E (tests/e2e/*.spec.ts)
```

## Commit & push

```powershell
git -c user.name="mimuruth" -c user.email="mimuruth@users.noreply.github.com" commit -m "..."
git push origin main
```

`git push` may print a red PowerShell `NativeCommandError` yet still succeed — confirm `main -> main`.

See [.github/copilot-instructions.md](.github/copilot-instructions.md) for the full layout, gotchas,
Cosmos conventions, and docs-asset regeneration steps.
