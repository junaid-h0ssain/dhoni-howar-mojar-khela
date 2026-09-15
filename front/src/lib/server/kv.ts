// Persistent room storage for the polling version.
// Uses Upstash Redis REST when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
// are set (Vercel production: many serverless instances share one store, so
// rooms stop vanishing). Falls back to in-process memory for local dev.
// Same 24h sliding TTL the Go backend used: every read/write refreshes it.
// Plain fetch, no extra dependencies.
import { env } from '$env/dynamic/private';
import type { RoomState } from './engine';

export interface PersistedRoom {
	rs: RoomState;
	sessions: Array<[string, string]>; // [sessionToken, playerId]
	createdAt: number;
}

const KEY_PREFIX = 'poll:room:';
const TTL_SECONDS = 24 * 60 * 60;

function restConfig(): { url: string; token: string } | null {
	const url = (env.UPSTASH_REDIS_REST_URL ?? '').trim().replace(/\/+$/, '');
	const token = (env.UPSTASH_REDIS_REST_TOKEN ?? '').trim();
	return url && token ? { url, token } : null;
}

export function kvMode(): 'upstash' | 'memory' {
	return restConfig() ? 'upstash' : 'memory';
}

async function pipeline(cmds: unknown[][]): Promise<Array<{ result: unknown }>> {
	const cfg = restConfig();
	if (!cfg) throw new Error('upstash not configured');
	const res = await fetch(`${cfg.url}/pipeline`, {
		method: 'POST',
		headers: {
			authorization: `Bearer ${cfg.token}`,
			'content-type': 'application/json'
		},
		body: JSON.stringify(cmds)
	});
	if (!res.ok) throw new Error(`upstash ${res.status}`);
	return res.json();
}

function key(id: string): string {
	return KEY_PREFIX + id.trim().toUpperCase();
}

// --- In-memory fallback (local dev without Upstash) ---

declare global {
	// eslint-disable-next-line no-var
	var __mahajoniKv: Map<string, { data: PersistedRoom; expiresAt: number }> | undefined;
}

function memMap(): Map<string, { data: PersistedRoom; expiresAt: number }> {
	if (!globalThis.__mahajoniKv) globalThis.__mahajoniKv = new Map();
	return globalThis.__mahajoniKv;
}

export async function kvGet(id: string): Promise<PersistedRoom | null> {
	const k = key(id);
	if (!restConfig()) {
		const entry = memMap().get(k);
		if (!entry) return null;
		if (Date.now() > entry.expiresAt) {
			memMap().delete(k);
			return null;
		}
		entry.expiresAt = Date.now() + TTL_SECONDS * 1000;
		return entry.data;
	}
	try {
		const [got] = await pipeline([
			['GET', k],
			['EXPIRE', k, TTL_SECONDS]
		]);
		const raw = got?.result as string | null;
		if (!raw) return null;
		return JSON.parse(raw) as PersistedRoom;
	} catch (e) {
		console.error(`kvGet ${id} failed:`, e);
		throw new Error('Storage unavailable. Try again.');
	}
}

export async function kvSet(id: string, data: PersistedRoom): Promise<void> {
	const k = key(id);
	if (!restConfig()) {
		memMap().set(k, { data, expiresAt: Date.now() + TTL_SECONDS * 1000 });
		return;
	}
	try {
		await pipeline([['SET', k, JSON.stringify(data), 'EX', TTL_SECONDS]]);
	} catch (e) {
		console.error(`kvSet ${id} failed:`, e);
		throw new Error('Storage unavailable. Try again.');
	}
}

export async function kvDel(id: string): Promise<void> {
	const k = key(id);
	if (!restConfig()) {
		memMap().delete(k);
		return;
	}
	try {
		await pipeline([['DEL', k]]);
	} catch (e) {
		console.error(`kvDel ${id} failed:`, e);
	}
}
