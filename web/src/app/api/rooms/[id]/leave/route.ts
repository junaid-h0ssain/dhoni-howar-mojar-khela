import { leaveRoom } from '@/lib/server/rooms';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Explicit leave: frees the seat (properties return to bank, turn advances).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
	const { id } = await ctx.params;
	const body = await req.json().catch(() => ({}));
	await leaveRoom(id ?? '', String(body?.sessionToken ?? ''));
	return Response.json({ ok: true });
}
