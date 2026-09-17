import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { leaveRoom } from '$lib/server/rooms';
import { newPerf, finishPerf } from '$lib/server/perf';

// Explicit leave: frees the seat (properties return to bank, turn advances).
export const POST: RequestHandler = async ({ params, request }) => {
	const perf = newPerf('POST /api/rooms/[id]/leave');
	const body = await request.json().catch(() => ({}));
	await leaveRoom(params.id ?? '', String(body?.sessionToken ?? ''), perf);
	finishPerf(perf, { status: 200 });
	return json({ ok: true });
};
