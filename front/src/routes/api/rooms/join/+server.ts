import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { joinRoom, toClient } from '$lib/server/rooms';
import { EngineError } from '$lib/server/engine';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json().catch(() => ({}));
		const { room, playerId, token } = joinRoom(
			String(body?.roomId ?? ''),
			String(body?.playerName ?? '')
		);
		const { state, version } = toClient(room);
		return json({ roomId: room.id, playerId, sessionToken: token, state, version });
	} catch (e) {
		if (e instanceof EngineError) {
			return json({ code: e.code, message: e.msg }, { status: 400 });
		}
		return json({ code: 'JOIN_FAILED', message: 'ঘরে যোগ দেওয়া যায়নি।' }, { status: 500 });
	}
};
