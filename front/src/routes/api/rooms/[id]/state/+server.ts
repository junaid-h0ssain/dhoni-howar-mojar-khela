import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRoom, playerIdFor, touch, toClient } from '$lib/server/rooms';
import { EngineError } from '$lib/server/engine';

// Poll endpoint: returns the authoritative state. Clients call this every
// ~2s. Passing sessionToken refreshes presence (lastSeen).
export const GET: RequestHandler = async ({ params, url }) => {
	try {
		const room = getRoom(params.id ?? '');
		if (!room) throw new EngineError('ROOM_NOT_FOUND', 'ঘর পাওয়া যায়নি।');
		const token = url.searchParams.get('sessionToken') ?? '';
		const playerId = playerIdFor(room, token);
		if (playerId) touch(room, playerId);
		const { state, version } = toClient(room);
		return json({ state, version });
	} catch (e) {
		if (e instanceof EngineError) {
			return json({ code: e.code, message: e.msg }, { status: 404 });
		}
		return json({ code: 'STATE_FAILED', message: 'অবস্থা আনা যায়নি।' }, { status: 500 });
	}
};
