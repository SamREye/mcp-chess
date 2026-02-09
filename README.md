# MCP Chess

A minimal multiplayer chess app where game mutations are exposed as MCP-style tool calls.

## Features

- OAuth login (Google via NextAuth)
- Public game list and public game detail pages
- Only authenticated game players can move pieces
- Per-game chat (players only)
- Game invitation emails via SMTP on game creation
- Turn reminder emails via endpoint (threshold in minutes)
- Ably realtime events for game/chat updates
- MCP actions:
  - query users by email (also matches names)
  - new game
  - move piece
  - snapshot (SVG image)
  - status (piece positions)
  - history (chronological moves)

## Run

1. `cp .env.example .env`
2. Fill OAuth, Ably, and SMTP values:
   - `DATABASE_URL` (MongoDB connection string)
   - `NEXTAUTH_SECRET`, `GOOGLE_ID`, `GOOGLE_SECRET`
   - `ABLY_API_KEY`
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
3. `pnpm install`
4. `pnpm run prisma:generate`
5. `pnpm run db:init` (applies Prisma schema/indexes to MongoDB)
6. `pnpm run dev`

If dev chunk/CSS 404s appear during hot reload:
- run `pnpm run dev:fresh` to clear the dev build cache and restart
- use `pnpm run build && pnpm run start` for a stable non-HMR preview session

## Deploy Notes (Railway)

- Use a persistent MongoDB service and set `DATABASE_URL` to that connection string.
- `start` runs `db:init` automatically, which performs `prisma db push --skip-generate`.

## MCP endpoint

`POST /api/mcp` with JSON-RPC payloads:

- `initialize`
- `tools/list`
- `tools/call`

Tool names are in `lib/mcp-tools.ts`.

OAuth for MCP clients:
- Protected resource metadata: `GET /.well-known/oauth-protected-resource`
- Authorization server metadata: `GET /.well-known/oauth-authorization-server`
- Authorization endpoint: `GET /oauth/authorize`
- Token endpoint: `POST /oauth/token`
- Optional allow-list: set `MCP_OAUTH_ALLOWED_CLIENT_IDS` to comma-separated client IDs

## Ably Realtime

- Token endpoint: `GET /api/ably/token`
- Channel used by game page: `game:<gameId>`
- Published events:
  - `game.created`
  - `move.created`
  - `game.finished`
  - `chat.created`

## Turn Reminder Endpoint

`POST /api/reminders/turn`

Headers:
- `content-type: application/json`
- `x-reminder-key: <REMINDER_API_KEY>` (required only when `REMINDER_API_KEY` is set)

Payload:

```json
{
  "gameId": "your-game-id",
  "minMinutesSinceLastMove": 60,
  "dryRun": false
}
```
