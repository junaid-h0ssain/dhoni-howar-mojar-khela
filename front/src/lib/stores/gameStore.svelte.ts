// Reactive game store — Svelte 5 runes (§18).
// The WebSocket bridge writes here; components read via derived helpers.
// Dice are shown directly from the authoritative server state — no client
// shuffle/wait animation (it could stick and block the roll button).
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
	// Debug administrator: player named exactly "ADMINISTRATOR" (all caps,
	// case-sensitive) may choose exact dice values. Server re-validates — this only gates UI.
	isAdmin = $derived((this.me?.name ?? '').trim() === 'ADMINISTRATOR');
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
	// END_TURN phase (e.g. after landing in jail) still needs an action:
	// the current player must be able to pass the turn.
	canEndTurn = $derived(
		this.isMyTurn &&
			this.gameState?.status === 'IN_GAME' &&
			(this.gameState?.turnPhase === 'ACTION' ||
				this.gameState?.turnPhase === 'END_TURN')
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
