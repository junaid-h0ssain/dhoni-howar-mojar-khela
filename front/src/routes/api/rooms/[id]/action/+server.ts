import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { applyAction, toClient, type ActionType } from '$lib/server/rooms';
import { EngineError } from '$lib/server/engine';
import { newPerf, finishPerf } from '$lib/server/perf';

const ACTIONS: ActionType[] = [
	'START_GAME', 'ROLL_DICE', 'BUY_PROPERTY', 'BUILD_HOUSE',
	'END_TURN', 'PAY_JAIL_FINE', 'USE_JAIL_CARD', 'UPDATE_SETTINGS',
	'SEND_REACTION', 'SEND_CHAT'
];

export const POST: RequestHandler = async ({ params, request }) => {
	const perf = newPerf('POST /api/rooms/[id]/action');
	let type = '-';
	try {
		const body = await request.json().catch(() => ({}));
		type = String(body?.type ?? '');
		if (!ACTIONS.includes(type as ActionType)) {
			throw new EngineError('UNKNOWN_ACTION', 'অজানা অ্যাকশন।');
		}
		const payload = (body?.payload ?? {}) as Record<string, unknown>;
		const token = String(body?.sessionToken ?? '');
		const room = await applyAction(params.id ?? '', token, type as ActionType, payload, perf);
		const { state, version } = toClient(room);
		finishPerf(perf, { action: type, status: 200 });
		return json({ state, version });
	} catch (e) {
		if (e instanceof EngineError) {
			finishPerf(perf, { action: type, status: 400, err: e.code });
			return json({ code: e.code, message: e.msg }, { status: 400 });
		}
		finishPerf(perf, { action: type, status: 500, err: 'ACTION_FAILED' });
		return json({ code: 'ACTION_FAILED', message: 'চাল দেওয়া যায়নি।' }, { status: 500 });
	}
};
