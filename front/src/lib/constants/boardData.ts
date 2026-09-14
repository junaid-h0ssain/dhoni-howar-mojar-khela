// Mahajoni core state types — mirrors backend pkg/models/state.go (§3.1).
// Keep the two in sync; the server is authoritative (§21).

export type TileType =
	| 'PROPERTY'
	| 'UTILITY'
	| 'RAILROAD'
	| 'CHANCE'
	| 'CHEST'
	| 'TAX'
	| 'JAIL'
	| 'GO_TO_JAIL'
	| 'GO'
	| 'PARKING';

export interface Tile {
	id: number;
	nameBn: string;
	nameEn: string;
	type: TileType;
	price?: number;
	/** [Base, 1H, 2H, 3H, 4H, Hotel] */
	rentTiers?: number[];
	houseCost?: number;
	/** Display-only mortgage value (no mortgage feature exists). */
	mortgage?: number;
	group?: string;
	ownerId?: string;
	/** 0–4 = houses, 5 = hotel */
	houses: number;
	isMortgaged: boolean;
}

export interface Player {
	id: string;
	name: string;
	tokenColor: string;
	cash: number;
	/** 0–39 */
	position: number;
	inJail: boolean;
	jailTurns: number;
	/** Holdable get-out-of-jail cards. Absent on older servers — treat as 0. */
	jailCards?: number;
	isBankrupt: boolean;
	isConnected: boolean;
	// Full board circuits (passing GO). Buying unlocks after the first lap.
	// Absent on older servers — treat undefined as unlocked.
	lapsCompleted?: number;
}

export type GameStatus = 'LOBBY' | 'IN_GAME' | 'FINISHED';
export type TurnPhase = 'ROLL' | 'ACTION' | 'END_TURN';

export interface GameState {
	roomId: string;
	hostId: string;
	status: GameStatus;
	currentTurnPlayerId: string;
	dice: [number, number];
	turnPhase: TurnPhase;
	tiles: Record<number, Tile>;
	players: Player[];
	logs: string[];
	winnerId?: string;
}

/** Client → server action types (§9). */
export const ClientActions = {
	CREATE_ROOM: 'CREATE_ROOM',
	JOIN_ROOM: 'JOIN_ROOM',
	RECONNECT: 'RECONNECT',
	LEAVE_ROOM: 'LEAVE_ROOM',
	START_GAME: 'START_GAME',
	ROLL_DICE: 'ROLL_DICE',
	BUY_PROPERTY: 'BUY_PROPERTY',
	BUILD_HOUSE: 'BUILD_HOUSE',
	END_TURN: 'END_TURN',
	PAY_JAIL_FINE: 'PAY_JAIL_FINE',
	USE_JAIL_CARD: 'USE_JAIL_CARD'
} as const;

/** Server → client event types (§10). */
export const ServerEvents = {
	ROOM_CREATED: 'ROOM_CREATED',
	PLAYER_JOINED: 'PLAYER_JOINED',
	PLAYER_LEFT: 'PLAYER_LEFT',
	GAME_STARTED: 'GAME_STARTED',
	GAME_STATE: 'GAME_STATE',
	DICE_ROLLED: 'DICE_ROLLED',
	PLAYER_MOVED: 'PLAYER_MOVED',
	PROPERTY_PURCHASED: 'PROPERTY_PURCHASED',
	HOUSE_BUILT: 'HOUSE_BUILT',
	PLAYER_BANKRUPT: 'PLAYER_BANKRUPT',
	PLAYER_DISCONNECTED: 'PLAYER_DISCONNECTED',
	PLAYER_RECONNECTED: 'PLAYER_RECONNECTED',
	GAME_FINISHED: 'GAME_FINISHED',
	ERROR: 'ERROR'
} as const;

export interface WsMessage {
	type: string;
	payload?: Record<string, unknown>;
	requestId?: string;
	playerId?: string;
	sessionToken?: string;
}

export const GROUP_COLORS: Record<string, string> = {
	violet: '#8b5cf6',
	lightblue: '#7dd3fc',
	pink: '#f472b6',
	orange: '#fb923c',
	red: '#ef4444',
	yellow: '#facc15',
	green: '#22c55e',
	darkblue: '#2563eb',
	railroad: '#a8a29e',
	utility: '#000000'
};
