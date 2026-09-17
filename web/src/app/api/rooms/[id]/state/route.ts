import { getRoom, playerIdFor, toClient } from '@/lib/server/rooms';
import { EngineError } from '@/lib/server/engine';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Poll endpoint: returns the authoritative state to a valid room session.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
	try {
		const { id } = await ctx.params;
		const room = await getRoom(id ?? '');
		if (!room) throw new EngineError('ROOM_NOT_FOUND', 'ঘর পাওয়া যায়নি।');
		const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
		const playerId = playerIdFor(room, token);
		if (!playerId) throw new EngineError('INVALID_SESSION', 'সেশন পাওয়া যায়নি। আবার যোগ দিন।');
		const { state, version } = toClient(room);
		return Response.json({ state, version });
	} catch (e) {
		if (e instanceof EngineError) {
			return Response.json({ code: e.code, message: e.msg }, { status: 404 });
		}
		return Response.json({ code: 'STATE_FAILED', message: 'অবস্থা আনা যায়নি।' }, { status: 500 });
	}
}
