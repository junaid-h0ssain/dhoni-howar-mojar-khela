import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createRoom, toClient } from '$lib/server/rooms';
import { EngineError } from '$lib/server/engine';
import { newPerf, finishPerf } from '$lib/server/perf';

export const POST: RequestHandler = async ({ request }) => {
	const perf = newPerf('POST /api/rooms');
	try {
		const body = await request.json().catch(() => ({}));
		const playerName = String(body?.playerName ?? '');
		const { room, playerId, token } = await createRoom(playerName, body?.settings, perf);
		const { state, version } = toClient(room);
		finishPerf(perf, { status: 200 });
		return json({ roomId: room.id, playerId, sessionToken: token, state, version });
	} catch (e) {
		if (e instanceof EngineError) {
			finishPerf(perf, { status: 400, err: e.code });
			return json({ code: e.code, message: e.msg }, { status: 400 });
		}
		finishPerf(perf, { status: 500, err: 'CREATE_FAILED' });
		return json({ code: 'CREATE_FAILED', message: 'ঘর তৈরি করা যায়নি।' }, { status: 500 });
	}
};
