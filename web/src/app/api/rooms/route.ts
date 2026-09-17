import { createRoom, toClient } from '@/lib/server/rooms';
import { EngineError } from '@/lib/server/engine';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
	try {
		const body = await req.json().catch(() => ({}));
		const playerName = String(body?.playerName ?? '');
		const { room, playerId, token } = await createRoom(playerName, body?.settings);
		const { state, version } = toClient(room);
		return Response.json({ roomId: room.id, playerId, sessionToken: token, state, version });
	} catch (e) {
		if (e instanceof EngineError) {
			return Response.json({ code: e.code, message: e.msg }, { status: 400 });
		}
		return Response.json({ code: 'CREATE_FAILED', message: 'ঘর তৈরি করা যায়নি।' }, { status: 500 });
	}
}
