# Project Index: maildebug

Generated: 2026-04-30

Self-contained SMTP debugging server (Mailcatcher/Mailhog-style). A Go binary runs both an SMTP server (default `:1025`) that captures inbound mail and an HTTP API (default `:8100`) serving a React UI for browsing messages. The compiled UI is embedded into the Go binary via `//go:embed ui/dist`.

## 📁 Project Structure

```
maildebug/
├── main.go              Entry point; wires SMTP + HTTP + UI embed
├── api/                 HTTP handlers (bunrouter)
├── session/             SMTP session + MIME parsing (emersion/go-smtp)
├── storage/             Storm/bbolt persistence
├── types/               Shared Go structs (Config, MailData, …)
├── ui/                  Vite + React 19 + Tailwind v4 frontend
│   └── src/
├── email-test/          Bun harness for sending sample emails
├── data/                Runtime: bbolt DB + raw RFC 822 message bytes
├── Taskfile.yml         Task runner entrypoints
├── lefthook.yml         Git hooks (fmt/lint/vet/build)
├── Dockerfile           bun → golang → scratch (upx-stripped)
└── .air.toml            Hot reload config for `task server`
```

## 🚀 Entry Points

- **Binary**: `main.go` — loads env, opens storage, starts SMTP goroutine + HTTP server.
- **CLI run**: `task server` (Go via air), `task client` (Vite dev), `task test -- <email>` (send sample).
- **HTTP API**: `:8100` (env `MAILDEBUG_API_PORT`).
- **SMTP**: `:1025` (env `MAILDEBUG_SMTP_PORT`).
- **UI dev server**: `ui/` Vite on `:5173`, calls API directly with permissive CORS.

## 📦 Core Modules

### main (`main.go`)
- `loadConfig()` — layered dotenv (`maildebug.env.<env>.local` → … → `.env`); env vars prefixed `MAILDEBUG_`.
- `main()` — opens Storage, builds SMTP server with session.Backend, mounts bunrouter, embeds `ui/dist`, runs SMTP in goroutine.
- `listenSmtp(s)` — blocking SMTP listener.

### api (`api/`)
- `api.go`: `Api` struct, `NewApi(storage)`, `createResponse`, `createErrorResponse` (sets CORS `*`).
- `handlers.go`:
  - `LoadMessagesHandler` — `GET /messages?page=&maxPerPage=` (default 50/page, computes pagesCount).
  - `LoadMessagesAttachment` — `GET /messages/:id/attachments/:index` (base64 → stream with original filename/media type).
  - `DeleteMessagesHandler` — `DELETE /messages` (drops Storm bucket).

### session (`session/session.go`)
- `Backend` (implements `smtp.Backend`) — auth via `AuthPlain` against configured user/pass.
- `session.Data(r)` — parses RFC 822 message; decodes RFC 2047 headers via `mime.WordDecoder`.
- `parseParts` — recursive multipart walker; splits `PartData` vs `Attachment` by `Content-Disposition`.
- `parsePart` — non-multipart body parsing.
- `decodePart` — handles `base64` and `quoted-printable` transfer encodings.
- ID convention: stored `id` = local-part of `Message-Id` header.

### storage (`storage/`)
- `storage.go`: `Storage` wraps `storm.DB` over `bbolt`. `Init(dbName)` creates `data/`, opens `data/<dbName>`, registers `MailData`.
- `saveMessage.go`: `SaveMessage(*MailData)` — normalizes nil attachments.
- `loadMessages.go`: `LoadMessages(page, limit)` — counts via bolt, paginates via Storm `Select().Reverse().OrderBy("Date")`, strips attachment `Data` for list response.
- `loadMessageAttachment.go`: `LoadMessage(id)` — `One("Id", id)`.
- `deleteMessages.go`: `DeleteMessages()` — `db.Drop(&MailData{})`.

### types (`types/types.go`)
- `Config` — all server config (ports, creds, timeouts, SMTP limits).
- `MailData` (Storm model) — `Id` (storm:"id"), `Date` (storm:"index"), Parts, Attachments, RawHeaders.
- `PartData`, `Attachment`, `ApiResponse`.

### ui (`ui/src/`)
- `main.tsx` — bootstraps React 19 + TanStack Query.
- `app.tsx` — top-level layout, message list, pagination (`react-headless-pagination`).
- `message-preview.tsx` — renders selected message via `react-letter`.
- `types.ts` — TS mirror of Go `MailData` (`Message`, `Part`, `Attachment`, `MessagesResponse`).
- `helpers.ts` — `classNames`, `formatDate` (locale via `VITE_LOCALE`, default `sk-SK`).

### email-test (`email-test/`)
- Isolated Bun workspace (not in root workspaces). Uses `react-email` + `nodemailer`.
- `send.tsx` — `--email <to> [--template notion|plaid|stripe|vercel]`, env validated via zod.
- `emails/*.tsx` — react-email templates.

## 🔧 Configuration

- `Taskfile.yml` — task runner (auto-loads `maildebug.env`, `.env`).
- `maildebug.env` / `maildebug.env.example` — runtime config (SMTP + API ports, creds, DB name, timeouts, limits).
- `.air.toml` — hot reload for Go server; excludes `tmp`, `ui`, `node_modules`, `.github`, `.vscode`, `email-test`.
- `lefthook.yml` — pre-commit (oxfmt, oxlint, tsc, gofmt, go vet, go build) + pre-push (tsc, go build).
- `.oxfmtrc.json`, `.oxlintrc.json` — JS/TS formatter/linter config.
- `package.json` (root) — Bun workspaces (`ui` only); installs lefthook on postinstall.
- `ui/vite.config.ts` — plugins: tailwindcss v4, react, devtoolsJson; alias `@` → `ui/src`.
- `Dockerfile` — multi-stage: `oven/bun:alpine` builds UI → `golang:alpine` builds binary (CGO off, upx) → `scratch` final image.
- `go.mod` — module `maildebug` (bare path), Go 1.25.

## 📚 Documentation

- `CLAUDE.md` — Claude Code guidance (architecture, commands, conventions).
- `email-test/readme.md` — minimal react-email starter blurb.

## 🧪 Test Coverage

- No `*_test.go` or JS test suites present.
- `email-test/` is an integration/dev harness for manually sending mail to the local SMTP server.
- Verification gates run via lefthook hooks (build + vet + tsc), not unit tests.

## 🔗 Key Dependencies

### Go (`go.mod`)
- `github.com/emersion/go-smtp` v0.24.0 — SMTP server framework.
- `github.com/asdine/storm` v2.1.2 — ORM over bbolt.
- `go.etcd.io/bbolt` v1.4.3 — embedded KV store.
- `github.com/uptrace/bunrouter` v1.0.23 (+ `extra/reqlog`) — HTTP router with request logging.
- `github.com/joho/godotenv` v1.5.1 — dotenv layered loading.

### UI (`ui/package.json`)
- `react` 19, `react-dom` 19.
- `@tanstack/react-query` 5 — server state.
- `tailwindcss` 4 + `@tailwindcss/vite`.
- `react-letter` — safe HTML email rendering.
- `react-headless-pagination` — pagination primitives.
- `@headlessui/react`, `@heroicons/react`.
- `vite` 8, `typescript` 6.

### Tooling (root `package.json`)
- `oxlint` 1.62, `oxfmt` 0.47 — JS/TS lint+format.
- `lefthook` 2.1 — git hooks.

### email-test
- `react-email` 6, `nodemailer` 8, `zod` 4, `bun-types`.

## 📝 Quick Start

1. **Setup**: `bun install` (root) — installs UI deps + lefthook hooks. Optionally copy `maildebug.env.example` → `maildebug.env`.
2. **Build UI for embed**: `task client:build` (required before `go build` since `main.go` embeds `ui/dist`).
3. **Run server**: `task server` (uses air; rebuilds on Go file change). Open `http://localhost:8100`.
4. **UI dev mode**: in another shell, `task client` (Vite on `:5173`, talks to API on `:8100`).
5. **Send a test email**: `task test -- you@example.com` (uses `email-test/send.tsx`, defaults to `notion` template).
6. **Docker**: `task docker:build` (local arch) or `task docker:push` (multi-arch via buildx).

## 🔌 API Surface (HTTP)

| Method | Path                                     | Returns                                |
|--------|------------------------------------------|----------------------------------------|
| GET    | `/`                                      | Embedded UI `index.html`               |
| GET    | `/assets/*path`                          | Embedded UI assets                     |
| GET    | `/messages?page=&maxPerPage=`            | `ApiResponse{page, pagesCount, messages}` (attachments without `data`) |
| GET    | `/messages/:id/attachments/:index`       | Raw attachment stream (Content-Disposition: attachment) |
| DELETE | `/messages`                              | `ApiResponse{}` (drops all)            |
| OPTIONS| `/*`                                     | 200 + CORS `*` (preflight)             |
| GET    | `/.well-known/appspecific/com.chrome.devtools.json` | 204 (silenced)              |

## ⚙️ Conventions / Gotchas

- Go module path is bare `maildebug` — internal imports are `maildebug/<pkg>`.
- `ui/dist` must exist before `go build` (embed). lefthook's `gobuild` hook will catch missing builds.
- godotenv does *not* overwrite existing env vars; `loadConfig`'s file order encodes priority.
- No graceful shutdown; both SMTP and HTTP block to exit.
- No SPA fallback in router — new top-level UI routes need explicit handlers in `main.go`.
- All API responses set `Access-Control-Allow-Origin: *` (intended for local dev).
- Final Docker image is `FROM scratch` with only `./maildebug` — no shell, no certs.
