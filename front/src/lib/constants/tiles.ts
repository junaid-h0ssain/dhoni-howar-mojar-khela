import type { Tile } from './boardData';

// Static 40-tile board — same layout as backend pkg/game/board_data.go.
// Single source of truth for rendering; ownership/houses come from GAME_STATE.
function rent(base: number): number[] {
	return [base, base * 5, base * 15, base * 30, base * 45, base * 60];
}

function prop(
	id: number,
	nameBn: string,
	nameEn: string,
	price: number,
	houseCost: number,
	group: string,
	baseRent: number
): Tile {
	return {
		id,
		nameBn,
		nameEn,
		type: 'PROPERTY',
		price,
		rentTiers: rent(baseRent + Math.floor(price / 100)),
		houseCost,
		group,
		houses: 0,
		isMortgaged: false
	};
}

export const BOARD_TILES: Tile[] = [
	{ id: 0, nameBn: 'শুরু', nameEn: 'GO', type: 'GO', houses: 0, isMortgaged: false },
	prop(1, 'স্বন্দীপ', 'Swandip', 60, 50, 'violet', 2),
	{ id: 2, nameBn: 'সুযোগ গ্রহণ', nameEn: 'Community Chest', type: 'CHEST', houses: 0, isMortgaged: false },
	prop(3, 'সীতাকুন্ড', 'Sitakund', 60, 50, 'violet', 2),
	{ id: 4, nameBn: 'আয়কর', nameEn: 'Income Tax', type: 'TAX', price: 200, houses: 0, isMortgaged: false },
	{ id: 5, nameBn: 'পাহাড়তলী স্টেশন', nameEn: 'Pahartali Station', type: 'RAILROAD', price: 200, group: 'railroad', houses: 0, isMortgaged: false },
	prop(6, 'পটিয়া', 'Patiya', 100, 50, 'lightblue', 6),
	{ id: 7, nameBn: 'ভাগ্য পরীক্ষা', nameEn: 'Chance', type: 'CHANCE', houses: 0, isMortgaged: false },
	prop(8, 'আনোয়ারা', 'Anwara', 100, 50, 'lightblue', 6),
	prop(9, 'সাতকানিয়া', 'Satkania', 120, 50, 'lightblue', 6),
	{ id: 10, nameBn: 'জেল', nameEn: 'Jail', type: 'JAIL', houses: 0, isMortgaged: false },
	prop(11, 'রাউজান', 'Raozan', 140, 100, 'pink', 10),
	{ id: 12, nameBn: 'পিডিবি', nameEn: 'PDB Power Grid', type: 'UTILITY', price: 150, group: 'utility', houses: 0, isMortgaged: false },
	prop(13, 'ফটিকছড়ি', 'Fatikchhari', 140, 100, 'pink', 10),
	prop(14, 'রাঙ্গুনিয়া', 'Rangunia', 160, 100, 'pink', 10),
	{ id: 15, nameBn: 'চট্টগ্রাম জংশন', nameEn: 'Chattogram Junction', type: 'RAILROAD', price: 200, group: 'railroad', houses: 0, isMortgaged: false },
	prop(16, 'কোতোয়ালি', 'Kotwali', 180, 100, 'orange', 14),
	{ id: 17, nameBn: 'সুযোগ গ্রহণ', nameEn: 'Community Chest', type: 'CHEST', houses: 0, isMortgaged: false },
	prop(18, 'আন্দরকিল্লা', 'Andarkilla', 180, 100, 'orange', 14),
	prop(19, 'চকবাজার', 'Chakbazar', 200, 100, 'orange', 14),
	{ id: 20, nameBn: 'বিশ্রাম', nameEn: 'Free Parking', type: 'PARKING', houses: 0, isMortgaged: false },
	prop(21, 'জিইসি', 'GEC', 220, 150, 'red', 18),
	{ id: 22, nameBn: 'ভাগ্য পরীক্ষা', nameEn: 'Chance', type: 'CHANCE', houses: 0, isMortgaged: false },
	prop(23, 'বাটালি হিল', 'Batali Hill', 220, 150, 'red', 18),
	prop(24, 'দেওয়ানহাট', 'Dewanhat', 140, 150, 'red', 18),
	{ id: 25, nameBn: 'ষোলশহর স্টেশন', nameEn: 'Sholoshahar Station', type: 'RAILROAD', price: 200, group: 'railroad', houses: 0, isMortgaged: false },
	prop(26, 'হালিশহর', 'Halishahar', 260, 150, 'yellow', 22),
	prop(27, 'অলংকার', 'Alankar', 260, 150, 'yellow', 22),
	{ id: 28, nameBn: 'ওয়াসা', nameEn: 'WASA', type: 'UTILITY', price: 150, group: 'utility', houses: 0, isMortgaged: false },
	prop(29, 'আগ্রাবাদ', 'Agrabad', 280, 150, 'yellow', 22),
	{ id: 30, nameBn: 'জেলে যান', nameEn: 'Go To Jail', type: 'GO_TO_JAIL', houses: 0, isMortgaged: false },
	prop(31, 'মুরাদপুর', 'Muradpur', 300, 200, 'green', 26),
	prop(32, 'বহদ্দারহাট', 'Bahaddarhat', 300, 200, 'green', 26),
	{ id: 33, nameBn: 'সুযোগ গ্রহণ', nameEn: 'Community Chest', type: 'CHEST', houses: 0, isMortgaged: false },
	prop(34, 'চান্দগাঁও', 'Chandgaon', 320, 200, 'green', 26),
	{ id: 35, nameBn: 'বিমানবন্দর', nameEn: 'Airport', type: 'RAILROAD', price: 200, group: 'railroad', houses: 0, isMortgaged: false },
	{ id: 36, nameBn: 'ভাগ্য পরীক্ষা', nameEn: 'Chance', type: 'CHANCE', houses: 0, isMortgaged: false },
	prop(37, 'খুলশী', 'Khulshi', 350, 200, 'darkblue', 35),
	{ id: 38, nameBn: 'বিলাস কর', nameEn: 'Luxury Tax', type: 'TAX', price: 100, houses: 0, isMortgaged: false },
	prop(39, 'পাঁচলাইশ', 'Panchlaish', 400, 200, 'darkblue', 35)
];

export const TILE_MAP: Record<number, Tile> = Object.fromEntries(
	BOARD_TILES.map((t) => [t.id, t])
);
