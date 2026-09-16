// Polling bridge — replaces $lib/utils/websocket.ts (Go WS backend frozen).
// Game actions are POSTs to SvelteKit /api; state arrives via GET polling
// every 2s. No sockets => no half-open drops, no turn forfeits on blips.
// A failed poll keeps the last state on screen and retries; only an
// explicit leave frees the seat server-side.

import { gameStore } from '$lib/stores/gameStore.svelte';
import type { GameState } from '$lib/constants/boardData';

const SESSION_KEY = 'mahajoni.sessionToken';
const ROOM_KEY = 'mahajoni.roomId';
const PLAYER_KEY = 'mahajoni.playerId';
const NAME_KEY = 'mahajoni.playerName';
const LAST_ROOM_KEY = 'mahajoni.lastRoomId';

const POLL_MS_IN_GAME = 2000;
const POLL_MS_LOBBY = 4000;
const POLL_MS_FINISHED = 10000;

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

export function loadLastRoomId(): string | null {
	return lsGet(LAST_ROOM_KEY);
}

export function savePlayerName(name: string) {
	lsSet(NAME_KEY, name);
}

export function clearSavedSession() {
	lsDel(SESSION_KEY);
	lsDel(ROOM_KEY);
	lsDel(PLAYER_KEY);
}

function persistSession(roomId: string, playerId: string, token: string) {
	if (gameStore.roomCode !== roomId) latestStateVersion = -1;
	gameStore.roomCode = roomId;
	gameStore.playerId = playerId;
	gameStore.sessionToken = token;
	lsSet(ROOM_KEY, roomId);
	lsSet(PLAYER_KEY, playerId);
	lsSet(SESSION_KEY, token);
	lsSet(LAST_ROOM_KEY, roomId);
}

let pollTimer: ReturnType<typeof setInterval> | null = null;
let currentPollMs = 0;
let hiddenPaused = false;
let pollFailures = 0;
let netListenersAttached = false;
let stateRequest: Promise<boolean> | null = null;
let actionRequest: Promise<void> | null = null;
let latestStateVersion = -1;

export function getReconnectAttempts(): number {
	return pollFailures;
}

function pollIntervalFor(): number {
	const status = gameStore.gameState?.status;
	if (status === 'IN_GAME') return POLL_MS_IN_GAME;
	if (status === 'FINISHED') return POLL_MS_FINISHED;
	return POLL_MS_LOBBY;
}

function ensureNetListeners() {
	if (typeof window === 'undefined' || typeof document === 'undefined') return;
	if (netListenersAttached) return;
	netListenersAttached = true;
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') {
			// Mobile background / tab switch: stop the interval so a
			// hidden page costs 0 Redis reads. Timers are frozen/throttled
			// on mobile anyway — an explicit stop avoids a burst on return.
			if (pollTimer) {
				hiddenPaused = true;
				stopPolling();
			}
			return;
		}
		if (document.visibilityState !== 'visible') return;
		if (!hasSavedSession()) return;
		// Foreground again: resume at the right cadence + immediate refresh
		// so the board never shows stale state.
		hiddenPaused = false;
		startPolling();
		void fetchState();
	});
	window.addEventListener('online', () => {
		if (hasSavedSession()) {
			hiddenPaused = false;
			startPolling();
			void fetchState();
		}
	});
	window.addEventListener('offline', () => {
		gameStore.connection = 'closed';
		// No network: polling only burns retries + errors. Stop; the
		// online/visibility handlers restart it.
		stopPolling();
	});
	window.addEventListener('pageshow', (ev) => {
		// bfcache restore (mobile back-button) drops intervals without
		// rerunning mount logic — restart polling explicitly.
		const persisted = (ev as PageTransitionEvent).persisted;
		if (!persisted) return;
		if (!hasSavedSession()) return;
		if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
		hiddenPaused = false;
		startPolling();
		void fetchState();
	});
}

function applyState(state: GameState, version?: number) {
	if (version !== undefined) {
		if (version < latestStateVersion) return;
		latestStateVersion = version;
	}
	gameStore.gameState = state;
	if (state.roomId) {
		gameStore.roomCode = state.roomId;
		lsSet(ROOM_KEY, state.roomId);
		lsSet(LAST_ROOM_KEY, state.roomId);
	}
	if (!gameStore.playerId) {
		const saved = loadSavedSession();
		if (saved && state.players?.some((p) => p.id === saved.playerId)) {
			gameStore.playerId = saved.playerId;
			gameStore.sessionToken = saved.sessionToken;
		}
	}
	ensurePollingCadence();
}

async function fetchState(): Promise<boolean> {
	if (stateRequest) return stateRequest;
	stateRequest = fetchStateOnce();
	try {
		return await stateRequest;
	} finally {
		stateRequest = null;
	}
}

async function fetchStateOnce(): Promise<boolean> {
	const saved = loadSavedSession();
	if (!saved) return false;
	try {
		const res = await fetch(`/api/rooms/${encodeURIComponent(saved.roomId)}/state`, {
			headers: { authorization: `Bearer ${saved.sessionToken}` }
		});
		if (!res.ok) {
			if (res.status === 404) {
				const body = await res.json().catch(() => ({}));
				handleServerError(body);
			}
			throw new Error(`state ${res.status}`);
		}
		const body = await res.json();
		applyState(body.state as GameState, body.version as number);
		gameStore.connection = 'open';
		gameStore.lastError = null;
		pollFailures = 0;
		return true;
	} catch {
		pollFailures++;
		gameStore.connection = 'closed';
		return false;
	}
}

function startPolling() {
	ensureNetListeners();
	if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
		// Don't start a timer for a hidden page (mobile background):
		// it would be throttled anyway. The visibility handler resumes it.
		hiddenPaused = true;
		return;
	}
	const ms = pollIntervalFor();
	if (pollTimer) {
		if (currentPollMs === ms) return;
		clearInterval(pollTimer);
		pollTimer = null;
	}
	hiddenPaused = false;
	currentPollMs = ms;
	gameStore.connection = 'open';
	pollTimer = setInterval(() => {
		void fetchState();
	}, ms);
}

// After a state change (lobby → game → finished) the cadence may be stale:
// restart the timer at the new rate without an extra immediate fetch.
function ensurePollingCadence() {
	if (!pollTimer || hiddenPaused) return;
	const ms = pollIntervalFor();
	if (ms === currentPollMs) return;
	clearInterval(pollTimer);
	pollTimer = null;
	currentPollMs = ms;
	pollTimer = setInterval(() => {
		void fetchState();
	}, ms);
}

function stopPolling() {
	if (pollTimer) {
		clearInterval(pollTimer);
		pollTimer = null;
	}
	currentPollMs = 0;
}

function handleServerError(body: { code?: string; message?: string }) {
	const code = body.code;
	if (
		code === 'SESSION_EXPIRED' ||
		code === 'INVALID_SESSION' ||
		code === 'PLAYER_NOT_FOUND' ||
		code === 'ROOM_NOT_FOUND'
	) {
		clearSavedSession();
		stopPolling();
		gameStore.lastError =
			'আপনার আগের আসনটি আর নেই (মেয়াদ শেষ)। নিচে রুম কোড দিয়ে আবার যোগ দিন।';
	} else if (typeof body.message === 'string' && body.message) {
		gameStore.lastError = body.message;
	}
}

/** Create a room via SvelteKit API and start polling. */
export async function createRoom(
	playerName: string,
	settings?: { startCash: number; goSalary: number; extremeMode: boolean }
): Promise<boolean> {
	gameStore.connection = 'connecting';
	gameStore.lastError = null;
	try {
		const res = await fetch('/api/rooms', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ playerName, settings })
		});
		const body = await res.json().catch(() => ({}));
		if (!res.ok) {
			gameStore.connection = 'closed';
			gameStore.lastError = body.message ?? 'ঘর তৈরি করা যায়নি।';
			return false;
		}
		persistSession(body.roomId, body.playerId, body.sessionToken);
		applyState(body.state as GameState, body.version as number);
		gameStore.connection = 'open';
		startPolling();
		return true;
	} catch {
		gameStore.connection = 'closed';
		gameStore.lastError = 'সংযোগে সমস্যা হয়েছে।';
		return false;
	}
}

/** Join a room via SvelteKit API and start polling. */
export async function joinRoomByCode(roomId: string, playerName: string): Promise<boolean> {
	gameStore.connection = 'connecting';
	gameStore.lastError = null;
	try {
		const res = await fetch('/api/rooms/join', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ roomId, playerName })
		});
		const body = await res.json().catch(() => ({}));
		if (!res.ok) {
			gameStore.connection = 'closed';
			gameStore.lastError = body.message ?? 'ঘরে যোগ দেওয়া যায়নি।';
			return false;
		}
		persistSession(body.roomId, body.playerId, body.sessionToken);
		applyState(body.state as GameState, body.version as number);
		gameStore.connection = 'open';
		startPolling();
		return true;
	} catch {
		gameStore.connection = 'closed';
		gameStore.lastError = 'সংযোগে সমস্যা হয়েছে।';
		return false;
	}
}

/** Rejoin with a saved seat (lobby button / reload). */
export async function reconnectSaved(): Promise<boolean> {
	const saved = loadSavedSession();
	if (!saved) {
		gameStore.lastError = 'পুরনো সেশন পাওয়া যায়নি। নতুন করে যোগ দিন।';
		return false;
	}
	gameStore.roomCode = saved.roomId;
	gameStore.playerId = saved.playerId;
	gameStore.sessionToken = saved.sessionToken;
	gameStore.connection = 'connecting';
	try {
		const res = await fetch('/api/rooms/rejoin', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ roomId: saved.roomId, sessionToken: saved.sessionToken })
		});
		const body = await res.json().catch(() => ({}));
		if (!res.ok) {
			handleServerError(body);
			gameStore.connection = 'closed';
			if (!hasSavedSession()) gameStore.reset();
			return false;
		}
		persistSession(body.roomId, body.playerId, body.sessionToken);
		applyState(body.state as GameState, body.version as number);
		gameStore.connection = 'open';
		startPolling();
		return true;
	} catch {
		gameStore.connection = 'closed';
		startPolling();
		void fetchState();
		return false;
	}
}

/** Resume polling after reload when a session exists. */
export function connect(_opts: { resume?: boolean } = {}): void {
	if (!hasSavedSession()) return;
	gameStore.connection = 'connecting';
	const saved = loadSavedSession();
	if (saved) {
		gameStore.roomCode = saved.roomId;
		gameStore.playerId = saved.playerId;
		gameStore.sessionToken = saved.sessionToken;
	}
	startPolling();
	void fetchState();
}

/** Force an immediate state refresh (retry button / foreground). */
export function retryNow(): void {
	if (!hasSavedSession()) return;
	gameStore.connection = 'connecting';
	void fetchState();
}

/** Send a game action (ROLL_DICE, BUY_PROPERTY, …) via POST. */
export async function send(type: string, payload: Record<string, unknown> = {}): Promise<void> {
	if (actionRequest) return actionRequest;
	actionRequest = sendOnce(type, payload);
	try {
		await actionRequest;
	} finally {
		actionRequest = null;
	}
}

async function sendOnce(type: string, payload: Record<string, unknown> = {}): Promise<void> {
	const saved = loadSavedSession();
	if (!saved) {
		gameStore.lastError = 'ঘরে যোগ দিন।';
		return;
	}
	try {
		const res = await fetch(`/api/rooms/${encodeURIComponent(saved.roomId)}/action`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ type, payload, sessionToken: saved.sessionToken })
		});
		const body = await res.json().catch(() => ({}));
		if (!res.ok) {
			handleServerError(body);
			return;
		}
		applyState(body.state as GameState, body.version as number);
		gameStore.lastError = null;
	} catch {
		gameStore.lastError = 'সংযোগে সমস্যা হয়েছে।';
	}
}

/** Leave the room: frees the seat server-side and stops polling. */
export async function leaveRoom(): Promise<void> {
	const saved = loadSavedSession();
	stopPolling();
	if (saved) {
		try {
			await fetch(`/api/rooms/${encodeURIComponent(saved.roomId)}/leave`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ sessionToken: saved.sessionToken })
			});
		} catch {
			/* best effort */
		}
	}
	clearSavedSession();
	gameStore.reset();
	gameStore.connection = 'idle';
}

export function disconnect(): void {
	stopPolling();
	gameStore.connection = 'closed';
}
