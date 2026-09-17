import { joinRoom, toClient } from '@/lib/server/rooms';
import { EngineError } from '@/lib/server/engine';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
	try {
		const body = await req.json().catch(() => ({}));
		const { room, playerId, token } = await joinRoom(
			String(body?.roomId ?? ''),
			String(body?.playerName ?? '')
		);
		const { state, version } = toClient(room);
		return Response.json({ roomId: room.id, playerId, sessionToken: token, state, version });
	} catch (e) {
		if (e instanceof EngineError) {
			return Response.json({ code: e.code, message: e.msg }, { status: 400 });
		}
		return Response.json({ code: 'JOIN_FAILED', message: 'ঘরে যোগ দেওয়া যায়নি।' }, { status: 500 });
	}
}
