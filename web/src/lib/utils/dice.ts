// Shared dice-face helpers (used by the action panel and board center).
export const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export function diceFace(d: number): string {
	return DICE_FACES[d - 1] ?? '🎲';
}
