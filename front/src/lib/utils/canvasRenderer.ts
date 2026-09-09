// Canvas board geometry helpers (§15-16). Full renderer lands in Task 4.
// Tiles are positioned programmatically around an 800×800 perimeter:
// bottom row L→R = tiles 0–10, left col B→T = 11–20 (drawn bottom-up),
// top row R→L … — standard Monopoly winding. These helpers give pixel
// rects + token anchor points so BoardCanvas + animation share one layout.

export const BOARD_SIZE = 800;
export const TILES_PER_SIDE = 11; // 10 edge tiles + corners shared

export interface TileRect {
	x: number;
	y: number;
	w: number;
	h: number;
}

const CORNER = BOARD_SIZE / 7.2;
const EDGE = (BOARD_SIZE - CORNER * 2) / 9;

/** Pixel rect for tile id 0–39 on an 800×800 board. */
export function tileRect(id: number): TileRect {
	const t = ((id % 40) + 40) % 40;
	if (t <= 10) {
		// Bottom row: GO(0) bottom-right → Jail(10) bottom-left.
		if (t === 0) return { x: BOARD_SIZE - CORNER, y: BOARD_SIZE - CORNER, w: CORNER, h: CORNER };
		if (t === 10) return { x: 0, y: BOARD_SIZE - CORNER, w: CORNER, h: CORNER };
		const i = 10 - t; // 1..9 distance from right corner
		return { x: BOARD_SIZE - CORNER - i * EDGE, y: BOARD_SIZE - CORNER, w: EDGE, h: CORNER };
	}
	if (t <= 20) {
		// Left column going up: 11..19, Parking(20) top-left.
		if (t === 20) return { x: 0, y: 0, w: CORNER, h: CORNER };
		const i = t - 10; // 1..9 distance from bottom corner
		return { x: 0, y: BOARD_SIZE - CORNER - i * EDGE, w: CORNER, h: EDGE };
	}
	if (t <= 30) {
		// Top row going right: 21..29, GoToJail(30) top-right.
		if (t === 30) return { x: BOARD_SIZE - CORNER, y: 0, w: CORNER, h: CORNER };
		const i = t - 20; // 1..9 distance from left corner
		return { x: CORNER + (i - 1) * EDGE, y: 0, w: EDGE, h: CORNER };
	}
	// Right column going down: 31..39.
	const i = t - 30; // 1..9 distance from top corner
	return { x: BOARD_SIZE - CORNER, y: CORNER + (i - 1) * EDGE, w: CORNER, h: EDGE };
}

/** Center of a tile rect — token anchor. */
export function tileCenter(id: number): { x: number; y: number } {
	const r = tileRect(id);
	return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

export function lerp(start: number, end: number, amount: number): number {
	return start + (end - start) * amount;
}
