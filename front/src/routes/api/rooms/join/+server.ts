import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { joinRoom, toClient } from '$lib/server/rooms';
import { EngineError } from '$lib/server/engine';
import { newPerf, finishPerf } from '$lib/server/perf';

export const POST: RequestHandler = async ({ request }) => {
	const perf = newPerf('POST /api/rooms/join');
	try {
		const body = await request.json().catch(() => ({}));
		const { room, playerId, token } = await joinRoom(
			String(body?.roomId ?? ''),
			String(body?.playerName ?? ''),
			perf
		);
		const { state, version } = toClient(room);
		finishPerf(perf, { status: 200 });
		return json({ roomId: room.id, playerId, sessionToken: token, state, version });
	} catch (e) {
		if (e instanceof EngineError) {
			finishPerf(perf, { status: 400, err: e.code });
			return json({ code: e.code, message: e.msg }, { status: 400 });
		}
		finishPerf(perf, { status: 500, err: 'JOIN_FAILED' });
		return json({ code: 'JOIN_FAILED', message: 'ঘরে যোগ দেওয়া যায়নি।' }, { status: 500 });
	}
};
