// WebSocket bridge (§19): connection, auto-reconnect, session tokens,
// event parsing → game store. Full protocol handling lands in Task 5;
// this skeleton already supports create/join/reconnect + GAME_STATE sync.
import { gameStore } from '$lib/stores/gameStore.svelte';
import type { GameState, WsMessage } from '$lib/constants/boardData';

const SESSION_KEY = 'mahajoni.sessionToken';
const WS_URL = 'wss://dhmk.onrender.com/ws';

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let manualClose = false;

function getWsUrl(): string {
	return WS_URL;
}

export function loadSessionToken(): string | null {
	try {
		return localStorage.getItem(SESSION_KEY);
	} catch {
		return null;
	}
}

function saveSessionToken(token: string) {
	gameStore.sessionToken = token;
	try {
		localStorage.setItem(SESSION_KEY, token);
	} catch {
		/* ignore */
	}
}

export function connect(): void {
	disconnect();
	manualClose = false;
	gameStore.connection = 'connecting';
	const target = getWsUrl();
	socket = new WebSocket(target);
	socket.onopen = () => {
		gameStore.connection = 'open';
		reconnectAttempts = 0;
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

function scheduleReconnect() {
	if (manualClose) return;
	if (typeof window === 'undefined') return;
	reconnectAttempts += 1;
	const delay = Math.min(1000 * 2 ** Math.min(reconnectAttempts, 5), 15000);
	if (reconnectTimer) clearTimeout(reconnectTimer);
	reconnectTimer = setTimeout(() => connect(), delay);
}

export function send(type: string, payload: Record<string, unknown> = {}): void {
	if (!socket || socket.readyState !== WebSocket.OPEN) {
		gameStore.lastError = 'সংযোগ খোলা নেই। পুনরায় চেষ্টা করুন।';
		return;
	}
	const msg: WsMessage = { type, payload };
	if (gameStore.sessionToken) msg.sessionToken = gameStore.sessionToken;
	socket.send(JSON.stringify(msg));
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
			if (typeof payload['roomId'] === 'string') gameStore.roomCode = payload['roomId'] as string;
			if (typeof payload['playerId'] === 'string')
				gameStore.playerId = payload['playerId'] as string;
			if (typeof payload['sessionToken'] === 'string')
				saveSessionToken(payload['sessionToken'] as string);
			break;
		}
		case 'GAME_STATE': {
			gameStore.gameState = payload as unknown as GameState;
			if (gameStore.gameState?.roomId) gameStore.roomCode = gameStore.gameState.roomId;
			break;
		}
		case 'ERROR': {
			if (typeof payload['message'] === 'string')
				gameStore.lastError = payload['message'] as string;
			break;
		}
		default: {
			// Task 5: handle DICE_ROLLED / PLAYER_MOVED / … animations.
			// Unknown state-carrying events fall through to a GAME_STATE refresh.
			if ('roomId' in payload && 'players' in payload) {
				gameStore.gameState = payload as unknown as GameState;
			}
			break;
		}
	}
}
