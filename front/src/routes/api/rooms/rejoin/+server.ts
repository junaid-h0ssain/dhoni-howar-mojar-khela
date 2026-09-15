import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRoom, playerIdFor, touch, toClient } from '$lib/server/rooms';
import { EngineError } from '$lib/server/engine';

// Rejoin with a saved seat: validates the session token and returns the
// current state. No sockets, so nothing to rebind — just prove the seat.
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json().catch(() => ({}));
		const room = getRoom(String(body?.roomId ?? ''));
		if (!room) throw new EngineError('ROOM_NOT_FOUND', 'ঘর পাওয়া যায়নি।');
		const token = String(body?.sessionToken ?? '');
		const playerId = playerIdFor(room, token);
		if (!playerId) throw new EngineError('SESSION_EXPIRED', 'সেশনের মেয়াদ শেষ। আবার যোগ দিন।');
		touch(room, playerId);
		const { state, version } = toClient(room);
		return json({ roomId: room.id, playerId, sessionToken: token, state, version });
	} catch (e) {
		if (e instanceof EngineError) {
			return json({ code: e.code, message: e.msg }, { status: 400 });
		}
		return json({ code: 'REJOIN_FAILED', message: 'আবার যোগ দেওয়া যায়নি।' }, { status: 500 });
	}
};

