<script lang="ts">
	import { gameStore } from '$lib/stores/gameStore.svelte';

	const gs = $derived(gameStore.gameState);
	const turnPlayer = $derived(
		gs?.status === 'IN_GAME'
			? gs.players.find((p) => p.id === gs.currentTurnPlayerId)
			: undefined
	);
	const turnTile = $derived(
		turnPlayer && gs ? gs.tiles[turnPlayer.position]?.type : undefined
	);
	const lastCard = $derived(
		gs?.status === 'IN_GAME' &&
		gs.lastCard &&
		gs.lastCard.turnPlayerId === gs.currentTurnPlayerId
			? gs.lastCard
			: undefined
	);
	// "Next up" pile: the deck the current turn player is standing on, else
	// the deck that was just drawn from this turn.
	const nextDeck = $derived(
		turnTile === 'CHANCE' || turnTile === 'CHEST' ? turnTile : lastCard?.deck
	);
	const chanceLeft = $derived(gs?.chanceRemaining ?? 16);
	const chestLeft = $derived(gs?.chestRemaining ?? 16);
	const toneClass = $derived(
		lastCard?.tone === 'good'
			? 'border-emerald-600/30 bg-emerald-50 text-emerald-900'
			: lastCard?.tone === 'bad'
				? 'border-red-600/30 bg-red-50 text-red-800'
				: 'border-slate-200 bg-slate-50 text-slate-700'
	);
</script>

{#if gs && gs.status === 'IN_GAME'}
	<section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
		<h2 class="mb-2 text-sm font-semibold tracking-wide text-slate-600">🎴 ভাগ্য ও সুযোগ</h2>
		<div class="grid grid-cols-2 gap-2">
			<div
				class="rounded-xl border-2 px-3 py-2 text-center transition {nextDeck === 'CHANCE'
					? 'border-amber-500 bg-amber-50 shadow-[0_0_16px_-4px_rgba(245,158,11,0.6)]'
					: 'border-slate-200 bg-slate-50'}"
			>
				<p class="text-sm font-bold text-slate-800">🎲 ভাগ্য পরীক্ষা</p>
				<p class="text-xs text-slate-500">{chanceLeft}টি বাকি</p>
				{#if nextDeck === 'CHANCE'}
					<p class="mt-1 inline-block rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-bold text-white">
						⬆ পরের পালা
					</p>
				{/if}
			</div>
			<div
				class="rounded-xl border-2 px-3 py-2 text-center transition {nextDeck === 'CHEST'
					? 'border-amber-500 bg-amber-50 shadow-[0_0_16px_-4px_rgba(245,158,11,0.6)]'
					: 'border-slate-200 bg-slate-50'}"
			>
				<p class="text-sm font-bold text-slate-800">🎁 সুযোগ গ্রহণ</p>
				<p class="text-xs text-slate-500">{chestLeft}টি বাকি</p>
				{#if nextDeck === 'CHEST'}
					<p class="mt-1 inline-block rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-bold text-white">
						⬆ পরের পালা
					</p>
				{/if}
			</div>
		</div>
		{#if lastCard}
			<div class="mt-2 rounded-xl border px-3 py-2 text-center text-sm font-medium {toneClass}">
				{lastCard.deck === 'CHANCE' ? '🎲' : '🎁'}
				{lastCard.text}
			</div>
		{/if}
	</section>
{/if}
