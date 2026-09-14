// WebSocket bridge (§19): connection, auto-reconnect, session tokens,
// event parsing → game store.
//
// Reconnect contract (§11): the server keeps each seat for 120s after a
// disconnect. This bridge persists roomId + playerId + sessionToken in
// localStorage so a reload / network drop can RECONNECT and retain the full
// play state (cash, position, properties) instead of joining as a new player.
import { gameStore } from '$lib/stores/gameStore.svelte';
import type { GameState, WsMessage } from '$lib/constants/boardData';

const SESSION_KEY = 'mahajoni.sessionToken';
const ROOM_KEY = 'mahajoni.roomId';
const PLAYER_KEY = 'mahajoni.playerId';
const NAME_KEY = 'mahajoni.playerName';

const WS_URL = 'wss://dhmk.onrender.com/ws';

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let manualClose = false;
let resumePending = false;

function getWsUrl(): string {
	return WS_URL;
}

export interface SavedSession {
	roomId: string;
	playerId: string;
	sessionToken: string;
	playerName: string | null;
}

function lsGet(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function lsSet(key: string, value: string) {
	try {
		localStorage.setItem(key, value);
	} catch {
		/* ignore */
	}
}

function lsDel(key: string) {
	try {
		localStorage.removeItem(key);
	} catch {
		/* ignore */
	}
}

export function loadSessionToken(): string | null {
	return lsGet(SESSION_KEY);
}

export function loadSavedSession(): SavedSession | null {
	const roomId = lsGet(ROOM_KEY);
	const sessionToken = lsGet(SESSION_KEY);
	const playerId = lsGet(PLAYER_KEY);
	if (!roomId || !sessionToken || !playerId) return null;
	return { roomId, playerId, sessionToken, playerName: lsGet(NAME_KEY) };
}

export function hasSavedSession(): boolean {
	return loadSavedSession() !== null;
}

function persistSession(roomId: string, playerId: string, token: string) {
	gameStore.roomCode = roomId;
	gameStore.playerId = playerId;
	gameStore.sessionToken = token;
	lsSet(ROOM_KEY, roomId);
	lsSet(PLAYER_KEY, playerId);
	lsSet(SESSION_KEY, token);
}

function saveSessionToken(token: string) {
	gameStore.sessionToken = token;
	lsSet(SESSION_KEY, token);
}

export function savePlayerName(name: string) {
	lsSet(NAME_KEY, name);
}

export function clearSavedSession() {
	lsDel(SESSION_KEY);
	lsDel(ROOM_KEY);
	lsDel(PLAYER_KEY);
	// Keep the player name so the rejoin form stays filled.
}

export function restoreSavedSessionToStore(): SavedSession | null {
	const saved = loadSavedSession();
	if (!saved) return null;
	gameStore.roomCode = saved.roomId;
	gameStore.playerId = saved.playerId;
	gameStore.sessionToken = saved.sessionToken;
	return saved;
}

export function connect(opts: { resume?: boolean } = {}): void {
	disconnect();
	manualClose = false;
	resumePending = opts.resume !== false && hasSavedSession();
	// Pre-fill the store so the UI can show "reconnecting…" instead of lobby.
	if (resumePending) restoreSavedSessionToStore();
	gameStore.connection = 'connecting';
	const target = getWsUrl();
	socket = new WebSocket(target);
	socket.onopen = () => {
		gameStore.connection = 'open';
		reconnectAttempts = 0;
		// A reloaded / reconnected socket is unbound: the first message must
		// be RECONNECT so the server rebinds the same seat (§8). The backend
		// also accepts ?roomId&sessionToken query params, but an explicit
		// RECONNECT message keeps the flow identical for fresh + resumed sockets.
		if (resumePending) {
			resumePending = false;
			const saved = loadSavedSession();
			if (saved) {
				const msg: WsMessage = {
					type: 'RECONNECT',
					payload: { roomId: saved.roomId, sessionToken: saved.sessionToken },
					sessionToken: saved.sessionToken
				};
				try {
					socket?.send(JSON.stringify(msg));
				} catch {
					/* writePump will report; reconnect loop retries */
				}
				return;
			}
		}
	};
	socket.onmessage = (ev) => handleMessage(ev.data);
	socket.onclose = () => {
		gameStore.connection = 'closed';
		socket = null;
		scheduleReconnect();
	};
	socket.onerror = () => {
		gameStore.lastError = 'সংযোগে সমস্যা হয়েছে।';
	};
}

/** Explicitly rejoin with the saved seat (used by the Lobby "rejoin" button). */
export function reconnectSaved(): void {
	const saved = loadSavedSession();
	if (!saved) {
		gameStore.lastError = 'পুরনো সেশন পাওয়া যায়নি। নতুন করে যোগ দিন।';
		return;
	}
	restoreSavedSessionToStore();
	if (!socket || socket.readyState !== WebSocket.OPEN) {
		connect({ resume: true });
		return;
	}
	send('RECONNECT', { roomId: saved.roomId, sessionToken: saved.sessionToken });
}

function scheduleReconnect() {
	if (manualClose) return;
	if (typeof window === 'undefined') return;
	reconnectAttempts += 1;
	const delay = Math.min(1000 * 2 ** Math.min(reconnectAttempts, 5), 15000);
	if (reconnectTimer) clearTimeout(reconnectTimer);
	reconnectTimer = setTimeout(() => connect({ resume: true }), delay);
}

export function send(type: string, payload: Record<string, unknown> = {}): void {
	if (!socket || socket.readyState !== WebSocket.OPEN) {
		// If we still hold a seat, keep the socket coming back so the 120s
		// window is not wasted on a dead socket.
		if (hasSavedSession() && gameStore.connection === 'closed') connect({ resume: true });
		gameStore.lastError = 'সংযোগ খোলা নেই। পুনরায় চেষ্টা করুন।';
		return;
	}
	const msg: WsMessage = { type, payload };
	if (gameStore.sessionToken) msg.sessionToken = gameStore.sessionToken;
	socket.send(JSON.stringify(msg));
}

/** Leave the room: free the seat server-side, drop the saved session so
 * auto-reconnect stops, and return to the lobby. Rejoining later uses the
 * normal join flow — the same player name plus the room code. */
export function leaveRoom(): void {
	// Best-effort seat release; the socket is closed below regardless.
	if (socket && socket.readyState === WebSocket.OPEN) {
		try {
			const msg: WsMessage = { type: 'LEAVE_ROOM', payload: {} };
			if (gameStore.sessionToken) msg.sessionToken = gameStore.sessionToken;
			socket.send(JSON.stringify(msg));
		} catch {
			/* ignore — disconnect covers it */
		}
	}
	clearSavedSession();
	gameStore.reset();
	// Let the LEAVE message flush before the close handshake tears down
	// the socket; the server also guards via __disconnect__ if it never lands.
	setTimeout(() => disconnect(), 250);
}

export function disconnect(): void {
	manualClose = true;
	if (reconnectTimer) {
		clearTimeout(reconnectTimer);
		reconnectTimer = null;
	}
	if (socket) {
		try {
			socket.close();
		} catch {
			/* ignore */
		}
		socket = null;
	}
	gameStore.connection = 'closed';
}

function applyGameState(next: GameState) {
	const prev = gameStore.gameState;
	gameStore.gameState = next;
	// A changed dice pair means a roll just landed: play the 1s shuffle for
	// the roller and every spectator, then reveal the authoritative faces.
	// Skip the animation on first load (no previous state to compare).
	if (
		prev &&
		next.status === 'IN_GAME' &&
		Array.isArray(next.dice) &&
		(prev.dice[0] !== next.dice[0] || prev.dice[1] !== next.dice[1])
	) {
		gameStore.settleDiceRoll([next.dice[0], next.dice[1]]);
	}
}

function handleMessage(raw: string) {
	let msg: WsMessage;
	try {
		msg = JSON.parse(raw);
	} catch {
		return;
	}
	const payload = (msg.payload ?? {}) as Record<string, unknown>;
	switch (msg.type) {
		case 'ROOM_CREATED': {
			const roomId = payload['roomId'];
			const playerId = payload['playerId'];
			const token = payload['sessionToken'];
			if (typeof roomId === 'string' && typeof playerId === 'string' && typeof token === 'string') {
				persistSession(roomId, playerId, token);
			} else {
				if (typeof roomId === 'string') gameStore.roomCode = roomId as string;
				if (typeof playerId === 'string') gameStore.playerId = playerId as string;
				if (typeof token === 'string') saveSessionToken(token as string);
			}
			break;
		}
		case 'GAME_STATE': {
			applyGameState(payload as unknown as GameState);
			if (gameStore.gameState?.roomId) {
				gameStore.roomCode = gameStore.gameState.roomId;
				lsSet(ROOM_KEY, gameStore.gameState.roomId);
			}
			// After a reload the store starts empty: re-attach our identity
			// from storage so isMyTurn / me / isHost resolve against the
			// restored seat.
			if (!gameStore.playerId) {
				const saved = loadSavedSession();
				if (saved && gameStore.gameState?.players?.some((p) => p.id === saved.playerId)) {
					gameStore.playerId = saved.playerId;
					gameStore.sessionToken = saved.sessionToken;
				}
			}
			break;
		}
		case 'ERROR': {
			const code = payload['code'];
			if (typeof payload['message'] === 'string')
				gameStore.lastError = payload['message'] as string;
			// The seat is gone server-side: drop the stale token so the next
			// attempt joins fresh instead of looping on a dead session.
			if (
				code === 'SESSION_EXPIRED' ||
				code === 'INVALID_SESSION' ||
				code === 'PLAYER_NOT_FOUND' ||
				code === 'ROOM_NOT_FOUND'
			) {
				clearSavedSession();
				if (reconnectTimer) {
					clearTimeout(reconnectTimer);
					reconnectTimer = null;
				}
			}
			break;
		}
		default: {
			// Task 5: handle DICE_ROLLED / PLAYER_MOVED / … animations.
			// Unknown state-carrying events fall through to a GAME_STATE refresh.
			if ('roomId' in payload && 'players' in payload) {
				applyGameState(payload as unknown as GameState);
			}
			break;
		}
	}
}
