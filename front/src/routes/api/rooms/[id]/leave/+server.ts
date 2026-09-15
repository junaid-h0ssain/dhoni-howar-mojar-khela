import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { leaveRoom } from '$lib/server/rooms';

// Explicit leave: frees the seat (properties return to bank, turn advances).
export const POST: RequestHandler = async ({ params, request }) => {
	const body = await request.json().catch(() => ({}));
	await leaveRoom(params.id ?? '', String(body?.sessionToken ?? ''));
	return json({ ok: true });
};
