import type { Tile } from '$lib/constants/boardData';

// Pictograms for transport & utility tiles (§16 special-tile artwork).
// Railroads share one icon; the two utilities are told apart by service:
// PDB = electricity, WASA = water.
export function tileIcon(t: Pick<Tile, 'id' | 'type' | 'nameBn'>): string | null {
	if (t.type === 'RAILROAD') return '🚂';
	if (t.type === 'UTILITY') {
		if (t.id === 28 || t.nameBn.includes('ওয়াসা')) return '💧';
		return '⚡';
	}
	return null;
}
