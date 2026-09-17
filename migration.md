# Migration Guide: SvelteKit (`front/`) → Next.js App Router

Source: `front/` — SvelteKit 2 + Svelte 5 (runes) + Tailwind v4 + Vite, deployed with `@sveltejs/adapter-vercel`.
Game: fullstack Monopoly-style board game ("মহাজনি"). Server authority lives in SvelteKit (`src/lib/server/` + `src/routes/api/`), backed by Upstash Redis REST with in-memory fallback. Client polls over HTTP (`src/lib/utils/polling.ts`); `src/lib/utils/websocket.ts` is **legacy/frozen** (Go backend in `back/` is frozen — do not port it).

Target: Next.js 14+ App Router (React 18+, TypeScript strict), Tailwind v4, deployed on Vercel.

---

## 1. Scaffold the Next.js app

```bash
npx create-next-app@latest web --typescript --tailwind --eslint --app --src-dir
cd web
npm i gsap motion ogl
# optional, only if you keep the derived-store pattern:
npm i zustand
```

Keep the SvelteKit app running side-by-side until parity:

```
/dhmk
  /front   # SvelteKit (frozen during migration)
  /web     # Next.js (new)
```

Recommended `web/` layout:

```
web/src/
  app/
    layout.tsx            # from front/src/routes/+layout.svelte + app.html
    page.tsx              # from front/src/routes/+page.svelte
    globals.css           # from front/src/routes/layout.css
    api/rooms/route.ts
    api/rooms/join/route.ts
    api/rooms/rejoin/route.ts
    api/rooms/[id]/action/route.ts
    api/rooms/[id]/state/route.ts
    api/rooms/[id]/leave/route.ts
  lib/
    server/{engine.ts,rooms.ts,kv.ts}
    constants/{boardData.ts,tiles.ts,cards.ts}
    utils/{polling.ts,sound.ts,dice.ts,tileIcons.ts,canvasRenderer.ts}
    stores/gameStore.ts
    components/{Lobby,BoardCanvas,ActionPanel,CardDecks,PlayerList,...}.tsx
  public/                 # from front/static/ (sounds/, favicon)
```

Path alias: map SvelteKit `$lib/*` → Next `@/*`. In `tsconfig.json`:

```json
{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }
```

Then `s/$lib/@/g` on every ported import.

---

## 2. File-by-file map (nothing is optional)

| SvelteKit source | Next.js destination | Notes |
|---|---|---|
| `src/app.html` | `src/app/layout.tsx` | lang, fonts, meta (see §4) |
| `src/routes/+layout.svelte` + `+layout.ts` (`prerender = true`) | `src/app/layout.tsx` + per-page segment config | UI is static shell; game state is client-fetched. Keep page static, make API routes dynamic |
| `src/routes/+page.svelte` (267 lines) | `src/app/page.tsx` (**`"use client"`**) | Largest UI port; see §6 |
| `src/routes/layout.css` | `src/app/globals.css` | Tailwind v4 syntax ports verbatim |
| `src/routes/api/rooms/+server.ts` | `src/app/api/rooms/route.ts` | `POST` create room |
| `src/routes/api/rooms/join/+server.ts` | `src/app/api/rooms/join/route.ts` | `POST` join |
| `src/routes/api/rooms/rejoin/+server.ts` | `src/app/api/rooms/rejoin/route.ts` | `POST` rejoin |
| `src/routes/api/rooms/[id]/state/+server.ts` | `src/app/api/rooms/[id]/state/route.ts` | `GET` poll; Bearer token header |
| `src/routes/api/rooms/[id]/action/+server.ts` | `src/app/api/rooms/[id]/action/route.ts` | `POST` 8 action types |
| `src/routes/api/rooms/[id]/leave/+server.ts` | `src/app/api/rooms/[id]/leave/route.ts` | `POST` leave |
| `src/lib/server/engine.ts` (884 lines) | `src/lib/server/engine.ts` | Copy, change 2 imports only (§3) |
| `src/lib/server/rooms.ts` (260 lines) | `src/lib/server/rooms.ts` | Copy, change 1 import (§3) |
| `src/lib/server/kv.ts` (174 lines) | `src/lib/server/kv.ts` | Copy, change env access (§3) |
| `src/lib/constants/*` | `src/lib/constants/*` | Copy verbatim after `$lib` → `@` |
| `src/lib/stores/gameStore.svelte.ts` | `src/lib/stores/gameStore.ts` | Rewrite as zustand (§5) |
| `src/lib/utils/polling.ts` (461 lines, **active transport**) | `src/lib/utils/polling.ts` or `src/lib/hooks/useGame.ts` | Rewrite as hook/store actions (§5); keep localStorage keys identical |
| `src/lib/utils/websocket.ts` (431 lines) | **Do not port** | Legacy Go-WS bridge; `polling.ts` replaced it |
| `src/lib/utils/sound.ts`, `dice.ts`, `tileIcons.ts`, `canvasRenderer.ts` | `src/lib/utils/*` | Mostly copy; SSR-guard browser APIs (§7) |
| `src/lib/components/*.svelte` (11 game components: ActionPanel, BoardCanvas, CardDecks, CashDisplay, Lobby, PlayerList, PlayerModal, PropertyModal, RoomSettings, SoldOutModal, UnsoldModal) | `src/lib/components/*.tsx` `"use client"` | See §6 |
| `src/lib/components/svelte-bits/*.svelte` (8 files: AnimatedList, Aurora, ClickSpark, CountUp, ShinyText, SplitText, SpotlightCard, StarBorder) | React equivalents | See §6; do not hand-translate Svelte DOM directives |
| `static/*` (`robots.txt`, `sounds/*.mp3`) | `public/*` (`robots.txt`, `/sounds/*.mp3`) | Paths (`/sounds/dice.mp3`) stay identical |
| `src/lib/assets/favicon.svg` | `src/app/icon.svg` or `public/favicon.svg` | Next convention |
| `.env.example` (`UPSTASH_REDIS_REST_URL/TOKEN`) | `.env.local` + Vercel env vars | See §3 |
| `vite.config.ts`, `svelte.config`, `.svelte-kit/` | `next.config.ts` | Delete; Next on Vercel needs no adapter |
| `components.json` (shadcn-svelte) | shadcn **React** registry if needed | Aliases differ; see §7 |

---

## 3. Server port: `engine.ts`, `rooms.ts`, `kv.ts` + 6 API routes

These three files are framework-free except for imports/env. Port order: `kv.ts` → `engine.ts` → `rooms.ts` → routes.

### 3.1 `kv.ts`: only change is env access

```ts
// before (SvelteKit)
import { env } from '$env/dynamic/private';
// after (Next Route Handler / server-only)
const url = (process.env.UPSTASH_REDIS_REST_URL ?? '').trim().replace(/\/+$/, '');
const token = (process.env.UPSTASH_REDIS_REST_TOKEN ?? '').trim();
const isVercel = (process.env.VERCEL ?? '') === '1';
```

Keep everything else: `KEY_PREFIX = 'poll:room:'`, 24h sliding TTL (`EXPIRE` on GET, `EX …` on SET), `SET NX EX` create-if-absent, `SET NX PX` lock + Lua `EVAL` release, `LOCK_TTL_MS = 5_000 / LOCK_ATTEMPTS = 20`, `declare global` `__mahajoniKv/__mahajoniLocks` memory fallback. In Next dev, `globalThis` persists across HMR the same way — keep it.

### 3.2 `engine.ts` / `rooms.ts`: change imports only

```ts
// engine.ts
import type { GameState, Player, Tile, TileType, GameSettings } from '@/lib/constants/boardData';
import { CHANCE_CARDS, CHEST_CARDS, cardTone, type Card } from '@/lib/constants/cards';
// rooms.ts
import { kvGet, kvSet, kvSetIfAbsent, kvDel, kvTryLock, kvReleaseLock, type PersistedRoom } from '@/lib/server/kv';
```

`crypto.randomUUID()` in `rooms.ts uid()` works in Next Route Handlers (Node 18+ / edge). No change needed.

### 3.3 API routes: `json()` → `NextResponse.json()`, `params` is async

SvelteKit pattern (all 6 handlers):

```ts
import { json } from '@sveltejs/kit';
export const POST: RequestHandler = async ({ request }) => { ... return json({...}); }
```

Next.js equivalent (`src/app/api/rooms/route.ts` — create room):

```ts
import { NextResponse } from 'next/server';
import { createRoom, toClient } from '@/lib/server/rooms';
import { EngineError } from '@/lib/server/engine';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { room, playerId, token } = await createRoom(String(body?.playerName ?? ''), body?.settings);
    const { state, version } = toClient(room);
    return NextResponse.json({ roomId: room.id, playerId, sessionToken: token, state, version });
  } catch (e) {
    if (e instanceof EngineError) return NextResponse.json({ code: e.code, message: e.msg }, { status: 400 });
    return NextResponse.json({ code: 'CREATE_FAILED', message: 'ঘর তৈরি করা যায়নি।' }, { status: 500 });
  }
}
```

Per-route notes:

- `join` / `rejoin` / `leave`: same shape, `POST`. `leave` always returns `{ ok: true }` (best-effort, never throws to client).
- `state` (`GET`): read `req.headers.get('authorization')`, strip `/^Bearer\s+/i`, call `getRoom` + `playerIdFor`. Return 404 with `{ code, message }` on `EngineError` (match current behavior — client treats 404 + `ROOM_NOT_FOUND/INVALID_SESSION` as session-dead).
- `action` (`POST`): validate `type` against the 8 literals (`START_GAME, ROLL_DICE, BUY_PROPERTY, BUILD_HOUSE, END_TURN, PAY_JAIL_FINE, USE_JAIL_CARD, UPDATE_SETTINGS`), pass `payload` + `sessionToken` from body. Dynamic segment: `export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) { const { id } = await params; … }`.
- Add `export const dynamic = 'force-dynamic'` (and optionally `export const runtime = 'nodejs'`) to every API route — replaces SvelteKit's default server execution and preserves the `prerender = true` split (static page + dynamic API).

### 3.4 Env vars

| SvelteKit | Next.js |
|---|---|
| `$env/dynamic/private` (`UPSTASH_*`) | `process.env.UPSTASH_*` (server only — never prefix with `NEXT_PUBLIC_`) |
| `$env/dynamic/public` (`PUBLIC_WS_URL`, used only by legacy `websocket.ts`) | Drop; do not define `NEXT_PUBLIC_WS_URL` |
| `front/.env.example` | `web/.env.example` + `.env.local` (gitignored); same two keys; empty locally = memory store |

Vercel: set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` in project Environment Variables (Production + Preview). `kv.ts` throws on Vercel when unset — keep that guard.

---

## 4. App shell: `app.html` + `+layout.svelte` → `layout.tsx` + `globals.css`

```tsx
// src/app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ধনী হওয়ার মজার খেলা',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bn">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

`globals.css`: copy `src/routes/layout.css` verbatim — `@import 'tailwindcss';` + `@plugin '@tailwindcss/typography';` + keyframes (`log-in, modal-in, float-slow, turn-pulse, trophy-bounce`) + scrollbar/selection theme all work under Tailwind v4 in Next. Move the `:global(body) { font-family: 'Noto Sans Bengali', … }` rule from `+layout.svelte` into `globals.css` as plain `body { … }`.

---

## 5. State + transport: `gameStore.svelte.ts` + `polling.ts` → zustand + hook

### 5.1 Store

`gameStore.svelte.ts` is a class with `$state` fields + `$derived` getters (`currentPlayer, me, isMyTurn, isHost, canRoll, canAct, canEndTurn`) + `reset()`. Rewrite with zustand (or React context + `useSyncExternalStore` if you avoid deps):

```ts
// src/lib/stores/gameStore.ts
import { create } from 'zustand';
import type { GameState } from '@/lib/constants/boardData';

type Conn = 'idle' | 'connecting' | 'open' | 'closed';
interface GameStore {
  gameState: GameState | null; playerId: string | null;
  sessionToken: string | null; roomCode: string | null;
  connection: Conn; lastError: string | null;
  set: (p: Partial<GameStore>) => void; reset: () => void;
}
export const useGameStore = create<GameStore>((set) => ({
  gameState: null, playerId: null, sessionToken: null, roomCode: null,
  connection: 'idle', lastError: null,
  set: (p) => set(p),
  reset: () => set({ gameState: null, playerId: null, sessionToken: null, roomCode: null, lastError: null }),
}));
// selectors (replacing $derived): e.g.
// export const selectIsMyTurn = (s: GameStore) => !!s.gameState && !!s.playerId && s.gameState.currentTurnPlayerId === s.playerId;
```

Port all 7 derived getters as selector functions — `+page.svelte` and `ActionPanel` depend on `canRoll/canAct/canEndTurn` (note: `canEndTurn` covers both `ACTION` and `END_TURN` phases; preserve that).

### 5.2 Polling bridge (keep behavior identical)

`polling.ts` is 461 lines of battle-tested logic — port the semantics, not just the fetch calls:

- Same endpoints/methods/bodies: `POST /api/rooms`, `POST /api/rooms/join`, `POST /api/rooms/rejoin`, `GET /api/rooms/:id/state` (Bearer header), `POST …/action` (`{ type, payload, sessionToken }`), `POST …/leave`.
- Same localStorage keys (`mahajoni.sessionToken/roomId/playerId/playerName/lastRoomId`) — **do not rename**, or existing saved seats break.
- Same cadence: 2s in-game / 4s lobby / 10s finished, `ensurePollingCadence()` on status change, version guard (`latestStateVersion`, ignore stale), single-flight `fetchState`, **sequential action queue** (the old single-flight dropped rapid house-buy clicks — `send()` must queue).
- Same lifecycle listeners: `visibilitychange` (stop when hidden, refresh on visible), `online/offline`, `pageshow` (bfcache restore). Implement in a `useEffect` in `page.tsx` with cleanup (`clearInterval`, remove listeners) — Svelte's `onMount` has no cleanup here; React needs it.
- Same error contract: `handleServerError` clears session + sets the Bengali "আসনটি আর নেই…" message on `SESSION_EXPIRED/INVALID_SESSION/PLAYER_NOT_FOUND/ROOM_NOT_FOUND`.
- `connect({ resume: true })` on mount when `hasSavedSession()` and store is empty — replicate in `useEffect`.

`sound.ts` interaction in `+page.svelte` (log-watermark `$effect` → dice/double/build/jail sounds, `unlockAudio` on first pointerdown/keydown) becomes a `useEffect` on `gameState.logs.length` with a `useRef` watermark initialized to `-1`.

---

## 6. Components: Svelte → React

All game components are client-side (`"use client"`). General transforms:

| Svelte 5 | React |
|---|---|
| `let x = $state(v)` | `const [x, setX] = useState(v)` (or zustand for shared) |
| `$derived(expr)` | `useMemo(() => expr, [deps])` |
| `$effect(() => {...})` | `useEffect(() => {...}, [deps])` — add missing dep arrays carefully |
| `$props()` / `{@render children()}` | props / `children: React.ReactNode` |
| `onMount` / `onDestroy` | `useEffect(() => { …; return () => cleanup; }, [])` |
| `{#if}/{#each}/{@html}` | ternaries/`&&`, `.map()`, `dangerouslySetInnerHTML` (avoid) |
| `bind:value` | controlled `value` + `onChange` |
| event `onclick` | `onClick` |
| `<svelte:head>` | `metadata` export or `<title>` in layout |
| `transition:` / `animate:` | `motion` (already a dep) or CSS keyframes from `layout.css` |

Per-component notes (port in this order — leaves first):

1. `CashDisplay, PlayerList, CardDecks, RoomSettings` — pure presentational; straightforward.
2. `ActionPanel` — depends on `canRoll/canAct/canEndTurn` selectors + `send()` queue; keep the queued `actionsPending()` spinner behavior.
3. `PropertyModal, PlayerModal, UnsoldModal, SoldOutModal` — `+page.svelte` owns `selectedTile/selectedPlayer/showSoldOut/soldOutSeenFor` state; the sold-out modal triggers on the derived "every PROPERTY/UTILITY/RAILROAD has `ownerId`" check — keep exact predicate.
4. `Lobby` — create/join/rejoin forms + `loadLastRoomId()` prefill + `retryNow()` + `getReconnectAttempts()` display.
5. `BoardCanvas` (460 lines, canvas + `requestAnimationFrame` hop animation) — move to `useRef<HTMLCanvasElement>` + `useEffect` rAF loop with cancel on unmount; helpers `tileRect/tileCenter` from `canvasRenderer.ts` port unchanged; guard `matchMedia('(prefers-reduced-motion: reduce)')` behind `typeof window !== 'undefined'`; keep `STEP_MS = 160 / HOP_PX = 18` hop physics so tokens retarget mid-hop from authoritative updates.
6. `svelte-bits/` (9 files) — **do not transliterate** (`ClickSpark` uses Svelte event/canvas idioms; `SplitText/CountUp` use Svelte transitions). Either `npm i reactbits`-style equivalents (e.g. `motion`-based `CountUp`, CSS `Aurora/SpotlightCard/StarBorder`) or reimplement minimal versions with `motion`/CSS. `gsap` + `motion` + `ogl` deps transfer as-is but must only run in `"use client"` components (or `next/dynamic(..., { ssr: false })` for the `ogl`/`Aurora` WebGL bits).

Check usages: `grep -rn "from '\$lib/utils/websocket'" front/src` must return **zero active imports** before you delete it (only comments in `polling.ts` reference it).

---

## 7. Pitfalls specific to this repo

1. **SSR crashes**: `sound.ts` reads `localStorage` at module top; `polling.ts` touches `window/document`; `BoardCanvas` uses `performance/matchMedia`. Guard all with `typeof window !== 'undefined'` or init lazily in `useEffect`. Set module-level `muted` default to `false` and hydrate from localStorage in an effect.
2. **`$env` imports**: `grep -rn '\$env' front/src` → every hit is either `kv.ts` (server, → `process.env`) or legacy `websocket.ts` (→ delete). No `PUBLIC_*` var survives the migration.
3. **`components.json`** is shadcn-**svelte** config (`$lib/components`, `shadcn-svelte` registry). If shadcn UI is actually used, re-scaffold with the React shadcn CLI; the `tailwind.css` path moves from `src/routes/layout.css` to `src/app/globals.css`.
4. **Bengali strings**: API error messages and game logs are Bengali user-facing contracts (client matches substrings like `'পাশা ফেলেছেন'`, `'জোড়া পেয়েছেন'`, `'জেলে গেছেন'` for sounds). Copy `engine.ts` message strings byte-for-byte; never "translate" them.
5. **Lock contention**: `applyAction/join/leave` run under `withRoomLock` (5s TTL, 20 attempts, `ROOM_BUSY` on failure). Client already queues actions; keep it — rapid `BUILD_HOUSE` clicks from two players otherwise interleave Redis read-modify-writes.
6. **Static vs dynamic**: page stays statically renderable; **all** `/api/rooms/**` must be `force-dynamic`. Do not add `generateStaticParams` for room ids (rooms are created at runtime, 4-digit codes).
7. **`static/` → `public/`**: `static/sounds/*.mp3` referenced as `/sounds/*.mp3` — same URL in Next `public/`. Verify `dice.mp3, double-6.mp3, hotel-%26-houses.mp3, jail.mp3` all move (note the URL-encoded `&`).
8. **No test suite exists** (`package.json` has only dev/build/preview/check scripts). After porting, at minimum add a smoke test hitting `POST /api/rooms` → `POST /:id/action ROLL_DICE` → `GET /:id/state` and `tsc --noEmit`. Replace `svelte-check` with `tsc`.

---

## 8. Verification checklist

- [ ] `grep -rn '\$lib\|\$env\|svelte' web/src` → zero hits (except comments).
- [ ] `POST /api/rooms` (create) → `POST /api/rooms/join` (second player) → `GET /api/rooms/[id]/state` (Bearer) → `POST …/action START_GAME` (host) → `ROLL_DICE/BUY_PROPERTY/END_TURN` round-trip, versions strictly increasing.
- [ ] Reload mid-game with saved `mahajoni.*` keys → auto-resume, no new seat; `rejoin` returns same `playerId`.
- [ ] Two browsers, rapid `BUILD_HOUSE` clicks → no dropped actions (queue), no `ROOM_BUSY` surfacing as stuck spinner.
- [ ] Background tab 60s → 0 `/state` requests while hidden; foreground → immediate refresh.
- [ ] Room survives Vercel redeploy (Upstash set); local dev with empty env works via memory store.
- [ ] Sounds fire once per fresh log line; joining mid-game plays nothing; mute persists.
- [ ] Token hop animation completes tile-by-tile; reduced-motion respected.
- [ ] `tsc --noEmit` clean; `next build` clean; Bengali copy byte-identical to SvelteKit responses.
