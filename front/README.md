# Mahajoni frontend

Mahajoni is a room-based multiplayer board game. This directory is the active full-stack application: Svelte 5 renders the UI and SvelteKit API routes run the authoritative game engine. The former Go/WebSocket implementation in `../back` is legacy code and is not used or deployed by this app.

## Architecture

- SvelteKit and `@sveltejs/adapter-vercel`
- HTTP polling every two seconds for game state
- Upstash Redis REST for room snapshots and short per-room mutation locks
- TypeScript game engine in `src/lib/server/engine.ts`
- Canvas-based game board in `src/lib/components/BoardCanvas.svelte`

Game-changing requests acquire a Redis lock for their room before reading and saving state. This prevents concurrent joins, actions, and leaves from overwriting one another when requests run on different Vercel instances.

## Requirements

- Bun (the committed lockfile is `bun.lock`)
- An Upstash Redis database for deployed environments

## Local development

```sh
bun install
bun run dev
```

Without Upstash variables, local development uses in-process memory. Rooms disappear when the dev server restarts and are not shared with another process.

Run validation before opening a pull request:

```sh
bun run check
bun run build
```

## Environment variables

Copy the values from Upstash's REST API section into your Vercel project settings:

```sh
UPSTASH_REDIS_REST_URL=https://your-database.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-upstash-rest-token
```

Both variables are required in Vercel. The app deliberately fails storage requests if they are absent rather than silently storing rooms in a single serverless instance.

Do not commit `.env` files or Redis tokens.

## Deployment

The project is configured for Vercel through `@sveltejs/adapter-vercel`.

1. Import the repository in Vercel and set the root directory to `front`.
2. Add both Upstash environment variables for Production and Preview as appropriate.
3. Deploy.
4. Create a room in two browser sessions and verify both see actions within two seconds.

## Game API

- `POST /api/rooms`: create a room and host session
- `POST /api/rooms/join`: join an existing room with a unique name
- `POST /api/rooms/rejoin`: restore a locally saved session
- `GET /api/rooms/:id/state`: fetch state with `Authorization: Bearer <session-token>`
- `POST /api/rooms/:id/action`: submit a validated game action
- `POST /api/rooms/:id/leave`: leave a room

Sessions are stored in browser local storage for reconnecting. A duplicate player name cannot reclaim a seat; the original browser session is required.

## Important implementation notes

- Room codes are four digits for easy sharing, not a security boundary.
- Only the server engine changes game state. Clients never supply dice outcomes.
- Room snapshots have a sliding 24-hour TTL in Redis.
- The application currently has no automated test suite. Changes to game rules or storage behavior should add tests before release.
