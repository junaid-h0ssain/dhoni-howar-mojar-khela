# Mahajoni (মহাজনি)

## Technical Specification & Implementation Plan

---

## 1. Project Overview

Build a **real-time, room-based online multiplayer Monopoly-style game** tailored for Bangladesh.

### Project Goals

* Real-time multiplayer gameplay
* Room-based matchmaking
* 4-10 players per room
* Server-authoritative game state
* Bangla-localized board and UI
* Bangladesh-specific locations and currency
* Reconnection support
* Responsive web interface
* Smooth Canvas-based board animations

### Technology Stack

| Layer                   | Technology                 |
| ----------------------- | -------------------------- |
| Frontend                | Svelte 5, TypeScript       |
| Styling                 | Tailwind CSS               |
| Board Rendering         | HTML5 Canvas API           |
| Backend                 | Go 1.22+                   |
| Real-time Communication | Raw WebSockets             |
| WebSocket Library       | `gorilla/websocket`        |
| State / Session Store   | Redis                      |
| Redis Client            | `go-redis/redis/v9`        |
| Redis Provider          | Upstash                    |
| Protocol                | JSON event-driven messages |
| Frontend Deployment     | Vercel / Cloudflare Pages  |
| Backend Deployment      | Render / Koyeb             |

---

# 2. Data Models & State Schema

## 2.1 Board Tile Schema

The board contains **40 tiles**, following the traditional Monopoly-style perimeter layout.

All properties are localized to Bangladesh, primarily using locations from Chattogram.

### Property Groups

#### Group 1 — Violet

| Property             | Price |
| -------------------- | ----: |
| স্বন্দীপ (Swandip)   |   ৳60 |
| সীতাকুন্ড (Sitakund) |   ৳60 |

#### Group 2 — Light Blue

| Property             | Price |
| -------------------- | ----: |
| পটিয়া (Patiya)       |  ৳100 |
| আনোয়ারা (Anwara)     |  ৳100 |
| সাতকানিয়া (Satkania) |  ৳120 |

#### Group 3 — Pink

| Property              | Price |
| --------------------- | ----: |
| রাউজান (Raozan)       |  ৳140 |
| ফটিকছড়ি (Fatikchhari) |  ৳140 |
| রাঙ্গুনিয়া (Rangunia) |  ৳160 |

#### Group 4 — Orange

| Property    | Price |
| ----------- | ----: |
| কোতোয়ালি    |  ৳180 |
| আন্দরকিল্লা |  ৳180 |
| চকবাজার     |  ৳200 |

#### Group 5 — Red

| Property   | Price |
| ---------- | ----: |
| জিইসি      |  ৳220 |
| বাটালি হিল |  ৳220 |
| দেওয়ানহাট  |  ৳140 |

> **Note:** দেওয়ানহাট is currently specified as ৳140. Verify whether this price is intentional before implementing the final board balance.

#### Group 6 — Yellow

| Property             | Price |
| -------------------- | ----: |
| হালিশহর (Halishahar) |  ৳260 |
| অলংকার               |  ৳260 |
| আগ্রাবাদ (Agrabad)   |  ৳280 |

#### Group 7 — Green

| Property   | Price |
| ---------- | ----: |
| মুরাদপুর   |  ৳300 |
| বহদ্দারহাট |  ৳300 |
| চান্দগাঁও  |  ৳320 |

#### Group 8 — Dark Blue

| Property | Price |
| -------- | ----: |
| খুলশী    |  ৳350 |
| পাঁচলাইশ |  ৳400 |

---

## 2.2 Utilities & Railroads

### Utilities

* পিডিবি — PDB Power Grid
* ওয়াসা — WASA

### Railroads / Transport

* পাহাড়তলী স্টেশন — Kamalapur Station
* চট্টগ্রাম জংশন — Chattogram Junction
* ষোলশহর স্টেশন — Sylhet Station
* বিমানবন্দর — Airport

> **Note:** Some English descriptions currently do not match the Bangla location names. Final implementation should use the actual corresponding Chattogram locations.

---

## 2.3 Cards

### Chance

**ভাগ্য পরীক্ষা**

### Community Chest

**সুযোগ গ্রহণ**

---

## 2.4 Currency

The game's currency is:

**৳ — Bangladeshi Taka (BDT)**

---

# 3. Core State Types

The frontend and backend should maintain equivalent state representations.

## 3.1 TypeScript Types

```ts
export type TileType =
  | 'PROPERTY'
  | 'UTILITY'
  | 'RAILROAD'
  | 'CHANCE'
  | 'CHEST'
  | 'TAX'
  | 'JAIL'
  | 'GO_TO_JAIL'
  | 'GO'
  | 'PARKING';

export interface Tile {
  id: number;
  nameBn: string;
  nameEn: string;
  type: TileType;

  price?: number;

  // [Base, 1H, 2H, 3H, 4H, Hotel]
  rentTiers?: number[];

  houseCost?: number;

  group?: string;

  ownerId?: string;

  // 0–4 = houses
  // 5 = hotel
  houses: number;

  isMortgaged: boolean;
}

export interface Player {
  id: string;
  name: string;
  tokenColor: string;

  cash: number;

  // 0–39
  position: number;

  inJail: boolean;
  jailTurns: number;

  isBankrupt: boolean;
  isConnected: boolean;
}

export interface GameState {
  roomId: string;
  hostId: string;

  status:
    | 'LOBBY'
    | 'IN_GAME'
    | 'FINISHED';

  currentTurnPlayerId: string;

  dice: [number, number];

  turnPhase:
    | 'ROLL'
    | 'ACTION'
    | 'END_TURN';

  tiles: Record<number, Tile>;

  players: Player[];

  logs: string[];
}
```

---

# 4. Backend Architecture

The backend must be **server-authoritative**.

Clients should never directly modify game state.

Instead, clients send **intentions/actions**, and the server:

1. Validates the action.
2. Checks the current game state.
3. Applies the game rules.
4. Updates the authoritative state.
5. Broadcasts the resulting state/event to all players.

### Example

Client sends:

```json
{
  "type": "ROLL_DICE",
  "payload": {}
}
```

Server determines:

```text
Dice = 4 + 5
Player moves from tile 12 → tile 21
Player lands on property
Property is unowned
Player may purchase it
```

Server then broadcasts the resulting state.

---

# 5. Backend Directory Structure

```text
backend/
├── main.go
│
├── pkg/
│   ├── game/
│   │   ├── engine.go
│   │   └── board_data.go
│   │
│   ├── websocket/
│   │   ├── client.go
│   │   ├── hub.go
│   │   └── room.go
│   │
│   └── models/
│       └── state.go
│
├── go.mod
├── go.sum
└── Dockerfile
```

---

# 6. Room System

## 6.1 Room Codes

Each room receives a unique **6-character alphanumeric room code**.

Example:

```text
BD8921
```

Requirements:

* Exactly 6 characters
* Uppercase letters and numbers
* Collision-resistant
* Easy to type manually
* Case-insensitive when joining

---

# 7. Hub & Room Architecture

Use a standard **Hub → Room → Client** architecture.

## Hub

The Hub manages active rooms.

```go
type Hub struct {
    rooms map[string]*Room
}
```

Responsibilities:

* Create rooms
* Remove empty rooms
* Find rooms by room code
* Route clients to rooms
* Generate unique room codes

---

## Room

Each room owns its own game state and game engine.

```go
type Room struct {
    ID string

    Clients map[string]*Client

    GameState *GameState

    Engine *GameEngine
}
```

Each room should process game actions in its **own goroutine/event loop** to avoid concurrent state mutations.

### Important Rule

Game state must not be modified simultaneously by multiple goroutines.

All state-changing operations should pass through the room's game loop.

---

# 8. WebSocket Client

Each connected player has a WebSocket client.

Responsibilities:

* Read incoming WebSocket messages
* Decode JSON events
* Send actions to the room
* Receive broadcasts
* Handle connection termination
* Support session reconnection

---

# 9. WebSocket Protocol

Messages use JSON.

## Create Room

```json
{
  "type": "CREATE_ROOM",
  "payload": {
    "playerName": "রাফি"
  }
}
```

## Join Room

```json
{
  "type": "JOIN_ROOM",
  "payload": {
    "roomId": "BD8921",
    "playerName": "করিম"
  }
}
```

## Roll Dice

```json
{
  "type": "ROLL_DICE",
  "payload": {}
}
```

## Buy Property

```json
{
  "type": "BUY_PROPERTY",
  "payload": {
    "tileId": 14
  }
}
```

## Build House

```json
{
  "type": "BUILD_HOUSE",
  "payload": {
    "tileId": 14
  }
}
```

## End Turn

```json
{
  "type": "END_TURN",
  "payload": {}
}
```

---

# 10. Server → Client Events

The server should send structured events such as:

```json
{
  "type": "GAME_STATE",
  "payload": {
    "roomId": "BD8921",
    "status": "IN_GAME"
  }
}
```

Other possible events:

```text
ROOM_CREATED
PLAYER_JOINED
PLAYER_LEFT
GAME_STARTED
GAME_STATE
DICE_ROLLED
PLAYER_MOVED
PROPERTY_PURCHASED
HOUSE_BUILT
PLAYER_BANKRUPT
PLAYER_DISCONNECTED
PLAYER_RECONNECTED
GAME_FINISHED
ERROR
```

The server should send an `ERROR` event when a client attempts an invalid action.

Example:

```json
{
  "type": "ERROR",
  "payload": {
    "code": "NOT_YOUR_TURN",
    "message": "এখন আপনার চাল নয়।"
  }
}
```

---

# 11. Session Reconnection

Use Redis to persist player sessions.

Each player receives a `sessionToken`.

Example mapping:

```text
session:<sessionToken>
    ↓
roomId
playerId
expiresAt
```

When a player disconnects:

1. Keep their player state.
2. Mark `isConnected = false`.
3. Start a **120-second gameplay grace window**: a stuck turn forfeits so the
   game never stalls, but the player object stays in the game.
4. Persist the full game snapshot + seat token in the store with a **24-hour
   TTL** — reloads, app-switches, and backend restarts rehydrate from it.
5. If they reconnect using the session token, rebind their WebSocket
   connection (rehydrating the room from the snapshot if needed).
6. If the snapshot/token TTL expires, the game is gone and the client rejoins
   fresh with a friendly message.

The store holds two key shapes (`session:<token>` → roomId/playerId,
`game:<roomId>` → full GameState JSON), both expiring after 24h.

---

# 12. Game Engine

The game engine should contain all Monopoly-style rules.

Example:

```go
type GameEngine struct {
    State *GameState
}
```

Core responsibilities:

* Dice rolling
* Player movement
* Passing GO
* Property purchasing
* Rent calculation
* Utilities
* Railroads
* Houses
* Hotels
* Taxes
* Chance cards
* Community Chest cards
* Jail
* Bankruptcy
* Winning conditions
* Turn progression

---

# 13. Turn System

The turn lifecycle is:

```text
ROLL
  ↓
ACTION
  ↓
END_TURN
  ↓
NEXT PLAYER
  ↓
ROLL
```

The server must validate every transition.

For example:

### `ROLL_DICE`

Valid only when:

```text
status == IN_GAME
AND
currentTurnPlayerId == requestingPlayerId
AND
turnPhase == ROLL
```

### `BUY_PROPERTY`

Valid only when:

```text
status == IN_GAME
AND
currentTurnPlayerId == requestingPlayerId
AND
turnPhase == ACTION
AND
property is purchasable
AND
player has enough cash
```

---

# 14. Frontend Architecture

```text
frontend/
├── src/
│   ├── lib/
│   │   ├── components/
│   │   │   ├── BoardCanvas.svelte
│   │   │   ├── ActionPanel.svelte
│   │   │   ├── PlayerList.svelte
│   │   │   ├── PropertyModal.svelte
│   │   │   └── Lobby.svelte
│   │   │
│   │   ├── stores/
│   │   │   └── gameStore.ts
│   │   │
│   │   ├── utils/
│   │   │   ├── canvasRenderer.ts
│   │   │   └── websocket.ts
│   │   │
│   │   └── constants/
│   │       └── boardData.ts
│   │
│   ├── App.svelte
│   └── main.ts
│
├── package.json
└── vite.config.ts
```

---

# 15. Canvas Board Renderer

Create an **800 × 800 HTML5 Canvas** board.

The board should contain the traditional Monopoly-style perimeter:

```text
┌──────────────────────────────────────┐
│ GO       Property  Property     ...  │
│                                      │
│ Property                         ...  │
│                                      │
│ Property          CENTER         ...  │
│                                      │
│ Property                         ...  │
│                                      │
│ ...     Property   Property     Jail │
└──────────────────────────────────────┘
```

The exact tile positioning should be calculated programmatically rather than manually drawing each tile.

---

# 16. Canvas Rendering Requirements

The renderer must support:

* 40 board tiles
* Property group colors
* Bangla names
* English names where appropriate
* Property prices
* ৳ currency symbol
* Player tokens
* Ownership indicators
* Houses
* Hotels
* Special tiles
* Center board artwork
* Dice/result indicators

### Fonts

Prefer:

* Hind Siliguri
* Kalpurush

The application should load the font before rendering Bangla text to Canvas.

---

# 17. Player Token Animation

Player movement should be animated rather than instantly changing positions.

Use interpolation:

```ts
function lerp(
  start: number,
  end: number,
  amount: number
): number {
  return start + (end - start) * amount;
}
```

When a player rolls:

```text
Tile 5
 ↓
Tile 6
 ↓
Tile 7
 ↓
Tile 8
 ↓
Tile 9
```

The token should smoothly animate through each tile.

---

# 18. Svelte 5 State Management

Use Svelte 5 runes for reactive game state.

Example conceptual structure:

```ts
let gameState = $state<GameState | null>(null);

let currentPlayer = $derived(
  gameState?.players.find(
    (player) =>
      player.id === gameState.currentTurnPlayerId
  )
);
```

The WebSocket layer should update the store whenever the server sends a state/event message.

---

# 19. WebSocket Bridge

Create:

```text
src/lib/utils/websocket.ts
```

Responsibilities:

* Establish WebSocket connection
* Automatically reconnect when possible
* Serialize outgoing events
* Parse incoming events
* Handle connection state
* Store/reuse session token
* Dispatch events to the game store

Example API:

```ts
connect(url: string): void;

send(
  type: string,
  payload?: unknown
): void;

disconnect(): void;
```

---

# 20. Action Panel

Create:

```text
ActionPanel.svelte
```

The UI must react to:

```text
turnPhase
currentTurnPlayerId
playerId
```

Only display actions that the current player is actually allowed to perform.

---

## Phase: ROLL

Display:

**দান চালুন**

Button:

```text
Roll Dice
```

---

## Phase: ACTION

Possible actions:

**সম্পত্তি কিনুন**

Buy Property

**বাড়ি তৈরি করুন**

Build House

**দান শেষ করুন**

End Turn

---

# 21. Important UX Rule

The frontend should not be trusted for game rules.

For example, even if the frontend displays:

```text
BUY PROPERTY
```

the server must still verify:

```text
Is it this player's turn?
Is the tile purchasable?
Does the player have enough cash?
Does the player already own it?
Is the player bankrupt?
```

The frontend is responsible for **presentation**.

The backend is responsible for **truth**.

---

# 22. Lobby

Create a lobby interface supporting:

### Create Room

Input:

```text
আপনার নাম
```

Button:

```text
ঘর তৈরি করুন
```

After creation:

```text
Room Code

BD8921
```

Provide a copy button.

---

### Join Room

Inputs:

```text
Room Code
আপনার নাম
```

Button:

```text
ঘরে যোগ দিন
```

---

# 23. Player List

Display:

```text
Players

🟢 রাফি       ৳1500
🔵 করিম       ৳1240
🔴 সুমন       ৳900
🟡 নাঈম       ৳1500
```

Indicate:

* Connected/disconnected status
* Current player
* Player token color
* Cash
* Bankruptcy status

---

# 24. Game Logs

Display recent events in Bangla.

Examples:

```text
রাফি পাশা ফেলেছেন: ৪ + ৫
রাফি ৯ ঘর এগিয়েছেন।
রাফি আগ্রাবাদ কিনেছেন ৳280 দিয়ে।
করিম ভাড়ার জন্য ৳24 দিয়েছেন।
সুমন দেউলিয়া হয়ে গেছেন।
```

Keep the latest entries visible.

---

# 25. Game Start

A room starts in:

```text
LOBBY
```

The host should be able to start the game once the minimum number of players has joined.

Suggested minimum:

```text
2 players
```

Maximum:

```text
4 players
```

When the game begins:

```text
LOBBY
   ↓
IN_GAME
```

---

# 26. Game End

The game ends when only one non-bankrupt player remains.

Then:

```text
IN_GAME
   ↓
FINISHED
```

Display:

```text
🏆 বিজয়ী

রাফি
```

Provide:

```text
আবার খেলুন
```

or

```text
লবিতে ফিরুন
```

---

# 27. Execution Plan

Implement the project sequentially.

---

## Task 1 — Project Setup

### Backend

* Initialize Go module
* Configure Go 1.22+
* Install dependencies
* Create initial directory structure
* Add configuration system
* Add Redis connection

### Frontend

* Initialize Svelte 5 project
* Configure TypeScript
* Configure Tailwind CSS
* Set up project structure
* Add Bangla font
* Create basic application shell

---

## Task 2 — Go WebSocket & Hub

Implement:

* Hub
* Room
* Client
* WebSocket connection
* JSON message router
* Room creation
* Room joining
* Broadcasting
* Connection handling

Verify:

```text
Client A ──┐
Client B ──┼──> Room
Client C ──┤
Client D ──┘
```

All clients should receive broadcasts.

---

## Task 3 — Go Game Engine

Implement:

* Board data
* Player state
* Dice
* Movement
* GO
* Property purchasing
* Rent
* Houses
* Hotels
* Taxes
* Utilities
* Railroads
* Cards
* Jail
* Bankruptcy
* Turn progression
* Win condition

All rules must execute server-side.

---

## Task 4 — Svelte Canvas Renderer

Implement:

* 800×800 board
* 40 tiles
* Property group colors
* Bangla typography
* Prices
* Special tiles
* Player tokens
* Houses
* Hotels
* Ownership indicators
* Center artwork

Add smooth movement animation.

---

## Task 5 — Frontend Socket Bridge

Implement:

* WebSocket client
* Session token handling
* Reconnection
* Event parsing
* State synchronization
* Connection status

Example:

```text
WebSocket
    ↓
Event Parser
    ↓
Game Store
    ↓
Svelte Components
    ↓
Canvas / UI
```

---

## Task 6 — Lobby & Room Joining

Implement:

* Create room
* Join room
* Room code
* Player names
* Player list
* Host identification
* Start game button
* Connection status

---

## Task 7 — Polish & Local Testing

Test with **four simultaneous players**.

Test:

### Gameplay

* Rolling
* Movement
* Passing GO
* Buying properties
* Paying rent
* Building houses
* Bankruptcy
* Winning

### Networking

* Player disconnects
* Player reconnects
* Session expiration
* Room cleanup
* Multiple simultaneous actions
* Invalid actions
* Duplicate requests

### UI

* Desktop
* Tablet
* Mobile
* Bangla text rendering
* Canvas scaling
* Animation
* Responsive layout

---

# 28. Security & Validation

Never trust client-provided:

* Cash
* Position
* Property ownership
* Dice values
* Turn state
* Player status
* Game phase

For example, the client must **never send dice values**.

Correct:

```json
{
  "type": "ROLL_DICE",
  "payload": {}
}
```

Incorrect:

```json
{
  "type": "ROLL_DICE",
  "payload": {
    "dice": [6, 6]
  }
}
```

The server generates the dice values.

---

# 29. Concurrency Requirements

The Go backend must prevent race conditions.

Recommended architecture:

```text
                    ┌───────────────┐
Client ──WS────────>│     Hub       │
                    └───────┬───────┘
                            │
                    ┌───────▼───────┐
                    │     Room      │
                    │   goroutine   │
                    └───────┬───────┘
                            │
                    ┌───────▼───────┐
                    │ Game Engine   │
                    │   State       │
                    └───────────────┘
```

All game state mutations should occur through the room's event loop.

Run:

```bash
go test -race ./...
```

during development.

---

# 30. Deployment

## Backend Dockerfile

Use a multi-stage build.

Preferred structure:

```text
Go Build Stage
      ↓
Compile Binary
      ↓
Minimal Runtime Image
```

The backend should:

* Listen on port `8080`
* Read configuration from environment variables
* Support Redis URL/password
* Support production WebSocket connections
* Be compatible with Render/Koyeb

Environment variables:

```text
PORT=8080
REDIS_URL=...
REDIS_PASSWORD=...
ALLOWED_ORIGINS=...
```

---

# 31. Frontend Deployment

Build the Svelte frontend as a static application.

Target:

* Vercel
* Cloudflare Pages

Production WebSocket endpoint should be configurable through environment variables.

Example:

```text
PUBLIC_WS_URL=wss://api.example.com/ws
```

---

# 32. Production Architecture

```text
                    ┌──────────────────┐
                    │     Browser      │
                    │  Svelte + Canvas │
                    └────────┬─────────┘
                             │
                           WSS
                             │
                    ┌────────▼─────────┐
                    │    Go Server     │
                    │   WebSocket API  │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │      Redis       │
                    │     Upstash      │
                    └──────────────────┘
```

---

# 33. Development Priorities

Implement in this order:

```text
1. Project setup
        ↓
2. WebSocket connection
        ↓
3. Room creation/joining
        ↓
4. Player synchronization
        ↓
5. Basic game loop
        ↓
6. Board rendering
        ↓
7. Property system
        ↓
8. Full Monopoly rules
        ↓
9. Reconnection
        ↓
10. UI polish
        ↓
11. Testing
        ↓
12. Deployment
```

Do **not** start with visual polish before the authoritative game loop works.

---

# 34. Definition of Done

The project is considered complete when:

* [ ] Players can create rooms
* [ ] Players can join using a 6-character code
* [ ] 2–4 players can play together
* [ ] Players remain synchronized
* [ ] Server controls all game state
* [ ] Dice are generated server-side
* [ ] Players can move around all 40 tiles
* [ ] Properties can be purchased
* [ ] Rent is calculated correctly
* [ ] Houses/hotels work
* [ ] Utilities work
* [ ] Railroads work
* [ ] Chance cards work
* [ ] Community Chest cards work
* [ ] Jail works
* [ ] Bankruptcy works
* [ ] Victory condition works
* [ ] Player disconnection is handled (turn forfeits after 120s grace)
* [ ] Player reconnection reclaims their seat within 24 hours
* [ ] Game state survives backend restarts via persisted snapshots
* [ ] Invalid actions are rejected
* [ ] Bangla text renders correctly
* [ ] Canvas board works responsively
* [ ] Player movement is animated
* [ ] Four-player games work reliably
* [ ] Backend passes `go test -race ./...`
* [ ] Production frontend connects over WSS
* [ ] Production backend connects to Redis
* [ ] Application can be deployed successfully

---

# 35. Agent Instructions

When implementing this specification:

1. **Follow the tasks sequentially.**
2. Do not skip backend validation.
3. Keep the server authoritative.
4. Keep game rules out of the frontend.
5. Keep rendering logic separate from game state.
6. Use TypeScript types consistently.
7. Use Go structs that mirror the frontend state model.
8. Keep WebSocket protocol messages versionable and predictable.
9. Write tests for game rules before implementing complex UI.
10. Run the backend with the race detector during development.
11. Keep secrets and Redis credentials in environment variables.
12. Do not hardcode production WebSocket URLs.
13. Keep the board data in a single source of truth where practical.
14. Ensure all Bangla strings are UTF-8.
15. Prefer small, testable modules over a single large game engine.
16. Do not trust any state supplied by the client.
17. Make reconnection behavior deterministic.
18. Log important server-side game events for debugging.
19. Keep the initial implementation simple before adding animations and polish.
20. After each task, verify that the application still builds and runs before proceeding.

---

## Final Architecture

```text
                         MAHAJONI
                            │
             ┌──────────────┴──────────────┐
             │                             │
        FRONTEND                       BACKEND
             │                             │
      Svelte 5 + TS                    Go 1.22+
             │                             │
       Tailwind CSS                  WebSocket Hub
             │                             │
      HTML5 Canvas                     Rooms
             │                             │
      Game Store                     Game Engine
             │                             │
             └──────── WSS / JSON ─────────┘
                                           │
                                        Redis
                                      (Upstash)
```

**Primary principle:**

> **The frontend displays the game. The Go server decides what actually happens.**
