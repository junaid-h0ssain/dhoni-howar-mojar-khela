// Persistent room storage for the polling version.
// Uses Upstash Redis REST when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
// are set (Vercel production: many serverless instances share one store, so
// rooms stop vanishing). Falls back to in-process memory for local dev.
// Same 24h sliding TTL the Go backend used: every read/write refreshes it.
// Plain fetch, no extra dependencies.
import { env } from '$env/dynamic/private';
import type { RoomState } from './engine';
import { noteUpstash, type PerfCtx } from './perf';

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
	if ((!url || !token) && env.VERCEL === '1') {
		throw new Error('Upstash Redis must be configured in Vercel.');
	}
	return url && token ? { url, token } : null;
}

export function kvMode(): 'upstash' | 'memory' {
	return restConfig() ? 'upstash' : 'memory';
}

async function pipeline(
	cmds: unknown[][],
	ctx?: PerfCtx
): Promise<Array<{ result: unknown }>> {
	const cfg = restConfig();
	if (!cfg) throw new Error('upstash not configured');
	const t0 = Date.now();
	try {
		const res = await fetch(`${cfg.url}/pipeline`, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${cfg.token}`,
				'content-type': 'application/json'
			},
			body: JSON.stringify(cmds)
		});
		if (!res.ok) {
			noteUpstash(ctx, cmds.map((c) => String(c[0])), Date.now() - t0, false);
			throw new Error(`upstash ${res.status}`);
		}
		const out = (await res.json()) as Array<{ result: unknown }>;
		noteUpstash(ctx, cmds.map((c) => String(c[0])), Date.now() - t0, true);
		return out;
	} catch (e) {
		if (e instanceof Error && e.message.startsWith('upstash ')) throw e;
		noteUpstash(ctx, cmds.map((c) => String(c[0])), Date.now() - t0, false);
		throw e;
	}
}

function key(id: string): string {
	return KEY_PREFIX + id.trim().toUpperCase();
}

// --- In-memory fallback (local dev without Upstash) ---

declare global {
	// eslint-disable-next-line no-var
	var __mahajoniKv: Map<string, { data: PersistedRoom; expiresAt: number }> | undefined;
	// eslint-disable-next-line no-var
	var __mahajoniLocks: Map<string, { token: string; expiresAt: number }> | undefined;
}

function memMap(): Map<string, { data: PersistedRoom; expiresAt: number }> {
	if (!globalThis.__mahajoniKv) globalThis.__mahajoniKv = new Map();
	return globalThis.__mahajoniKv;
}

function memLocks(): Map<string, { token: string; expiresAt: number }> {
	if (!globalThis.__mahajoniLocks) globalThis.__mahajoniLocks = new Map();
	return globalThis.__mahajoniLocks;
}

export async function kvGet(id: string, ctx?: PerfCtx): Promise<PersistedRoom | null> {
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
		const [got] = await pipeline(
			[
				['GET', k],
				['EXPIRE', k, TTL_SECONDS]
			],
			ctx
		);
		const raw = got?.result as string | null;
		if (!raw) return null;
		return JSON.parse(raw) as PersistedRoom;
	} catch (e) {
		console.error(`kvGet ${id} failed:`, e);
		throw new Error('Storage unavailable. Try again.');
	}
}

export async function kvSet(id: string, data: PersistedRoom, ctx?: PerfCtx): Promise<void> {
	const k = key(id);
	if (!restConfig()) {
		memMap().set(k, { data, expiresAt: Date.now() + TTL_SECONDS * 1000 });
		return;
	}
	try {
		await pipeline([['SET', k, JSON.stringify(data), 'EX', TTL_SECONDS]], ctx);
	} catch (e) {
		console.error(`kvSet ${id} failed:`, e);
		throw new Error('Storage unavailable. Try again.');
	}
}

export async function kvSetIfAbsent(id: string, data: PersistedRoom, ctx?: PerfCtx): Promise<boolean> {
	const k = key(id);
	if (!restConfig()) {
		if (memMap().has(k)) return false;
		memMap().set(k, { data, expiresAt: Date.now() + TTL_SECONDS * 1000 });
		return true;
	}
	try {
		const [result] = await pipeline([['SET', k, JSON.stringify(data), 'NX', 'EX', TTL_SECONDS]], ctx);
		return result?.result === 'OK';
	} catch (e) {
		console.error(`kvSetIfAbsent ${id} failed:`, e);
		throw new Error('Storage unavailable. Try again.');
	}
}

export async function kvTryLock(id: string, token: string, ttlMs: number, ctx?: PerfCtx): Promise<boolean> {
	const k = `${key(id)}:lock`;
	if (!restConfig()) {
		const existing = memLocks().get(k);
		if (existing && existing.expiresAt > Date.now()) return false;
		memLocks().set(k, { token, expiresAt: Date.now() + ttlMs });
		return true;
	}
	try {
		const [result] = await pipeline([['SET', k, token, 'NX', 'PX', ttlMs]], ctx);
		return result?.result === 'OK';
	} catch (e) {
		console.error(`kvTryLock ${id} failed:`, e);
		throw new Error('Storage unavailable. Try again.');
	}
}

export async function kvReleaseLock(id: string, token: string, ctx?: PerfCtx): Promise<void> {
	const k = `${key(id)}:lock`;
	if (!restConfig()) {
		if (memLocks().get(k)?.token === token) memLocks().delete(k);
		return;
	}
	try {
		await pipeline(
			[[
				'EVAL',
				'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) end return 0',
				1,
				k,
				token
			]],
			ctx
		);
	} catch (e) {
		console.error(`kvReleaseLock ${id} failed:`, e);
	}
}

export async function kvDel(id: string, ctx?: PerfCtx): Promise<void> {
	const k = key(id);
	if (!restConfig()) {
		memMap().delete(k);
		return;
	}
	try {
		await pipeline([['DEL', k]], ctx);
	} catch (e) {
		console.error(`kvDel ${id} failed:`, e);
		throw new Error('Storage unavailable. Try again.');
	}
}
