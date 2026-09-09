// Reactive game store — Svelte 5 runes (§18).
// The WebSocket bridge writes here; components read via derived helpers.
import type { GameState } from '$lib/constants/boardData';

class GameStore {
	gameState = $state<GameState | null>(null);
	playerId = $state<string | null>(null);
	sessionToken = $state<string | null>(null);
	roomCode = $state<string | null>(null);
	connection = $state<'idle' | 'connecting' | 'open' | 'closed'>('idle');
	lastError = $state<string | null>(null);

	currentPlayer = $derived(
		this.gameState?.players.find((p) => p.id === this.gameState?.currentTurnPlayerId) ?? null
	);
	me = $derived(
		this.gameState?.players.find((p) => p.id === this.playerId) ?? null
	);
	isMyTurn = $derived(
		!!this.gameState &&
			!!this.playerId &&
			this.gameState.currentTurnPlayerId === this.playerId
	);
	isHost = $derived(
		!!this.gameState && !!this.playerId && this.gameState.hostId === this.playerId
	);
	canRoll = $derived(
		this.isMyTurn &&
			this.gameState?.status === 'IN_GAME' &&
			this.gameState?.turnPhase === 'ROLL'
	);
	canAct = $derived(
		this.isMyTurn &&
			this.gameState?.status === 'IN_GAME' &&
			this.gameState?.turnPhase === 'ACTION'
	);

	reset() {
		this.gameState = null;
		this.playerId = null;
		this.sessionToken = null;
		this.roomCode = null;
		this.lastError = null;
	}
}

export const gameStore = new GameStore();
