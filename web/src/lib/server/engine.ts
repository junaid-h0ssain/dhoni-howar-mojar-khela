// Fullstack polling engine — TypeScript port of back/pkg/game/*
// (engine.go, turns.go, property.go, cards.go, jail.go, board_data.go).
// The Go backend under back/ is frozen and untouched; this is the
// SvelteKit-server authority for the HTTP polling version.
// Key difference from WS version: no presence/disconnect forfeits.
// Polling has no half-open sockets, so turns only advance on real actions
// (or explicit leave). isConnected stays true; lastSeen is informational.

import type { GameState, Player, Tile, TileType, GameSettings } from '@/lib/constants/boardData';
import { CHANCE_CARDS, CHEST_CARDS, cardTone, type Card } from '@/lib/constants/cards';

export const START_CASH = 1500;
export const GO_SALARY = 200;
export const EXTREME_GO_SALARY = 500;
export const JAIL_FINE = 100;
export const MAX_JAIL_TURNS = 3;

export const START_CASH_OPTIONS = [1000, 1500, 2000, 3000, 5000];
export const GO_SALARY_OPTIONS = [100, 200, 300, 500];

export type GameSettingsInput = GameSettings;

export const DEFAULT_SETTINGS: GameSettingsInput = {
	startCash: START_CASH,
	goSalary: GO_SALARY,
	extremeMode: false
};

/** Clamp host-supplied room rules to sane values (never trust the client). */
export function sanitizeSettings(input: unknown): GameSettingsInput {
	const raw = (input ?? {}) as Partial<GameSettingsInput>;
	let startCash = Number(raw.startCash);
	let goSalary = Number(raw.goSalary);
	if (!Number.isFinite(startCash)) startCash = START_CASH;
	if (!Number.isFinite(goSalary)) goSalary = GO_SALARY;
	startCash = Math.round(startCash);
	goSalary = Math.round(goSalary);
	if (startCash < 500) startCash = 500;
	if (startCash > 10000) startCash = 10000;
	if (goSalary < 50) goSalary = 50;
	if (goSalary > 1000) goSalary = 1000;
	return { startCash, goSalary, extremeMode: raw.extremeMode === true };
}

function settingsOf(s: GameState): GameSettingsInput {
	if (s.settings) return sanitizeSettings(s.settings);
	return { ...DEFAULT_SETTINGS };
}

/** Effective GO payout: extreme mode always pays ৳500. */
export function goSalaryFor(s: GameState): number {
	const st = settingsOf(s);
	if (st.extremeMode) return EXTREME_GO_SALARY;
	return st.goSalary;
}

// Board TAX tiles that extreme mode doubles: Income Tax (4) and Luxury Tax
// (38). Card bills, repairs, and fines are never doubled.
/** Effective tax for a tile: extreme mode doubles only income/luxury tax. */
export function taxFor(s: GameState, t: Tile): number {
	const base = t.price ?? 0;
	if (t.type !== 'TAX') return base;
	if (t.id !== 4 && t.id !== 38) return base;
	const st = settingsOf(s);
	return st.extremeMode ? base * 2 : base;
}

export const TOKEN_COLORS = [
	'#22c55e', '#3b82f6', '#ef4444', '#eab308', '#a855f7',
	'#f97316', '#14b8c4', '#ec4899', '#84cc16', '#6b7280'
];

export class EngineError extends Error {
	code: string;
	msg: string;
	constructor(code: string, msg: string) {
		super(`${code}: ${msg}`);
		this.code = code;
		this.msg = msg;
	}
}

function errEngine(code: string, msg: string): EngineError {
	return new EngineError(code, msg);
}

export function groupSizes(): Record<string, number> {
	return {
		violet: 2, lightblue: 3, pink: 3, orange: 3,
		red: 3, yellow: 3, green: 3, darkblue: 2,
		railroad: 4, utility: 2
	};
}

interface PropDef {
	id: number; nameBn: string; nameEn: string; price: number;
	houseCost: number; group: string; rent: number[]; mortgage: number;
}

export function newBoard(): Record<number, Tile> {
	const tiles: Record<number, Tile> = {};
	const props: PropDef[] = [
		{ id: 1, nameBn: 'স্বন্দীপ', nameEn: 'Swandip', price: 60, houseCost: 50, group: 'violet', rent: [2, 10, 30, 90, 160, 250], mortgage: 30 },
		{ id: 3, nameBn: 'সীতাকুন্ড', nameEn: 'Sitakund', price: 60, houseCost: 50, group: 'violet', rent: [4, 20, 60, 180, 320, 450], mortgage: 30 },
		{ id: 6, nameBn: 'পটিয়া', nameEn: 'Patiya', price: 100, houseCost: 50, group: 'lightblue', rent: [6, 30, 90, 270, 400, 550], mortgage: 50 },
		{ id: 8, nameBn: 'আনোয়ারা', nameEn: 'Anwara', price: 100, houseCost: 50, group: 'lightblue', rent: [6, 30, 90, 270, 400, 550], mortgage: 50 },
		{ id: 9, nameBn: 'সাতকানিয়া', nameEn: 'Satkania', price: 120, houseCost: 50, group: 'lightblue', rent: [8, 40, 100, 300, 450, 600], mortgage: 60 },
		{ id: 11, nameBn: 'রাউজান', nameEn: 'Raozan', price: 140, houseCost: 100, group: 'pink', rent: [10, 50, 150, 450, 625, 750], mortgage: 70 },
		{ id: 13, nameBn: 'ফটিকছড়ি', nameEn: 'Fatikchhari', price: 140, houseCost: 100, group: 'pink', rent: [10, 50, 150, 450, 625, 750], mortgage: 70 },
		{ id: 14, nameBn: 'রাঙ্গুনিয়া', nameEn: 'Rangunia', price: 160, houseCost: 100, group: 'pink', rent: [12, 60, 180, 500, 700, 900], mortgage: 80 },
		{ id: 16, nameBn: 'কোতোয়ালি', nameEn: 'Kotwali', price: 180, houseCost: 100, group: 'orange', rent: [14, 70, 200, 550, 750, 950], mortgage: 90 },
		{ id: 18, nameBn: 'আন্দরকিল্লা', nameEn: 'Andarkilla', price: 180, houseCost: 100, group: 'orange', rent: [14, 70, 200, 550, 750, 950], mortgage: 90 },
		{ id: 19, nameBn: 'চকবাজার', nameEn: 'Chakbazar', price: 200, houseCost: 100, group: 'orange', rent: [16, 80, 220, 600, 800, 1000], mortgage: 100 },
		{ id: 21, nameBn: 'জিইসি', nameEn: 'GEC', price: 220, houseCost: 150, group: 'red', rent: [18, 90, 250, 700, 875, 1050], mortgage: 110 },
		{ id: 23, nameBn: 'বাটালি হিল', nameEn: 'Batali Hill', price: 220, houseCost: 150, group: 'red', rent: [18, 90, 250, 700, 875, 1050], mortgage: 110 },
		{ id: 24, nameBn: 'দেওয়ানহাট', nameEn: 'Dewanhat', price: 140, houseCost: 150, group: 'red', rent: [20, 100, 300, 750, 925, 1100], mortgage: 70 },
		{ id: 26, nameBn: 'হালিশহর', nameEn: 'Halishahar', price: 260, houseCost: 150, group: 'yellow', rent: [22, 110, 330, 800, 975, 1150], mortgage: 130 },
		{ id: 27, nameBn: 'অলংকার', nameEn: 'Alankar', price: 260, houseCost: 150, group: 'yellow', rent: [22, 110, 330, 800, 975, 1150], mortgage: 130 },
		{ id: 29, nameBn: 'আগ্রাবাদ', nameEn: 'Agrabad', price: 280, houseCost: 150, group: 'yellow', rent: [24, 120, 360, 850, 1025, 1200], mortgage: 140 },
		{ id: 31, nameBn: 'মুরাদপুর', nameEn: 'Muradpur', price: 300, houseCost: 200, group: 'green', rent: [26, 130, 390, 900, 1100, 1275], mortgage: 150 },
		{ id: 32, nameBn: 'বহদ্দারহাট', nameEn: 'Bahaddarhat', price: 300, houseCost: 200, group: 'green', rent: [26, 130, 390, 900, 1100, 1275], mortgage: 150 },
		{ id: 34, nameBn: 'চান্দগাঁও', nameEn: 'Chandgaon', price: 320, houseCost: 200, group: 'green', rent: [28, 150, 450, 1000, 1200, 1400], mortgage: 160 },
		{ id: 37, nameBn: 'খুলশী', nameEn: 'Khulshi', price: 350, houseCost: 200, group: 'darkblue', rent: [35, 175, 500, 1100, 1300, 1500], mortgage: 175 },
		{ id: 39, nameBn: 'পাঁচলাইশ', nameEn: 'Panchlaish', price: 400, houseCost: 200, group: 'darkblue', rent: [50, 200, 600, 1400, 1700, 2000], mortgage: 200 }
	];
	for (const p of props) {
		tiles[p.id] = {
			id: p.id, nameBn: p.nameBn, nameEn: p.nameEn, type: 'PROPERTY',
			price: p.price, rentTiers: p.rent, houseCost: p.houseCost,
			mortgage: p.mortgage, group: p.group, houses: 0, isMortgaged: false
		};
	}
	const rails = [
		{ id: 5, nameBn: 'ষোলশহর স্টেশন', nameEn: 'Sholoshahar Station' },
		{ id: 15, nameBn: 'চট্টগ্রাম জংশন', nameEn: 'Chattogram Junction' },
		{ id: 25, nameBn: 'পাহাড়তলী স্টেশন', nameEn: 'Pahartali Station' },
		{ id: 35, nameBn: 'বিমানবন্দর', nameEn: 'Airport' }
	];
	for (const r of rails) {
		tiles[r.id] = {
			id: r.id, nameBn: r.nameBn, nameEn: r.nameEn, type: 'RAILROAD',
			price: 200, mortgage: 100, group: 'railroad', houses: 0, isMortgaged: false
		};
	}
	const utils = [
		{ id: 12, nameBn: 'পিডিবি', nameEn: 'PDB Power Grid' },
		{ id: 28, nameBn: 'ওয়াসা', nameEn: 'WASA' }
	];
	for (const u of utils) {
		tiles[u.id] = {
			id: u.id, nameBn: u.nameBn, nameEn: u.nameEn, type: 'UTILITY',
			price: 150, mortgage: 75, group: 'utility', houses: 0, isMortgaged: false
		};
	}
	const special: Array<[number, string, string, TileType, number?]> = [
		[0, 'যাত্রা শুরু', 'GO', 'GO'],
		[2, 'সুযোগ গ্রহণ', 'Community Chest', 'CHEST'],
		[4, 'আয়কর', 'Income Tax', 'TAX', 200],
		[7, 'ভাগ্য পরীক্ষা', 'Chance', 'CHANCE'],
		[10, 'জেল', 'Jail', 'JAIL'],
		[17, 'সুযোগ গ্রহণ', 'Community Chest', 'CHEST'],
		[20, 'বিশ্রাম', 'Free Parking', 'PARKING'],
		[22, 'ভাগ্য পরীক্ষা', 'Chance', 'CHANCE'],
		[30, 'জেলে যান', 'Go To Jail', 'GO_TO_JAIL'],
		[33, 'সুযোগ গ্রহণ', 'Community Chest', 'CHEST'],
		[36, 'ভাগ্য পরীক্ষা', 'Chance', 'CHANCE'],
		[38, 'বিলাস কর', 'Luxury Tax', 'TAX', 100]
	];
	for (const [id, nameBn, nameEn, type, price] of special) {
		tiles[id] = { id, nameBn, nameEn, type, price, houses: 0, isMortgaged: false };
	}
	return tiles;
}

// --- Cards (definitions live in $lib/constants/cards.ts) ---

function shuffledDeck(n: number): number[] {
	const d = Array.from({ length: n }, (_, i) => i);
	for (let i = n - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[d[i], d[j]] = [d[j], d[i]];
	}
	return d;
}

export interface RoomState {
	state: GameState;
	version: number;
	doublesCount: number;
	chanceDeck: number[];
	chestDeck: number[];
	chancePos: number;
	chestPos: number;
	lastSeen: Record<string, number>;
}

export function newGame(roomId: string, hostId: string, settings?: unknown): GameState {
	return {
		roomId, hostId, status: 'LOBBY', currentTurnPlayerId: '',
		dice: [1, 1], turnPhase: 'ROLL', tiles: newBoard(), players: [], logs: [],
		settings: sanitizeSettings(settings)
	};
}

export function newRoomState(roomId: string, hostId: string): RoomState {
	return {
		state: newGame(roomId, hostId),
		version: 1, doublesCount: 0,
		chanceDeck: shuffledDeck(CHANCE_CARDS.length),
		chestDeck: shuffledDeck(CHEST_CARDS.length),
		chancePos: 0, chestPos: 0, lastSeen: {}
	};
}

export function findPlayer(s: GameState, id: string): Player | undefined {
	return s.players.find((p) => p.id === id);
}

function appendLog(s: GameState, entry: string): void {
	s.logs.push(entry);
	if (s.logs.length > 100) s.logs = s.logs.slice(-100);
}

function alivePlayers(s: GameState): Player[] {
	return s.players.filter((p) => !p.isBankrupt);
}

// Polling version: turns skip bankrupt players only. No offline skipping —
// there are no sockets to go half-open, so a player never loses a turn to
// a network blip. Leaving removes the seat explicitly.
function advanceTurn(rs: RoomState): void {
	const s = rs.state;
	const alive = alivePlayers(s);
	if (alive.length === 0) return;
	let idx = -1;
	for (let i = 0; i < s.players.length; i++) {
		if (s.players[i].id === s.currentTurnPlayerId) { idx = i; break; }
	}
	for (let step = 1; step <= s.players.length; step++) {
		const next = s.players[(idx + step + s.players.length) % s.players.length];
		if (!next.isBankrupt) {
			s.currentTurnPlayerId = next.id;
			s.turnPhase = 'ROLL';
			rs.doublesCount = 0;
			return;
		}
	}
}

function payOrBankrupt(
	rs: RoomState, payer: Player, amount: number, creditorId: string, reason: string
): boolean {
	if (amount <= 0) return true;
	if (payer.cash >= amount) {
		payer.cash -= amount;
		if (creditorId !== 'bank') {
			const c = findPlayer(rs.state, creditorId);
			if (c && !c.isBankrupt) c.cash += amount;
		}
		return true;
	}
	const remainder = payer.cash;
	payer.cash = 0;
	if (creditorId !== 'bank') {
		const c = findPlayer(rs.state, creditorId);
		if (c && !c.isBankrupt) c.cash += remainder;
	}
	appendLog(rs.state, `${payer.name} ${reason} ৳${amount} দিতে না পেরে দেউলিয়া হয়ে গেছেন।`);
	bankruptPlayer(rs, payer, creditorId);
	return false;
}

function bankruptPlayer(rs: RoomState, p: Player, creditorId: string): void {
	const s = rs.state;
	p.isBankrupt = true;
	const creditor = findPlayer(s, creditorId);
	for (const t of Object.values(s.tiles)) {
		if (t.ownerId === p.id) {
			if (creditor && !creditor.isBankrupt) {
				t.ownerId = creditor.id;
			} else {
				t.ownerId = '';
				t.houses = 0;
				t.isMortgaged = false;
			}
		}
	}
	checkWin(rs);
	if (s.currentTurnPlayerId === p.id) advanceTurn(rs);
}

function checkWin(rs: RoomState): boolean {
	const s = rs.state;
	if (s.status !== 'IN_GAME') return false;
	const alive = alivePlayers(s);
	if (alive.length === 1) {
		s.status = 'FINISHED';
		s.winnerId = alive[0].id;
		appendLog(s, `🏆 বিজয়ী: ${alive[0].name}!`);
		return true;
	}
	return false;
}

function sendToJail(rs: RoomState, p: Player, reason: string): void {
	p.position = 10;
	p.inJail = true;
	p.jailTurns = 0;
	rs.doublesCount = 0;
	rs.state.turnPhase = 'END_TURN';
	appendLog(rs.state, `${p.name} ${reason} জেলে গেছেন।`);
}

function allPropertiesSold(s: GameState): boolean {
	for (const t of Object.values(s.tiles)) {
		if (t.type === 'PROPERTY' || t.type === 'UTILITY' || t.type === 'RAILROAD') {
			if (!t.ownerId) return false;
		}
	}
	return true;
}

function ownsFullGroup(s: GameState, playerId: string, group: string): boolean {
	const sizes = groupSizes();
	const want = sizes[group];
	if (!want || group === 'railroad' || group === 'utility') return false;
	let got = 0;
	for (const t of Object.values(s.tiles)) {
		if (t.type === 'PROPERTY' && t.group === group) {
			if (t.ownerId !== playerId) return false;
			got++;
		}
	}
	return got === want && want > 0;
}

function countOwned(s: GameState, playerId: string, group: string): number {
	let n = 0;
	for (const t of Object.values(s.tiles)) {
		if (t.ownerId === playerId && t.group === group) n++;
	}
	return n;
}

function requireTurn(rs: RoomState, playerId: string, phases: Array<'ROLL' | 'ACTION' | 'END_TURN'>): Player {
	const s = rs.state;
	if (s.status !== 'IN_GAME') throw errEngine('NOT_IN_GAME', 'খেলা এখন চলছে না।');
	const p = findPlayer(s, playerId);
	if (!p) throw errEngine('PLAYER_NOT_FOUND', 'খেলোয়াড় পাওয়া যায়নি।');
	if (p.isBankrupt) throw errEngine('BANKRUPT', 'আপনি দেউলিয়া হয়ে গেছেন।');
	if (s.currentTurnPlayerId !== playerId) throw errEngine('NOT_YOUR_TURN', 'এখন আপনার চাল নয়।');
	if (!phases.includes(s.turnPhase)) throw errEngine('INVALID_PHASE', 'এই চাল এখন দেওয়া যাবে না।');
	return p;
}

function calculateRent(s: GameState, t: Tile, ownerId: string, diceTotal: number): number {
	if (t.type === 'RAILROAD') {
		let n = countOwned(s, ownerId, 'railroad');
		if (n < 1) n = 1;
		return 25 * 2 ** (n - 1);
	}
	if (t.type === 'UTILITY') {
		const mult = countOwned(s, ownerId, 'utility') >= 2 ? 10 : 4;
		if (diceTotal < 2) diceTotal = 7;
		return diceTotal * mult;
	}
	if (!t.rentTiers || t.rentTiers.length === 0) return 0;
	if (t.houses > 0) {
		const idx = Math.min(t.houses, 5);
		return t.rentTiers[idx];
	}
	if (t.group && ownsFullGroup(s, ownerId, t.group)) return t.rentTiers[0] * 2;
	return t.rentTiers[0];
}

function moveCardTo(rs: RoomState, p: Player, target: number): void {
	const from = p.position;
	p.position = target % 40;
	if (p.position < from || p.position === 0) {
		const salary = goSalaryFor(rs.state);
		p.cash += salary;
		appendLog(rs.state, `${p.name} যাত্রা শুরু ঘর পার হয়ে ৳${salary} পেয়েছেন।`);
	}
}

function nearestTileOfType(s: GameState, from: number, type: TileType): number {
	for (let step = 1; step <= 40; step++) {
		const id = (from + step) % 40;
		if (s.tiles[id]?.type === type) return id;
	}
	return from;
}

function ownedByOther(s: GameState, t: Tile | undefined, p: Player): boolean {
	if (!t || !t.ownerId || t.ownerId === p.id) return false;
	const owner = findPlayer(s, t.ownerId);
	return !!owner && !owner.isBankrupt;
}

function applyCard(rs: RoomState, p: Player, c: Card, deck: string, diceTotal: number, depth: number): void {
	const s = rs.state;
	appendLog(s, `${p.name} (${deck}): ${c.text}`);
	s.lastCard = {
		deck: deck === 'ভাগ্য পরীক্ষা' ? 'CHANCE' : 'CHEST',
		text: c.text,
		tone: cardTone(c),
		playerId: p.id,
		turnPlayerId: s.currentTurnPlayerId
	};
	switch (c.kind) {
		case 'cash': {
			const amt = c.amount ?? 0;
			if (amt >= 0) {
				p.cash += amt;
				s.turnPhase = 'ACTION';
			} else {
				if (!payOrBankrupt(rs, p, -amt, 'bank', 'কার্ডের')) return;
				s.turnPhase = 'ACTION';
			}
			break;
		}
		case 'goToJail':
			sendToJail(rs, p, 'কার্ড তুলে');
			break;
		case 'getOutOfJail':
			p.jailCards = (p.jailCards ?? 0) + 1;
			s.turnPhase = 'ACTION';
			appendLog(s, `${p.name}-এর কাছে মুক্তির কার্ড ${p.jailCards}টি।`);
			break;
		case 'moveTo': {
			moveCardTo(rs, p, c.amount ?? 0);
			if (depth < 3) resolveLanding(rs, p, diceTotal, depth + 1);
			else s.turnPhase = 'ACTION';
			break;
		}
		case 'moveBack': {
			const from = p.position;
			p.position = (((from - ((c.amount ?? 0) % 40)) % 40) + 40) % 40;
			if (depth < 3) resolveLanding(rs, p, diceTotal, depth + 1);
			else s.turnPhase = 'ACTION';
			break;
		}
		case 'nearestRailroad': {
			const target = nearestTileOfType(s, p.position, 'RAILROAD');
			moveCardTo(rs, p, target);
			const t = s.tiles[target];
			if (ownedByOther(s, t, p)) {
				const owner = findPlayer(s, t.ownerId!);
				if (owner) {
					const rent = calculateRent(s, t, owner.id, diceTotal) * 2;
					appendLog(s, `${p.name} দ্বিগুণ ভাড়া দিয়েছেন ৳${rent} (${t.nameBn})।`);
					if (!payOrBankrupt(rs, p, rent, owner.id, 'ভাড়ার')) return;
					s.turnPhase = 'ACTION';
					return;
				}
			}
			if (depth < 3) resolveLanding(rs, p, diceTotal, depth + 1);
			else s.turnPhase = 'ACTION';
			break;
		}
		case 'nearestUtility': {
			const target = nearestTileOfType(s, p.position, 'UTILITY');
			moveCardTo(rs, p, target);
			const t = s.tiles[target];
			if (ownedByOther(s, t, p)) {
				const owner = findPlayer(s, t.ownerId!);
				if (owner) {
					const d1 = 1 + Math.floor(Math.random() * 6);
					const d2 = 1 + Math.floor(Math.random() * 6);
					s.dice = [d1, d2];
					const rent = (d1 + d2) * 10;
					appendLog(s, `${p.name} পাশা ফেলেছেন: ${d1} + ${d2} — ১০ গুণ ভাড়া ৳${rent} (${t.nameBn})।`);
					if (!payOrBankrupt(rs, p, rent, owner.id, 'ভাড়ার')) return;
					s.turnPhase = 'ACTION';
					return;
				}
			}
			if (depth < 3) resolveLanding(rs, p, diceTotal, depth + 1);
			else s.turnPhase = 'ACTION';
			break;
		}
		case 'repairs': {
			let houses = 0, hotels = 0;
			for (const t of Object.values(s.tiles)) {
				if (t.ownerId === p.id && t.type === 'PROPERTY') {
					if (t.houses >= 5) hotels++;
					else if (t.houses > 0) houses += t.houses;
				}
			}
			const total = houses * (c.amount ?? 0) + hotels * (c.amount2 ?? 0);
			if (total === 0) {
				appendLog(s, `${p.name}-এর মেরামতের কিছু নেই।`);
				s.turnPhase = 'ACTION';
				return;
			}
			appendLog(s, `${p.name} মেরামত বাবদ ৳${total} দিচ্ছেন (${houses} বাড়ি, ${hotels} হোটেল)।`);
			if (!payOrBankrupt(rs, p, total, 'bank', 'মেরামতের')) return;
			s.turnPhase = 'ACTION';
			break;
		}
		case 'payEachPlayer': {
			for (const q of s.players) {
				if (q.id === p.id || q.isBankrupt) continue;
				if (!payOrBankrupt(rs, p, c.amount ?? 0, q.id, 'চেয়ারম্যানের')) return;
			}
			s.turnPhase = 'ACTION';
			break;
		}
		case 'collectEachPlayer': {
			for (const q of s.players) {
				if (q.id === p.id || q.isBankrupt) continue;
				payOrBankrupt(rs, q, c.amount ?? 0, p.id, 'জন্মদিনের');
			}
			s.turnPhase = 'ACTION';
			break;
		}
	}
}

function drawChance(rs: RoomState, p: Player, diceTotal: number, depth: number): void {
	if (rs.chancePos >= rs.chanceDeck.length) {
		rs.chanceDeck = shuffledDeck(CHANCE_CARDS.length);
		rs.chancePos = 0;
	}
	applyCard(rs, p, CHANCE_CARDS[rs.chanceDeck[rs.chancePos]], 'ভাগ্য পরীক্ষা', diceTotal, depth);
	rs.chancePos++;
}

function drawChest(rs: RoomState, p: Player, diceTotal: number, depth: number): void {
	if (rs.chestPos >= rs.chestDeck.length) {
		rs.chestDeck = shuffledDeck(CHEST_CARDS.length);
		rs.chestPos = 0;
	}
	applyCard(rs, p, CHEST_CARDS[rs.chestDeck[rs.chestPos]], 'সুযোগ গ্রহণ', diceTotal, depth);
	rs.chestPos++;
}

function movePlayer(rs: RoomState, p: Player, steps: number): void {
	const from = p.position;
	const to = (from + steps) % 40;
	if (from + steps >= 40) {
		const salary = goSalaryFor(rs.state);
		p.cash += salary;
		appendLog(rs.state, `${p.name} শুরু ঘর পার হয়ে ৳${salary} পেয়েছেন।`);
		p.lapsCompleted = (p.lapsCompleted ?? 0) + 1;
		if (p.lapsCompleted === 1) {
			appendLog(rs.state, `🎉 ${p.name} বোর্ডের প্রথম রাউন্ড শেষ করেছেন — এখন সম্পত্তি কিনতে পারবেন!`);
		}
	}
	p.position = to;
}

function resolveOwnedTile(rs: RoomState, p: Player, t: Tile, diceTotal: number): void {
	const s = rs.state;
	if (!t.ownerId || t.ownerId === p.id) {
		s.turnPhase = 'ACTION';
		return;
	}
	const owner = findPlayer(s, t.ownerId);
	if (!owner || owner.isBankrupt) {
		s.turnPhase = 'ACTION';
		return;
	}
	const rent = calculateRent(s, t, owner.id, diceTotal);
	appendLog(s, `${p.name} ভাড়া দিয়েছেন ৳${rent} (${t.nameBn})।`);
	if (!payOrBankrupt(rs, p, rent, owner.id, 'ভাড়ার')) return;
	s.turnPhase = 'ACTION';
}

function resolveLanding(rs: RoomState, p: Player, diceTotal: number, depth: number): void {
	const s = rs.state;
	const t = s.tiles[p.position];
	if (!t) {
		s.turnPhase = 'ACTION';
		return;
	}
	switch (t.type) {
		case 'GO_TO_JAIL':
			sendToJail(rs, p, '');
			break;
		case 'TAX': {
			const tax = taxFor(s, t);
			appendLog(s, `${p.name} কর দিয়েছেন ৳${tax}।`);
			if (!payOrBankrupt(rs, p, tax, 'bank', 'করের')) return;
			s.turnPhase = 'ACTION';
			break;
		}
		case 'CHANCE':
			drawChance(rs, p, diceTotal, depth);
			break;
		case 'CHEST':
			drawChest(rs, p, diceTotal, depth);
			break;
		case 'PROPERTY':
		case 'UTILITY':
		case 'RAILROAD':
			resolveOwnedTile(rs, p, t, diceTotal);
			break;
		default:
			s.turnPhase = 'ACTION';
	}
}

function rollInJail(rs: RoomState, p: Player, d1: number, d2: number): void {
	const s = rs.state;
	if (d1 === d2) {
		p.inJail = false;
		p.jailTurns = 0;
		rs.doublesCount = 0;
		appendLog(s, `${p.name} জোড়া ফেলে জেল থেকে মুক্ত হয়েছেন!`);
		movePlayer(rs, p, d1 + d2);
		resolveLanding(rs, p, d1 + d2, 0);
		return;
	}
	p.jailTurns++;
	if (p.jailTurns >= MAX_JAIL_TURNS) {
		appendLog(s, `${p.name} জরিমানা ৳${JAIL_FINE} দিয়ে জেল থেকে বের হচ্ছেন।`);
		if (!payOrBankrupt(rs, p, JAIL_FINE, 'bank', 'জরিমানার')) return;
		p.inJail = false;
		p.jailTurns = 0;
		rs.doublesCount = 0;
		movePlayer(rs, p, d1 + d2);
		appendLog(s, `${p.name} ${d1 + d2} ঘর এগিয়েছেন।`);
		resolveLanding(rs, p, d1 + d2, 0);
		return;
	}
	s.turnPhase = 'END_TURN';
	appendLog(s, `${p.name} জেলেই রইলেন (${p.jailTurns}/${MAX_JAIL_TURNS})।`);
}

// --- Public actions (called by API routes, one per POST) ---

export function addPlayer(rs: RoomState, id: string, name: string): Player {
	const s = rs.state;
	if (s.players.length >= 10) throw errEngine('ROOM_FULL', 'ঘর পূর্ণ হয়ে গেছে।');
	const p: Player = {
		id, name, tokenColor: TOKEN_COLORS[s.players.length % TOKEN_COLORS.length],
		cash: settingsOf(s).startCash, position: 0, inJail: false, jailTurns: 0,
		jailCards: 0, isBankrupt: false, isConnected: true, lapsCompleted: 0
	};
	s.players.push(p);
	return p;
}

export function removePlayer(rs: RoomState, id: string): Player | undefined {
	const s = rs.state;
	const idx = s.players.findIndex((p) => p.id === id);
	if (idx < 0) return undefined;
	const [removed] = s.players.splice(idx, 1);
	const wasCurrent = s.currentTurnPlayerId === id;
	const wasHost = s.hostId === id;
	if (s.status === 'IN_GAME') {
		for (const t of Object.values(s.tiles)) {
			if (t.ownerId === id) {
				t.ownerId = '';
				t.houses = 0;
				t.isMortgaged = false;
			}
		}
	}
	if (wasHost && s.players.length > 0) {
		s.hostId = s.players[0].id;
	}
	if (s.status === 'IN_GAME' && s.players.length > 0 && wasCurrent) {
		advanceTurn(rs);
		checkWin(rs);
	}
	return removed;
}

export function updateSettings(rs: RoomState, playerId: string, settings: unknown): void {
	const s = rs.state;
	if (s.status !== 'LOBBY') throw errEngine('ALREADY_STARTED', 'খেলা শুরু হয়ে গেছে — সেটিংস বদলানো যাবে না।');
	if (s.hostId !== playerId) throw errEngine('NOT_HOST', 'শুধু হোস্ট সেটিংস বদলাতে পারবেন।');
	s.settings = sanitizeSettings(settings);
	const st = s.settings;
	appendLog(
		s,
		`⚙️ হোস্ট সেটিংস বদলেছেন: শুরু ৳${st.startCash}, GO ৳${st.extremeMode ? EXTREME_GO_SALARY : st.goSalary}${st.extremeMode ? ' (এক্সট্রিম 🔥: আয়কর ও বিলাস কর দ্বিগুণ)' : ''}।`
	);
}

export function startGame(rs: RoomState, settings?: unknown): void {
	const s = rs.state;
	if (s.status !== 'LOBBY') throw errEngine('ALREADY_STARTED', 'খেলা ইতিমধ্যে শুরু হয়েছে।');
	if (s.players.length < 2) throw errEngine('NOT_ENOUGH_PLAYERS', 'খেলার জন্য কমপক্ষে ২ জন খেলোয়াড় দরকার।');
	// Late joiners in the lobby may have joined before the host tweaked the
	// rules — reseat everyone's cash to the final starting amount.
	if (settings !== undefined) s.settings = sanitizeSettings(settings);
	const st = settingsOf(s);
	for (const p of s.players) {
		if (!p.isBankrupt) p.cash = st.startCash;
	}
	s.status = 'IN_GAME';
	s.currentTurnPlayerId = s.hostId;
	s.turnPhase = 'ROLL';
	rs.doublesCount = 0;
	rs.chanceDeck = shuffledDeck(CHANCE_CARDS.length);
	rs.chestDeck = shuffledDeck(CHEST_CARDS.length);
	rs.chancePos = 0;
	rs.chestPos = 0;
	s.lastCard = undefined;
	appendLog(s, 'খেলা শুরু হয়েছে!');
	const st2 = settingsOf(s);
	appendLog(
		s,
		`💰 শুরু ৳${st2.startCash} · GO পার হলে ৳${goSalaryFor(s)}${st2.extremeMode ? ' · 🔥 এক্সট্রিম মোড (আয়কর ও বিলাস কর দ্বিগুণ!)' : ''}`
	);
}

export function rollDice(rs: RoomState, playerId: string): void {
	const s = rs.state;
	const p = requireTurn(rs, playerId, ['ROLL']);
	const d1 = 1 + Math.floor(Math.random() * 6);
	const d2 = 1 + Math.floor(Math.random() * 6);
	s.dice = [d1, d2];
	appendLog(s, `${p.name} পাশা ফেলেছেন: ${d1} + ${d2}`);
	if (p.inJail) {
		rollInJail(rs, p, d1, d2);
		return;
	}
	const total = d1 + d2;
	movePlayer(rs, p, total);
	appendLog(s, `${p.name} ${total} ঘর এগিয়েছেন।`);
	resolveLanding(rs, p, total, 0);
	if (p.isBankrupt || s.status !== 'IN_GAME') return;
	const st = s.tiles[p.position];
	if (st?.type === 'GO_TO_JAIL' || p.inJail) return;
	if (d1 === 6 && d2 === 6) {
		rs.doublesCount++;
		if (rs.doublesCount >= 3) {
			rs.doublesCount = 0;
			sendToJail(rs, p, 'তিনবার জোড়া পাশা ফেলে');
			return;
		}
		s.turnPhase = 'ROLL';
		appendLog(s, `${p.name} জোড়া পেয়েছেন — আবার দান চালুন!`);
		return;
	}
	rs.doublesCount = 0;
}

export function autoEndIfNoAction(rs: RoomState, playerId: string): boolean {
	const s = rs.state;
	if (s.status !== 'IN_GAME' || s.currentTurnPlayerId !== playerId || s.turnPhase !== 'ACTION') return false;
	const p = findPlayer(s, playerId);
	if (!p) return false;
	if (((p.lapsCompleted ?? 0) >= 1 && canBuyLandedTile(s, p)) || canBuildAnywhere(rs, p)) return false;
	advanceTurn(rs);
	return true;
}

function canBuildAnywhere(rs: RoomState, p: Player): boolean {
	const s = rs.state;
	if (!allPropertiesSold(s)) return false;
	for (const t of Object.values(s.tiles)) {
		if (t.type === 'PROPERTY' && t.ownerId === p.id && t.houses < 5 && p.cash >= (t.houseCost ?? 0)) {
			return true;
		}
	}
	return false;
}

function canBuyLandedTile(s: GameState, p: Player): boolean {
	const t = s.tiles[p.position];
	if (!t || t.ownerId || p.cash < (t.price ?? Infinity)) return false;
	return t.type === 'PROPERTY' || t.type === 'UTILITY' || t.type === 'RAILROAD';
}

export function buyProperty(rs: RoomState, playerId: string, tileId: number): void {
	const s = rs.state;
	const p = requireTurn(rs, playerId, ['ACTION']);
	if ((p.lapsCompleted ?? 0) < 1) {
		throw errEngine('ROUND_NOT_COMPLETE', 'বোর্ডের প্রথম রাউন্ড (GO পার হওয়া) শেষ না হওয়া পর্যন্ত সম্পত্তি কেনা যাবে না।');
	}
	const t = s.tiles[tileId];
	if (!t) throw errEngine('TILE_NOT_FOUND', 'ঘর পাওয়া যায়নি।');
	if (t.type !== 'PROPERTY' && t.type !== 'UTILITY' && t.type !== 'RAILROAD') {
		throw errEngine('NOT_PURCHASABLE', 'এই ঘর কেনা যায় না।');
	}
	if (t.ownerId) throw errEngine('ALREADY_OWNED', 'এই সম্পত্তি ইতিমধ্যে বিক্রি হয়ে গেছে।');
	if (p.position !== tileId) throw errEngine('NOT_ON_TILE', 'শুধু যে ঘরে দাঁড়িয়ে আছেন সেটাই কিনতে পারবেন।');
	if (p.cash < (t.price ?? 0)) throw errEngine('INSUFFICIENT_FUNDS', 'কেনার মতো টাকা নেই।');
	p.cash -= t.price ?? 0;
	t.ownerId = p.id;
	appendLog(s, `${p.name} ${t.nameBn} কিনেছেন ৳${t.price} দিয়ে।`);
	if (allPropertiesSold(s)) {
		appendLog(s, '🎉 সব সম্পত্তি বিক্রি হয়ে গেছে! এখন বাড়ি ও হোটেল তৈরি করা যাবে।');
	}
}

export function buildHouse(rs: RoomState, playerId: string, tileId: number, count = 1): void {
	const s = rs.state;
	const p = requireTurn(rs, playerId, ['ACTION']);
	const t = s.tiles[tileId];
	if (!t) throw errEngine('TILE_NOT_FOUND', 'ঘর পাওয়া যায়নি।');
	if (t.type !== 'PROPERTY') throw errEngine('NOT_BUILDABLE', 'এখানে বাড়ি তৈরি করা যায় না।');
	if (t.ownerId !== p.id) throw errEngine('NOT_YOUR_PROPERTY', 'এই সম্পত্তি আপনার নয়।');
	if (!allPropertiesSold(s)) {
		throw errEngine('BOARD_NOT_SOLD_OUT', 'সব সম্পত্তি বিক্রি হওয়ার আগে বাড়ি/হোটেল তৈরি করা যাবে না।');
	}
	const want = Math.max(1, Math.min(25, Math.floor(count) || 1));
	// Bulk builds distribute evenly across the player's owned tiles in the
	// same group (lowest level first, chosen tile wins ties), so one click
	// can raise a whole group without tripping UNEVEN_BUILD.
	const groupTiles = Object.values(s.tiles).filter(
		(u) => u.type === 'PROPERTY' && u.group === t.group && u.ownerId === p.id
	);
	if (groupTiles.length === 0) throw errEngine('NOT_YOUR_PROPERTY', 'এই সম্পত্তি আপনার নয়।');
	if (groupTiles.every((u) => u.houses >= 5)) {
		throw errEngine('MAX_LEVEL', 'এই গ্রুপে ইতিমধ্যে সব হোটেল হয়ে গেছে।');
	}
	const builtPerTile = new Map<number, number>();
	let built = 0;
	for (let i = 0; i < want; i++) {
		const candidates = groupTiles.filter((u) => u.houses < 5);
		if (candidates.length === 0) break;
		candidates.sort((a, b) => a.houses - b.houses || (a.id === tileId ? -1 : b.id === tileId ? 1 : a.id - b.id));
		const target = candidates[0];
		const cost = target.houseCost ?? 0;
		if (p.cash < cost) {
			if (built === 0) throw errEngine('INSUFFICIENT_FUNDS', 'বাড়ি তৈরির টাকা নেই।');
			break;
		}
		p.cash -= cost;
		target.houses++;
		built++;
		builtPerTile.set(target.id, (builtPerTile.get(target.id) ?? 0) + 1);
	}
	if (built === 0) throw errEngine('INSUFFICIENT_FUNDS', 'বাড়ি তৈরির টাকা নেই।');
	if (builtPerTile.size === 1) {
		const onlyId = [...builtPerTile.keys()][0];
		const only = s.tiles[onlyId];
		const n = builtPerTile.get(onlyId) ?? built;
		if (only.houses === 5 && n === 1) appendLog(s, `${p.name} ${only.nameBn}-এ হোটেল তৈরি করেছেন!`);
		else if (n === 1) appendLog(s, `${p.name} ${only.nameBn}-এ বাড়ি তৈরি করেছেন (${only.houses})।`);
		else appendLog(s, `${p.name} ${only.nameBn}-এ ${n}টি ধাপ তৈরি করেছেন (${levelBn(only.houses)})।`);
	} else {
		const parts = [...builtPerTile.entries()]
			.map(([id, n]) => `${s.tiles[id].nameBn} +${n}`)
			.join(', ');
		appendLog(s, `${p.name} ${t.group} গ্রুপে ${built}টি ধাপ তৈরি করেছেন (${parts})।`);
	}
	if (built < want) {
		appendLog(s, `⚠️ ${want - built}টি ধাপ বাকি রয়ে গেছে (টাকা বা জায়গা শেষ)।`);
	}
}

function levelBn(houses: number): string {
	if (houses >= 5) return 'হোটেল';
	return `বাড়ি ×${houses}`;
}

export function endTurn(rs: RoomState, playerId: string): void {
	requireTurn(rs, playerId, ['ACTION', 'END_TURN']);
	const p = findPlayer(rs.state, playerId);
	appendLog(rs.state, `${p?.name ?? ''} দান শেষ করেছেন।`);
	advanceTurn(rs);
}

export function payJailFine(rs: RoomState, playerId: string): void {
	const s = rs.state;
	const p = requireTurn(rs, playerId, ['ROLL', 'ACTION', 'END_TURN']);
	if (!p.inJail) throw errEngine('NOT_IN_JAIL', 'আপনি জেলে নেই।');
	appendLog(s, `${p.name} ৳${JAIL_FINE} জরিমানা দিয়ে জেল থেকে বের হচ্ছেন।`);
	if (!payOrBankrupt(rs, p, JAIL_FINE, 'bank', 'জরিমানার')) return;
	p.inJail = false;
	p.jailTurns = 0;
	rs.doublesCount = 0;
	s.turnPhase = 'ROLL';
}

export function useJailCard(rs: RoomState, playerId: string): void {
	const s = rs.state;
	const p = requireTurn(rs, playerId, ['ROLL', 'ACTION', 'END_TURN']);
	if (!p.inJail) throw errEngine('NOT_IN_JAIL', 'আপনি জেলে নেই।');
	if ((p.jailCards ?? 0) <= 0) throw errEngine('NO_JAIL_CARD', 'মুক্তির কার্ড নেই। ভাগ্য/সুযোগ থেকে তুলুন।');
	p.jailCards = (p.jailCards ?? 0) - 1;
	p.inJail = false;
	p.jailTurns = 0;
	rs.doublesCount = 0;
	s.turnPhase = 'ROLL';
	appendLog(s, `${p.name} মুক্তির কার্ড দেখিয়ে জেল থেকে বের হলেন! (${p.jailCards}টি বাকি)`);
}
