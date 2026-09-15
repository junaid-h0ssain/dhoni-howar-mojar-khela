// In-memory room store for the polling version.
// NOTE: this lives in server memory. Works for local dev and single-instance
// deploys. On Vercel serverless (multiple/cold instances) rooms can vanish —
// move to Upstash Redis REST later if that bites (same key shape as Go:
// session:<token> -> {roomId, playerId}, game:<roomId> -> snapshot).
import type { GameState } from '$lib/constants/boardData';
import {
	newRoomState, addPlayer, removePlayer, findPlayer,
	startGame, rollDice, autoEndIfNoAction, buyProperty,
	buildHouse, endTurn, payJailFine, useJailCard,
	EngineError, type RoomState
} from './engine';

interface Room {
	id: string;
	rs: RoomState;
	sessions: Map<string, string>; // sessionToken -> playerId
	createdAt: number;
}

declare global {
	// eslint-disable-next-line no-var
	var __mahajoniRooms: Map<string, Room> | undefined;
}

function roomMap(): Map<string, Room> {
	if (!globalThis.__mahajoniRooms) globalThis.__mahajoniRooms = new Map();
	return globalThis.__mahajoniRooms;
}

export function generateRoomCode(): string {
	const rooms = roomMap();
	for (let i = 0; i < 50; i++) {
		const code = String(Math.floor(1000 + Math.random() * 9000));
		if (!rooms.has(code)) return code;
	}
	return String(Date.now()).slice(-4);
}

export function uid(): string {
	return 'xxxxxxxx-xxxx-4xxx'.replace(/x/g, () =>
		Math.floor(Math.random() * 16).toString(16)
	) + Date.now().toString(16).slice(-4);
}

export function getRoom(id: string): Room | undefined {
	if (!id) return undefined;
	return roomMap().get(id.trim().toUpperCase());
}

export function createRoom(playerName: string): { room: Room; playerId: string; token: string } {
	const name = playerName.trim();
	if (!name) throw new EngineError('INVALID_NAME', 'আপনার নাম দিন।');
	const id = generateRoomCode();
	const rs = newRoomState(id, '');
	const room: Room = { id, rs, sessions: new Map(), createdAt: Date.now() };
	roomMap().set(id, room);
	const playerId = uid();
	room.rs.state.hostId = playerId;
	addPlayer(rs, playerId, name);
	rs.state.logs.push(`${name} ঘর তৈরি করেছেন।`);
	const token = uid() + uid().slice(0, 8);
	room.sessions.set(token, playerId);
	rs.version++;
	touch(room, playerId);
	return { room, playerId, token };
}

export function joinRoom(roomId: string, playerName: string): { room: Room; playerId: string; token: string } {
	const name = playerName.trim();
	if (!name) throw new EngineError('INVALID_NAME', 'আপনার নাম দিন।');
	const room = getRoom(roomId);
	if (!room) throw new EngineError('ROOM_NOT_FOUND', 'ঘর পাওয়া যায়নি।');
	const s = room.rs.state;
	if (s.status === 'FINISHED') throw new EngineError('GAME_FINISHED', 'খেলা শেষ হয়ে গেছে। নতুন ঘর তৈরি করুন।');
	if (s.status !== 'LOBBY' && s.status !== 'IN_GAME') {
		throw new EngineError('GAME_ALREADY_STARTED', 'এই ঘরে এখন যোগ দেওয়া যাবে না।');
	}
	if (s.players.length >= 10) throw new EngineError('ROOM_FULL', 'ঘর পূর্ণ হয়ে গেছে।');
	const playerId = uid();
	const p = addPlayer(room.rs, playerId, name);
	if (s.status === 'IN_GAME') s.logs.push(`${p.name} খেলার মাঝে যোগ দিয়েছেন।`);
	else s.logs.push(`${p.name} ঘরে যোগ দিয়েছেন।`);
	const token = uid() + uid().slice(0, 8);
	room.sessions.set(token, playerId);
	room.rs.version++;
	touch(room, playerId);
	return { room, playerId, token };
}

export function playerIdFor(room: Room, token: string): string | undefined {
	if (!token) return undefined;
	return room.sessions.get(token);
}

export function touch(room: Room, playerId: string): void {
	room.rs.lastSeen[playerId] = Date.now();
	const p = findPlayer(room.rs.state, playerId);
	if (p) p.isConnected = true;
}

export function toClient(room: Room): { state: GameState; version: number } {
	return { state: room.rs.state, version: room.rs.version };
}

function bump(room: Room): void {
	room.rs.version++;
}

export type ActionType =
	| 'START_GAME' | 'ROLL_DICE' | 'BUY_PROPERTY' | 'BUILD_HOUSE'
	| 'END_TURN' | 'PAY_JAIL_FINE' | 'USE_JAIL_CARD';

export function applyAction(
	room: Room, token: string, type: ActionType, payload: Record<string, unknown> = {}
): void {
	const playerId = playerIdFor(room, token);
	if (!playerId) throw new EngineError('INVALID_SESSION', 'সেশন পাওয়া যায়নি। আবার যোগ দিন।');
	const p = findPlayer(room.rs.state, playerId);
	if (!p) throw new EngineError('PLAYER_NOT_FOUND', 'খেলোয়াড় পাওয়া যায়নি।');
	if (room.rs.state.status === 'FINISHED' && type !== 'START_GAME') {
		throw new EngineError('GAME_FINISHED', 'খেলা শেষ হয়ে গেছে।');
	}
	touch(room, playerId);
	switch (type) {
		case 'START_GAME': {
			if (room.rs.state.hostId !== playerId) {
				throw new EngineError('NOT_HOST', 'শুধু হোস্ট খেলা শুরু করতে পারবেন।');
			}
			startGame(room.rs);
			break;
		}
		case 'ROLL_DICE': {
			const d1 = num(payload['d1']);
			const d2 = num(payload['d2']);
			const dice = payload['dice'];
			let forced: { d1: number; d2: number } | undefined;
			if (Array.isArray(dice) && dice.length === 2) {
				const a = Number(dice[0]); const b = Number(dice[1]);
				if (!Number.isInteger(a) || !Number.isInteger(b)) {
					throw new EngineError('INVALID_DICE', 'পাশার মান ১-৬ এর মধ্যে হতে হবে।');
				}
				forced = { d1: a, d2: b };
			} else if (d1 !== undefined || d2 !== undefined) {
				if (d1 === undefined || d2 === undefined) {
					throw new EngineError('INVALID_DICE', 'পাশার মান ১-৬ এর মধ্যে হতে হবে।');
				}
				forced = { d1, d2 };
			}
			rollDice(room.rs, playerId, forced);
			autoEndIfNoAction(room.rs, playerId);
			break;
		}
		case 'BUY_PROPERTY': {
			const tileId = int(payload['tileId'], -1);
			buyProperty(room.rs, playerId, tileId);
			autoEndIfNoAction(room.rs, playerId);
			break;
		}
		case 'BUILD_HOUSE': {
			const tileId = int(payload['tileId'], -1);
			buildHouse(room.rs, playerId, tileId);
			autoEndIfNoAction(room.rs, playerId);
			break;
		}
		case 'END_TURN':
			endTurn(room.rs, playerId);
			break;
		case 'PAY_JAIL_FINE':
			payJailFine(room.rs, playerId);
			break;
		case 'USE_JAIL_CARD':
			useJailCard(room.rs, playerId);
			break;
		default:
			throw new EngineError('UNKNOWN_ACTION', 'অজানা অ্যাকশন।');
	}
	bump(room);
}

export function leaveRoom(room: Room, token: string): void {
	const playerId = playerIdFor(room, token);
	if (!playerId) return;
	const removed = removePlayer(room.rs, playerId);
	room.sessions.delete(token);
	delete room.rs.lastSeen[playerId];
	if (removed) room.rs.state.logs.push(`${removed.name} ঘর ছেড়ে গেছেন।`);
	if (room.rs.state.players.length === 0) {
		roomMap().delete(room.id);
		return;
	}
	bump(room);
}

function num(v: unknown): number | undefined {
	if (typeof v === 'number' && Number.isInteger(v)) return v;
	return undefined;
}

function int(v: unknown, fallback: number): number {
	if (typeof v === 'number' && Number.isInteger(v)) return v;
	return fallback;
}
