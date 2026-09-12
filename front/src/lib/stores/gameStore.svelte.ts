// Reactive game store — Svelte 5 runes (§18).
// The WebSocket bridge writes here; components read via derived helpers.
import type { GameState } from '$lib/constants/boardData';

/** How long the dice-roll animation plays before revealing the result. */
export const DICE_ROLL_ANIMATION_MS = 5000;

class GameStore {
	gameState = $state<GameState | null>(null);
	playerId = $state<string | null>(null);
	sessionToken = $state<string | null>(null);
	roomCode = $state<string | null>(null);
	connection = $state<'idle' | 'connecting' | 'open' | 'closed'>('idle');
	lastError = $state<string | null>(null);
	/** True while the 5s dice-roll animation is playing. */
	diceAnimating = $state(false);
	/** Faces to display while animating (random shuffle); null = show authoritative dice. */
	displayDice = $state<[number, number] | null>(null);

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
		this.clearDiceAnimation();
	}

	// ——— 5s dice-roll animation ———
	// The server reveals the final dice immediately, so the client shuffles
	// random faces for DICE_ROLL_ANIMATION_MS before settling on the
	// authoritative result. `beginDiceRoll` gives the roller instant feedback
	// on click; `settleDiceRoll` is called when GAME_STATE arrives (for both
	// the roller and all spectators) and guarantees the full animation length.
	private diceAnimStart = 0;
	private diceShuffleTimer: ReturnType<typeof setInterval> | null = null;
	private diceSettleTimer: ReturnType<typeof setTimeout> | null = null;

	/** Start shuffling random faces immediately (optimistic, roller side). */
	beginDiceRoll() {
		if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
		this.clearDiceTimers();
		this.diceAnimStart = Date.now();
		this.diceAnimating = true;
		this.tickDiceShuffle();
		this.diceShuffleTimer = setInterval(() => this.tickDiceShuffle(), 120);
	}

	/** Reveal `final` dice after the full animation window has elapsed. */
	settleDiceRoll(final: [number, number]) {
		if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
			this.clearDiceAnimation();
			return;
		}
		if (!this.diceAnimating) {
			// Spectator path (or no optimistic start): begin shuffling now.
			this.beginDiceRoll();
		}
		const elapsed = Date.now() - this.diceAnimStart;
		const remaining = Math.max(0, DICE_ROLL_ANIMATION_MS - elapsed);
		if (this.diceSettleTimer) clearTimeout(this.diceSettleTimer);
		this.diceSettleTimer = setTimeout(() => {
			if (this.diceShuffleTimer) {
				clearInterval(this.diceShuffleTimer);
				this.diceShuffleTimer = null;
			}
			this.displayDice = final;
			this.diceAnimating = false;
			this.diceSettleTimer = null;
		}, remaining);
	}

	private tickDiceShuffle() {
		this.displayDice = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
	}

	private clearDiceTimers() {
		if (this.diceShuffleTimer) {
			clearInterval(this.diceShuffleTimer);
			this.diceShuffleTimer = null;
		}
		if (this.diceSettleTimer) {
			clearTimeout(this.diceSettleTimer);
			this.diceSettleTimer = null;
		}
	}

	private clearDiceAnimation() {
		this.clearDiceTimers();
		this.diceAnimating = false;
		this.displayDice = null;
		this.diceAnimStart = 0;
	}
}

export const gameStore = new GameStore();
