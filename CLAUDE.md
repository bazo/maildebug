# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

`maildebug` is a self-contained SMTP debugging server (Mailcatcher/Mailhog-style). A Go binary runs both an SMTP server (default `:1025`) that captures inbound mail and an HTTP API (default `:8100`) that serves a React UI for browsing the captured messages. The compiled UI is embedded into the Go binary at build time via `//go:embed ui/dist`, so production is a single static binary.

## Common commands

Tasks are driven by [Taskfile](https://taskfile.dev) (`task <name>`) plus per-component Bun/Go tooling. `Taskfile.yml` auto-loads `maildebug.env` and `.env`.

- `task server` — run the Go server with hot reload via `air` (config in `.air.toml`, builds to `tmp/main`).
- `task client` — run the Vite dev server for the React UI (in `ui/`, default port 5173). The UI fetches from the Go API on `:8100`.
- `task client:build` — build the UI into `ui/dist/` (must exist before `go build`, since main.go embeds it).
- `task format` — run `oxfmt` across JS/TS/JSON.
- `task test -- <recipient>` — send a sample email through the local SMTP server using `email-test/send.tsx` (passes `--email <recipient>`; templates live in `email-test/emails/`).
- `task docker:build` / `task docker:push` — build (or buildx-push multi-arch) the Docker image. `task docker:buildx` ensures the builder exists.

Lower-level commands when not using Task:
- Go: `go build ./...`, `go vet ./...`, `gofmt -l <files>`. Run `task client:build` first or builds will fail to embed `ui/dist`.
- UI: from `ui/`, `bun dev`, `bun run build` (runs `tsc -b && vite build`), `bunx tsc -b --noEmit` for type-checking only.
- Lint/format JS/TS: `bun run lint` (oxlint), `bun run format` (oxfmt).

Git hooks are managed by `lefthook` (installed via the `postinstall` script). `pre-commit` runs oxfmt/oxlint, `tsc --noEmit` in `ui/`, `gofmt`, `go vet`, and `go build`. `pre-push` re-runs tsc and `go build`. Don't bypass these without reason — `go build` here is what catches missing `ui/dist`.

## Architecture

Top-level `main.go` wires everything together:

1. **Config** — `loadConfig()` reads env vars prefixed `MAILDEBUG_` from a layered set of dotenv files (`maildebug.env.<env>.local` → `maildebug.env.local` → `maildebug.env.<env>` → `maildebug.env`, then `.env*` equivalents). godotenv does *not* overwrite existing vars, so the order in `envFiles` is significant — earlier files have higher priority. All config lands in `types.Config`.
2. **Storage** (`storage/`) — `storm` ORM over `bbolt` (`go.etcd.io/bbolt`). The DB file lives at `data/<DB_NAME>` (default `data/mail.bolt`). `MailData` is the only registered model; `Date` is indexed. Raw RFC 822 message bytes are written separately to `data/messages/<id>` so they can be re-served if needed.
3. **SMTP server** (`session/`) — built on `github.com/emersion/go-smtp`. `session.Backend` authenticates via `AuthPlain` against the configured username/password and parses incoming mail in `session.Data`:
   - Headers are decoded via `mime.WordDecoder` (handles RFC 2047 encoded subjects/from).
   - Multipart bodies are walked recursively in `parseParts`; non-multipart bodies go through `parsePart`.
   - Each part is either a `PartData` (rendered in the UI) or an `Attachment` (downloadable). `decodePart` handles `base64` and `quoted-printable` transfer encodings.
   - The `id` stored in Storm is the local-part of the `Message-Id` header — the API's attachment route looks messages up by this id.
   - On success the `dataCallback` (defined in `main.go`) writes the raw bytes to disk and persists the parsed `MailData`.
4. **HTTP API** (`api/`) — `bunrouter` with `reqlog` middleware. Endpoints:
   - `GET /messages?page=&maxPerPage=` — paginated list (default 50/page, computes `pagesCount`).
   - `GET /messages/:id/attachments/:index` — base64-decodes the attachment from the stored `MailData` and streams it with the original filename/media type.
   - `DELETE /messages` — wipe.
   - All responses go through `createResponse`/`createErrorResponse` which set permissive CORS (`*`).
   - `OPTIONS /*p` returns `200` with `Access-Control-Allow-*: *` for CORS preflight.
5. **Static UI** — `embed.FS` over `ui/dist`. The router serves `/` and `/assets/*` from the embedded FS. There is no SPA fallback; new top-level UI routes need explicit handlers.
6. **Lifecycle** — SMTP runs in a goroutine (`listenSmtp`), HTTP runs on the main goroutine. There's no graceful shutdown; both are blocking calls.

### UI

`ui/` is a Vite + React 19 + TanStack Query + Tailwind v4 app. The `@/` alias points to `ui/src`. `react-letter` renders message HTML, `react-headless-pagination` drives the paginator. Components are flat under `ui/src/` (`app.tsx`, `message-preview.tsx`, etc.). When developing, run the Go server on `:8100` and Vite on `:5173` — the UI calls the Go API directly with permissive CORS.

### email-test harness

`email-test/` is an isolated Bun workspace (not part of the root workspaces) using `react-email` templates. `send.tsx` renders a template (`notion`/`plaid`/`stripe`/`vercel`) and sends it to the local SMTP via `nodemailer`. Connection settings come from env vars validated by zod; defaults match `maildebug.env.example`.

## Conventions worth knowing

- Go module path is bare `maildebug` (not a domain). All internal packages import as `maildebug/<pkg>`.
- The Docker build is two-stage (bun → golang → scratch) and runs `upx` on the binary; the final image is `FROM scratch` and only contains `./maildebug` — no shell, no certs.
- `tmp/`, `data/`, `node_modules/`, `ui/dist/` are build/runtime artifacts. `air` watches everything except those plus `email-test/`, `.github/`, `.vscode/`.
