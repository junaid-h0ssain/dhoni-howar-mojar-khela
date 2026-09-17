import { applyAction, toClient, type ActionType } from '@/lib/server/rooms';
import { EngineError } from '@/lib/server/engine';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ACTIONS: ActionType[] = [
	'START_GAME', 'ROLL_DICE', 'BUY_PROPERTY', 'BUILD_HOUSE',
	'END_TURN', 'PAY_JAIL_FINE', 'USE_JAIL_CARD', 'UPDATE_SETTINGS'
];

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
	try {
		const { id } = await ctx.params;
		const body = await req.json().catch(() => ({}));
		const type = String(body?.type ?? '');
		if (!ACTIONS.includes(type as ActionType)) {
			throw new EngineError('UNKNOWN_ACTION', 'অজানা অ্যাকশন।');
		}
		const payload = (body?.payload ?? {}) as Record<string, unknown>;
		const token = String(body?.sessionToken ?? '');
		const room = await applyAction(id ?? '', token, type as ActionType, payload);
		const { state, version } = toClient(room);
		return Response.json({ state, version });
	} catch (e) {
		if (e instanceof EngineError) {
			return Response.json({ code: e.code, message: e.msg }, { status: 400 });
		}
		return Response.json({ code: 'ACTION_FAILED', message: 'চাল দেওয়া যায়নি।' }, { status: 500 });
	}
}
