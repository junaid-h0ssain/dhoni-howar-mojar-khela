import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRoom, applyAction, toClient, type ActionType } from '$lib/server/rooms';
import { EngineError } from '$lib/server/engine';

const ACTIONS: ActionType[] = [
	'START_GAME', 'ROLL_DICE', 'BUY_PROPERTY', 'BUILD_HOUSE',
	'END_TURN', 'PAY_JAIL_FINE', 'USE_JAIL_CARD'
];

export const POST: RequestHandler = async ({ params, request }) => {
	try {
		const room = getRoom(params.id ?? '');
		if (!room) throw new EngineError('ROOM_NOT_FOUND', 'ঘর পাওয়া যায়নি।');
		const body = await request.json().catch(() => ({}));
		const type = String(body?.type ?? '');
		if (!ACTIONS.includes(type as ActionType)) {
			throw new EngineError('UNKNOWN_ACTION', 'অজানা অ্যাকশন।');
		}
		const payload = (body?.payload ?? {}) as Record<string, unknown>;
		const token = String(body?.sessionToken ?? '');
		applyAction(room, token, type as ActionType, payload);
		const { state, version } = toClient(room);
		return json({ state, version });
	} catch (e) {
		if (e instanceof EngineError) {
			return json({ code: e.code, message: e.msg }, { status: 400 });
		}
		return json({ code: 'ACTION_FAILED', message: 'চাল দেওয়া যায়নি।' }, { status: 500 });
	}
};
