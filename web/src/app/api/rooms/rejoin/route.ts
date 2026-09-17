import { getRoom, playerIdFor, touch, toClient } from '@/lib/server/rooms';
import { EngineError } from '@/lib/server/engine';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Rejoin with a saved seat: validates the session token and returns the
// current state. No sockets, so nothing to rebind — just prove the seat.
export async function POST(req: Request) {
	try {
		const body = await req.json().catch(() => ({}));
		const room = await getRoom(String(body?.roomId ?? ''));
		if (!room) throw new EngineError('ROOM_NOT_FOUND', 'ঘর পাওয়া যায়নি।');
		const token = String(body?.sessionToken ?? '');
		const playerId = playerIdFor(room, token);
		if (!playerId) throw new EngineError('SESSION_EXPIRED', 'সেশনের মেয়াদ শেষ। আবার যোগ দিন।');
		touch(room, playerId);
		const { state, version } = toClient(room);
		return Response.json({ roomId: room.id, playerId, sessionToken: token, state, version });
	} catch (e) {
		if (e instanceof EngineError) {
			return Response.json({ code: e.code, message: e.msg }, { status: 400 });
		}
		return Response.json({ code: 'REJOIN_FAILED', message: 'আবার যোগ দেওয়া যায়নি।' }, { status: 500 });
	}
}
