import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRoom, playerIdFor, touch, toClient } from '$lib/server/rooms';
import { EngineError } from '$lib/server/engine';
import { newPerf, finishPerf } from '$lib/server/perf';

// Rejoin with a saved seat: validates the session token and returns the
// current state. No sockets, so nothing to rebind — just prove the seat.
export const POST: RequestHandler = async ({ request }) => {
	const perf = newPerf('POST /api/rooms/rejoin');
	try {
		const body = await request.json().catch(() => ({}));
		const room = await getRoom(String(body?.roomId ?? ''), perf);
		if (!room) throw new EngineError('ROOM_NOT_FOUND', 'ঘর পাওয়া যায়নি।');
		const token = String(body?.sessionToken ?? '');
		const playerId = playerIdFor(room, token);
		if (!playerId) throw new EngineError('SESSION_EXPIRED', 'সেশনের মেয়াদ শেষ। আবার যোগ দিন।');
		touch(room, playerId);
		const { state, version } = toClient(room);
		finishPerf(perf, { status: 200 });
		return json({ roomId: room.id, playerId, sessionToken: token, state, version });
	} catch (e) {
		if (e instanceof EngineError) {
			finishPerf(perf, { status: 400, err: e.code });
			return json({ code: e.code, message: e.msg }, { status: 400 });
		}
		finishPerf(perf, { status: 500, err: 'REJOIN_FAILED' });
		return json({ code: 'REJOIN_FAILED', message: 'আবার যোগ দেওয়া যায়নি।' }, { status: 500 });
	}
};
