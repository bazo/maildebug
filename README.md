# maildebug

A self-contained SMTP debugging server in the spirit of MailHog/MailCatcher. One Go binary runs both an SMTP server that swallows outbound mail in development and an HTTP API + React UI for browsing what was captured. Useful for testing transactional email flows without ever risking a real send.

## Why this exists

The existing tools in this space (MailHog, MailCatcher) are unmaintained or fiddly to deploy. I wanted:

- **A single static binary.** Drop it in any environment, run it, done. No JVM, no Ruby, no Node runtime in production.
- **A modern UI** that renders HTML email faithfully (including multipart, encoded subjects, and attachments).
- **A scratch container** so it can sit in a docker-compose alongside any stack without bloating the image footprint.
- **No moving parts at runtime** — embedded storage, embedded UI, no sidecars.

Every architectural decision below traces back to one of these.

## Architecture

```
                 SMTP (1025)                        HTTP (8100)
                     │                                  │
                     ▼                                  ▼
       ┌─────────────────────────┐         ┌──────────────────────────┐
       │  go-smtp Backend        │         │  bunrouter               │
       │  - AuthPlain            │         │  GET    /messages        │
       │  - Session.Data parses  │         │  GET    /messages/:id/   │
       │    multipart, decodes   │         │           attachments/:i │
       │    base64/qp, walks     │         │  DELETE /messages        │
       │    parts recursively    │         │  GET    /  (embed UI)    │
       └─────────────┬───────────┘         └──────────────┬───────────┘
                     │                                    │
                     │           ┌────────────────────────┘
                     ▼           ▼
              ┌───────────────────────────────┐
              │  storm over bbolt             │
              │  data/<DB_NAME>               │
              │    MailData (Date indexed)    │
              │  data/messages/<id>           │
              │    raw RFC 822 bytes          │
              └───────────────────────────────┘
```

`main.go` wires four things together and runs them in one process:

1. **Config** — env vars prefixed `MAILDEBUG_`, layered through dotenv files (`maildebug.env.<env>.local` → `maildebug.env.local` → `maildebug.env.<env>` → `maildebug.env`). godotenv doesn't overwrite already-set vars, so file order encodes precedence.
2. **SMTP server** (`session/`) — built on [`emersion/go-smtp`](https://github.com/emersion/go-smtp). `Session.Data` decodes RFC 2047 headers, walks multipart bodies recursively (`parseParts`), decodes `base64`/`quoted-printable`, and splits each part into either a renderable `PartData` or a downloadable `Attachment`. The `id` is the local-part of the `Message-Id` header — that's what the API uses to look attachments up later.
3. **HTTP API** (`api/`) — bunrouter with [`reqlog`](https://github.com/uptrace/bunrouter) middleware. Permissive CORS (`*`) because this is a development tool, not a production service.
4. **Embedded UI** — `//go:embed ui/dist`. The React build is baked into the binary at compile time. `/` and `/assets/*` served from the embedded FS.

SMTP runs in a goroutine; HTTP runs on the main goroutine. Both are blocking — there's no graceful shutdown because there's no scenario where I'd care.

### Why these choices

**Go, not Node.** `emersion/go-smtp` is the most maintained SMTP server library across any ecosystem, and Go's static linking is the cheat code for "ship one file." The same binary runs on a developer laptop, a CI runner, and a production scratch image with no runtime install.

**bbolt, not SQLite.** Mail records are written, listed by date, occasionally fetched by id, and wiped wholesale. There are no joins, no migrations, no concurrent writers. bbolt gives me an embedded transactional KV store with zero CGO and zero schema. Storm adds the indexed `Date` field and the `Select().Limit().Skip()` pagination API on top. SQLite would have brought CGO complexity and migrations I don't need.

**Raw bytes on disk, parsed metadata in the DB.** Each captured message is stored twice: the parsed `MailData` goes into bbolt (so listing/searching is cheap), and the raw RFC 822 bytes go to `data/messages/<id>` (so I can re-serve, re-parse, or export them later without lossy reconstruction from the parsed form). This is a deliberate split — the DB shouldn't hold opaque blobs that grow unboundedly, and the filesystem shouldn't be queried for listings.

**Embedded UI.** Production is one process, one port for HTTP. No reverse proxy, no CORS dance, no separate static-file container. The UI is React 19 + Vite + Tailwind v4 + TanStack Query, with `react-letter` doing safe HTML email rendering. In development the Vite server runs separately and the API's permissive CORS lets it talk to the Go backend on `:8100`.

**`FROM scratch` + UPX.** The Dockerfile is three stages — bun → golang → scratch. `strip --strip-unneeded` and `upx` shave the binary down before it lands in the empty image. Final image: just the binary, no shell, no certs needed (no outbound TLS), no attack surface.

### Trade-offs I accepted

- **No SPA fallback in the static handler.** If the UI grows top-level routes, they need explicit handlers. I'd rather notice that than silently 404 to `index.html`.
- **No graceful shutdown.** A SIGTERM kills both servers immediately; in-flight SMTP sessions die. Acceptable for a dev tool.
- **No retention.** The bbolt file and `data/messages/` grow until you wipe them via `DELETE /messages`. Adding TTL is ~20 lines if it ever matters.
- **Permissive CORS (`*`).** Wrong for a production service. Right for a tool whose entire purpose is to be poked at from `localhost:5173`.

## Project layout

```
.
├── main.go                  # config, wiring, lifecycle
├── api/                     # HTTP handlers, CORS, middleware
├── session/                 # SMTP backend, MIME parsing, decoding
├── storage/                 # storm/bbolt wrapper
├── types/                   # Config, MailData, PartData, Attachment
├── ui/                      # React 19 + Vite + Tailwind v4 + TanStack Query
├── email-test/              # isolated bun workspace; sends sample mail via nodemailer
├── Dockerfile               # bun → golang → scratch (multi-stage, UPX-compressed)
└── Taskfile.yml             # task runner entrypoints
```

## Configuration

All vars are prefixed `MAILDEBUG_`. Defaults live in `maildebug.env.example`.

| Var                    | Default      | Purpose                                |
| ---------------------- | ------------ | -------------------------------------- |
| `SMTP_PORT`            | `1025`       | SMTP listen port                       |
| `API_PORT`             | `8100`       | HTTP API + UI listen port              |
| `USERNAME` / `PASSWORD`| –            | AuthPlain credentials                  |
| `DB_NAME`              | `mail.bolt`  | bbolt file under `data/`               |
| `DOMAIN`               | `localhost`  | SMTP greeting domain                   |
| `READ_TIMEOUT`         | `10`         | seconds                                |
| `WRITE_TIMEOUT`        | `10`         | seconds                                |
| `MAX_MESSAGE_BYTES`    | `1048576`    | hard cap per message                   |
| `MAX_RECIPIENTS`       | `50`         | per envelope                           |
| `ALLOW_INSECURE_AUTH`  | `true`       | required for plaintext local auth      |

## Running locally

You'll need Go 1.22+, Bun, and (optionally) [Task](https://taskfile.dev) and [air](https://github.com/air-verse/air).

```sh
cp maildebug.env.example maildebug.env

task client:build       # produces ui/dist (required — main.go embeds it)
task server             # go server with hot reload via air
task client             # vite dev server on :5173 (separate terminal)
```

Without Task:

```sh
cd ui && bun install && bun run build && cd ..
go run .                # SMTP on :1025, HTTP on :8100
```

To send a test email through the running SMTP server:

```sh
task test -- you@example.com    # uses email-test/send.tsx with react-email templates
```

## Running with Docker

```sh
task docker:build       # single-arch local image
task docker:push        # multi-arch (amd64 + arm64) buildx + push

# or directly
docker build -t maildebug .
docker run --rm \
  -p 1025:1025 \
  -p 8100:8100 \
  -v $(pwd)/data:/data \
  -e MAILDEBUG_DB_NAME=/data/mail.bolt \
  -e MAILDEBUG_USERNAME=username \
  -e MAILDEBUG_PASSWORD=password \
  -e MAILDEBUG_ALLOW_INSECURE_AUTH=true \
  maildebug
```

In a `docker-compose.yml`:

```yaml
services:
  maildebug:
    image: bazo/maildebug:latest
    ports:
      - "1025:1025"   # SMTP
      - "8100:8100"   # UI + API
    environment:
      MAILDEBUG_USERNAME: username
      MAILDEBUG_PASSWORD: password
      MAILDEBUG_ALLOW_INSECURE_AUTH: "true"
    volumes:
      - ./data:/data
```

Point your app at `smtp://username:password@maildebug:1025` and browse `http://localhost:8100`.

## API

| Method   | Path                                       | Purpose                                  |
| -------- | ------------------------------------------ | ---------------------------------------- |
| `GET`    | `/messages?page=N&maxPerPage=M`            | Paginated list (default 50/page)         |
| `GET`    | `/messages/:id/attachments/:index`         | Stream attachment with original filename |
| `DELETE` | `/messages`                                | Wipe everything                          |

## Stack

Go, [`emersion/go-smtp`](https://github.com/emersion/go-smtp), [`uptrace/bunrouter`](https://bun.uptrace.dev/guide/bunrouter.html), [`asdine/storm`](https://github.com/asdine/storm) over [`etcd-io/bbolt`](https://github.com/etcd-io/bbolt). UI: React 19, Vite, Tailwind v4, TanStack Query, [`react-letter`](https://github.com/mat-sz/react-letter). Tooling: Bun, oxlint/oxfmt, lefthook, Task.
