import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRoom, playerIdFor, toClient } from '$lib/server/rooms';
import { EngineError } from '$lib/server/engine';

// Poll endpoint: returns the authoritative state to a valid room session.
export const GET: RequestHandler = async ({ params, request }) => {
	try {
		const room = await getRoom(params.id ?? '');
		if (!room) throw new EngineError('ROOM_NOT_FOUND', 'ঘর পাওয়া যায়নি।');
		const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
		const playerId = playerIdFor(room, token);
		if (!playerId) throw new EngineError('INVALID_SESSION', 'সেশন পাওয়া যায়নি। আবার যোগ দিন।');
		const { state, version } = toClient(room);
		return json({ state, version });
	} catch (e) {
		if (e instanceof EngineError) {
			return json({ code: e.code, message: e.msg }, { status: 404 });
		}
		return json({ code: 'STATE_FAILED', message: 'অবস্থা আনা যায়নি।' }, { status: 500 });
	}
};
