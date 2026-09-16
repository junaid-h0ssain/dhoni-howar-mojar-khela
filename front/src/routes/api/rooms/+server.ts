import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createRoom, toClient } from '$lib/server/rooms';
import { EngineError } from '$lib/server/engine';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json().catch(() => ({}));
		const playerName = String(body?.playerName ?? '');
		const { room, playerId, token } = await createRoom(playerName, body?.settings);
		const { state, version } = toClient(room);
		return json({ roomId: room.id, playerId, sessionToken: token, state, version });
	} catch (e) {
		if (e instanceof EngineError) {
			return json({ code: e.code, message: e.msg }, { status: 400 });
		}
		return json({ code: 'CREATE_FAILED', message: 'ঘর তৈরি করা যায়নি।' }, { status: 500 });
	}
};
