import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRoom, leaveRoom } from '$lib/server/rooms';

// Explicit leave: frees the seat (properties return to bank, turn advances).
export const POST: RequestHandler = async ({ params, request }) => {
	const room = getRoom(params.id ?? '');
	if (!room) return json({ ok: true });
	const body = await request.json().catch(() => ({}));
	leaveRoom(room, String(body?.sessionToken ?? ''));
	return json({ ok: true });
};
