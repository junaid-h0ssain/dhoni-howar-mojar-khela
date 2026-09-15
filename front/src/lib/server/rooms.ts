// Room operations for the polling version, backed by kv.ts.
// Upstash REST in production (shared across Vercel instances — rooms survive
// deploys and scale), in-memory fallback for local dev.
import type { GameState } from '$lib/constants/boardData';
import {
	newRoomState, addPlayer, removePlayer, findPlayer,
	startGame, rollDice, autoEndIfNoAction, buyProperty,
	buildHouse, endTurn, payJailFine, useJailCard,
	EngineError, type RoomState
} from './engine';
import { kvGet, kvSet, kvDel, type PersistedRoom } from './kv';

interface Room {
	id: string;
	rs: RoomState;
	sessions: Map<string, string>; // sessionToken -> playerId
	createdAt: number;
}

function toRoom(id: string, p: PersistedRoom): Room {
	return { id, rs: p.rs, sessions: new Map(p.sessions), createdAt: p.createdAt };
}

function persist(room: Room): PersistedRoom {
	return { rs: room.rs, sessions: [...room.sessions.entries()], createdAt: room.createdAt };
}

async function save(room: Room): Promise<void> {
	await kvSet(room.id, persist(room));
}

export function uid(): string {
	return 'xxxxxxxx-xxxx-4xxx'.replace(/x/g, () =>
		Math.floor(Math.random() * 16).toString(16)
	) + Date.now().toString(16).slice(-4);
}

export async function getRoom(id: string): Promise<Room | undefined> {
	if (!id) return undefined;
	const norm = id.trim().toUpperCase();
	const p = await kvGet(norm);
	if (!p) return undefined;
	return toRoom(norm, p);
}

async function generateRoomCode(): Promise<string> {
	for (let i = 0; i < 50; i++) {
		const code = String(Math.floor(1000 + Math.random() * 9000));
		if (!(await kvGet(code))) return code;
	}
	return String(Date.now()).slice(-4);
}

export async function createRoom(playerName: string): Promise<{ room: Room; playerId: string; token: string }> {
	const name = playerName.trim();
	if (!name) throw new EngineError('INVALID_NAME', 'আপনার নাম দিন।');
	const id = await generateRoomCode();
	const rs = newRoomState(id, '');
	const room: Room = { id, rs, sessions: new Map(), createdAt: Date.now() };
	const playerId = uid();
	room.rs.state.hostId = playerId;
	addPlayer(rs, playerId, name);
	rs.state.logs.push(`${name} ঘর তৈরি করেছেন।`);
	const token = uid() + uid().slice(0, 8);
	room.sessions.set(token, playerId);
	rs.version++;
	touch(room, playerId);
	await save(room);
	return { room, playerId, token };
}

export async function joinRoom(roomId: string, playerName: string): Promise<{ room: Room; playerId: string; token: string }> {
	const name = playerName.trim();
	if (!name) throw new EngineError('INVALID_NAME', 'আপনার নাম দিন।');
	const room = await getRoom(roomId);
	if (!room) throw new EngineError('ROOM_NOT_FOUND', 'ঘর পাওয়া যায়নি।');
	const s = room.rs.state;
	if (s.status === 'FINISHED') throw new EngineError('GAME_FINISHED', 'খেলা শেষ হয়ে গেছে। নতুন ঘর তৈরি করুন।');
	if (s.status !== 'LOBBY' && s.status !== 'IN_GAME') {
		throw new EngineError('GAME_ALREADY_STARTED', 'এই ঘরে এখন যোগ দেওয়া যাবে না।');
	}
	if (s.players.length >= 10) throw new EngineError('ROOM_FULL', 'ঘর পূর্ণ হয়ে গেছে।');
	// Option 1 — unique names per room + auto-reclaim: a returning player with
	// the same name (case-insensitive) rebinds to their existing seat instead
	// of starting fresh, so cash/position/properties resume where they left.
	const existing = s.players.find((p) => p.name.trim().toLowerCase() === name.toLowerCase());
	if (existing) {
		if (existing.isBankrupt) {
			throw new EngineError('SEAT_BANKRUPT', 'এই নামের আসনটি দেউলিয়া হয়ে গেছে। অন্য নামে যোগ দিন।');
		}
		const token = uid() + uid().slice(0, 8);
		room.sessions.set(token, existing.id);
		room.rs.version++;
		touch(room, existing.id);
		s.logs.push(`${existing.name} পুনরায় যোগ দিয়েছেন।`);
		await save(room);
		return { room, playerId: existing.id, token };
	}
	const playerId = uid();
	const p = addPlayer(room.rs, playerId, name);
	if (s.status === 'IN_GAME') s.logs.push(`${p.name} খেলার মাঝে যোগ দিয়েছেন।`);
	else s.logs.push(`${p.name} ঘরে যোগ দিয়েছেন।`);
	const token = uid() + uid().slice(0, 8);
	room.sessions.set(token, playerId);
	room.rs.version++;
	touch(room, playerId);
	await save(room);
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

export async function applyAction(
	room: Room, token: string, type: ActionType, payload: Record<string, unknown> = {}
): Promise<void> {
	const playerId = playerIdFor(room, token);
	if (!playerId) throw new EngineError('INVALID_SESSION', 'সেশন পাওয়া যায়নি। আবার যোগ দিন।');
	const p = findPlayer(room.rs.state, playerId);
	if (!p) throw new EngineError('PLAYER_NOT_FOUND', 'খেলোয়াড় পাওয়া যায়নি।');
	if (room.rs.state.status === 'FINISHED') {
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
	await save(room);
}

export async function heartbeat(room: Room, token: string): Promise<void> {
	const playerId = playerIdFor(room, token);
	if (!playerId) return;
	// Presence only — kvGet already refreshed the TTL, so skip the write and
	// keep the 2s polls read-cheap.
	touch(room, playerId);
}

export async function leaveRoom(room: Room, token: string): Promise<void> {
	const playerId = playerIdFor(room, token);
	if (!playerId) return;
	const removed = removePlayer(room.rs, playerId);
	room.sessions.delete(token);
	delete room.rs.lastSeen[playerId];
	if (removed) room.rs.state.logs.push(`${removed.name} ঘর ছেড়ে গেছেন।`);
	if (room.rs.state.players.length === 0) {
		await kvDel(room.id);
		return;
	}
	bump(room);
	await save(room);
}

function num(v: unknown): number | undefined {
	if (typeof v === 'number' && Number.isInteger(v)) return v;
	return undefined;
}

function int(v: unknown, fallback: number): number {
	if (typeof v === 'number' && Number.isInteger(v)) return v;
	return fallback;
}
