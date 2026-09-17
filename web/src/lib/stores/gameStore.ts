// Reactive game store — zustand port of gameStore.svelte.ts.
// The polling bridge writes here; components read via hooks/selectors.
// Dice are shown directly from the authoritative server state — no client
// shuffle/wait animation (it could stick and block the roll button).
import { create } from 'zustand';
import type { GameState, Player } from '@/lib/constants/boardData';

export type Connection = 'idle' | 'connecting' | 'open' | 'closed';

interface GameStoreState {
	gameState: GameState | null;
	playerId: string | null;
	sessionToken: string | null;
	roomCode: string | null;
	connection: Connection;
	lastError: string | null;
}

const initialState: GameStoreState = {
	gameState: null,
	playerId: null,
	sessionToken: null,
	roomCode: null,
	connection: 'idle',
	lastError: null
};

interface GameStoreActions {
	set: (p: Partial<GameStoreState>) => void;
	reset: () => void;
}

export const useGameStore = create<GameStoreState & GameStoreActions>()((set) => ({
	...initialState,
	set: (p) => set(p),
	reset: () =>
		set({
			gameState: null,
			playerId: null,
			sessionToken: null,
			roomCode: null,
			lastError: null
		})
}));

// --- Derived selectors (replacing Svelte $derived) ---

export function selectCurrentPlayer(s: GameStoreState): Player | null {
	return s.gameState?.players.find((p) => p.id === s.gameState?.currentTurnPlayerId) ?? null;
}

export function selectMe(s: GameStoreState): Player | null {
	return s.gameState?.players.find((p) => p.id === s.playerId) ?? null;
}

export function selectIsMyTurn(s: GameStoreState): boolean {
	return !!s.gameState && !!s.playerId && s.gameState.currentTurnPlayerId === s.playerId;
}

export function selectIsHost(s: GameStoreState): boolean {
	return !!s.gameState && !!s.playerId && s.gameState.hostId === s.playerId;
}

export function selectCanRoll(s: GameStoreState): boolean {
	return selectIsMyTurn(s) && s.gameState?.status === 'IN_GAME' && s.gameState?.turnPhase === 'ROLL';
}

export function selectCanAct(s: GameStoreState): boolean {
	return (
		selectIsMyTurn(s) && s.gameState?.status === 'IN_GAME' && s.gameState?.turnPhase === 'ACTION'
	);
}

// END_TURN phase (e.g. after landing in jail) still needs an action:
// the current player must be able to pass the turn.
export function selectCanEndTurn(s: GameStoreState): boolean {
	return (
		selectIsMyTurn(s) &&
		s.gameState?.status === 'IN_GAME' &&
		(s.gameState?.turnPhase === 'ACTION' || s.gameState?.turnPhase === 'END_TURN')
	);
}

// --- Imperative proxy for the polling bridge ---
// Preserves the `gameStore.x` / `gameStore.x = y` access pattern from the
// Svelte version so polling.ts ports with only an import change. Writes go
// through zustand setState (reactive); reads go through getState().

interface GameStoreProxy {
	gameState: GameState | null;
	playerId: string | null;
	sessionToken: string | null;
	roomCode: string | null;
	connection: Connection;
	lastError: string | null;
	readonly currentPlayer: Player | null;
	readonly me: Player | null;
	readonly isMyTurn: boolean;
	readonly isHost: boolean;
	readonly canRoll: boolean;
	readonly canAct: boolean;
	readonly canEndTurn: boolean;
	reset: () => void;
}

export const gameStore: GameStoreProxy = {
	get gameState() {
		return useGameStore.getState().gameState;
	},
	set gameState(v: GameState | null) {
		useGameStore.setState({ gameState: v });
	},
	get playerId() {
		return useGameStore.getState().playerId;
	},
	set playerId(v: string | null) {
		useGameStore.setState({ playerId: v });
	},
	get sessionToken() {
		return useGameStore.getState().sessionToken;
	},
	set sessionToken(v: string | null) {
		useGameStore.setState({ sessionToken: v });
	},
	get roomCode() {
		return useGameStore.getState().roomCode;
	},
	set roomCode(v: string | null) {
		useGameStore.setState({ roomCode: v });
	},
	get connection() {
		return useGameStore.getState().connection;
	},
	set connection(v: Connection) {
		useGameStore.setState({ connection: v });
	},
	get lastError() {
		return useGameStore.getState().lastError;
	},
	set lastError(v: string | null) {
		useGameStore.setState({ lastError: v });
	},
	get currentPlayer() {
		return selectCurrentPlayer(useGameStore.getState());
	},
	get me() {
		return selectMe(useGameStore.getState());
	},
	get isMyTurn() {
		return selectIsMyTurn(useGameStore.getState());
	},
	get isHost() {
		return selectIsHost(useGameStore.getState());
	},
	get canRoll() {
		return selectCanRoll(useGameStore.getState());
	},
	get canAct() {
		return selectCanAct(useGameStore.getState());
	},
	get canEndTurn() {
		return selectCanEndTurn(useGameStore.getState());
	},
	reset() {
		useGameStore.getState().reset();
	}
};
