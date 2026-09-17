// Perf measurement for the polling backend (temporary, measure-first).
// Every API route creates one PerfCtx per request, threads it through
// rooms.ts -> kv.ts, and logs a single structured JSON line on finish:
//
//   [mahajoni-perf] {"route":"...","action":"...","ms":123,...}
//
// On Vercel these lines land in the function logs. To get p50/p95 for one
// 4-player game: filter Vercel logs for `[mahajoni-perf]`, copy the JSON
// payloads, and run them through any percentile calc (see note at bottom).
// Per-Upstash-call lines are only emitted when MAHAJONI_PERF_VERBOSE=1.
import { env } from '$env/dynamic/private';

export interface PerfCtx {
	rid: string;
	route: string;
	t0: number;
	upstashCalls: number; // pipeline() HTTP roundtrips
	upstashCmds: number; // redis commands inside pipelines
	upstashMs: number; // sum of pipeline roundtrip time
	lockAttempts: number; // withRoomLock iterations (contention signal)
}

export function newPerf(route: string): PerfCtx {
	let rid = '';
	try {
		rid = crypto.randomUUID().slice(0, 8);
	} catch {
		rid = Math.random().toString(36).slice(2, 10);
	}
	return { rid, route, t0: Date.now(), upstashCalls: 0, upstashCmds: 0, upstashMs: 0, lockAttempts: 0 };
}

/** Called by kv.ts pipeline() — aggregates, no per-call log by default. */
export function noteUpstash(
	ctx: PerfCtx | undefined,
	cmdNames: string[],
	ms: number,
	ok: boolean
): void {
	if (ctx) {
		ctx.upstashCalls++;
		ctx.upstashCmds += cmdNames.length;
		ctx.upstashMs += ms;
	}
	if ((env.MAHAJONI_PERF_VERBOSE ?? '') === '1') {
		console.log(
			`[mahajoni-perf-call] ${JSON.stringify({ rid: ctx?.rid ?? '-', cmds: cmdNames, ms: Math.round(ms), ok })}`
		);
	}
}

/** One line per request. Keep the payload flat for easy percentile math. */
export function finishPerf(
	ctx: PerfCtx,
	extra: { action?: string; status: number; err?: string } = { status: 200 }
): void {
	console.log(
		`[mahajoni-perf] ${JSON.stringify({
			rid: ctx.rid,
			route: ctx.route,
			action: extra.action ?? '-',
			status: extra.status,
			ms: Date.now() - ctx.t0,
			upstashCalls: ctx.upstashCalls,
			upstashCmds: ctx.upstashCmds,
			upstashMs: Math.round(ctx.upstashMs),
			lockAttempts: ctx.lockAttempts,
			...(extra.err ? { err: extra.err } : {})
		})}`
	);
}

// Offline percentile math (paste log JSON array into node):
//   const a = [...]; const q = (p) => { const s = [...a].sort((x,y)=>x-y);
//   return s[Math.min(s.length-1, Math.floor(p*s.length))]; };
//   q(0.5); q(0.95);
