<script lang="ts">
	import { gameStore } from '$lib/stores/gameStore.svelte';
	import CashDisplay from '$lib/components/CashDisplay.svelte';
	import { tileIcon } from '$lib/utils/tileIcons';

	/** Property + house counts per player, derived from authoritative tiles. */
	function holdings(playerId: string): { props: number; houses: number } {
		let props = 0;
		let houses = 0;
		const tiles = gameStore.gameState?.tiles;
		if (!tiles) return { props, houses };
		for (const t of Object.values(tiles)) {
			if (t.ownerId === playerId) {
				props += 1;
				houses += t.type === 'PROPERTY' ? Math.min(t.houses, 5) : 0;
			}
		}
		return { props, houses };
	}

	const tokenShapes = ['circle', 'square', 'triangle', 'diamond', 'star', 'hexagon', 'pentagon', 'plus', 'ring', 'shield'];

	/** Where a player token sits, e.g. "🚂 পাহাড়তলী স্টেশন". */
	function locationOf(position: number): string {
		const t = gameStore.gameState?.tiles[position];
		if (!t) return `ঘর ${position}`;
		const icon = tileIcon(t);
		return icon ? `${icon} ${t.nameBn}` : t.nameBn;
	}
</script>

<div>
	<h2 class="mb-2 text-sm font-semibold tracking-wide text-emerald-800">👥 Players</h2>
	{#if !gameStore.gameState}
		<p class="text-sm text-slate-500">এখনও কেউ যোগ দেয়নি।</p>
	{:else}
		<ul class="space-y-1.5">
			{#each gameStore.gameState.players as p, i (p.id)}
				{@const h = holdings(p.id)}
				{@const isTurn = p.id === gameStore.gameState.currentTurnPlayerId}
				<li
					class="flex flex-wrap items-center gap-2 rounded-xl border px-2.5 py-1.5 text-sm transition {isTurn
						? 'anim-turn-pulse border-amber-600/50 bg-amber-100'
						: 'border-slate-200 bg-slate-50'} {p.isBankrupt ? 'opacity-50 saturate-50' : ''}"
					title="সম্পত্তি: {h.props}, বাড়ি/হোটেল: {h.houses}"
				>
					<span
						class="inline-block h-3 w-3 {tokenShapes[i % tokenShapes.length]}"
						style:background-color={p.tokenColor}
					></span>
					<span class="font-medium text-slate-800">{p.name}</span>
					<CashDisplay cash={p.cash} />
					<span class="text-slate-500">· 🏠{h.props}{#if h.houses > 0}+{h.houses}{/if}</span>
					{#if isTurn}
						<span class="anim-glow-drift rounded-full bg-amber-500/20 px-1.5 text-xs font-bold text-amber-800">
							● চাল
						</span>
					{/if}
					{#if !p.isConnected}
						<span class="rounded-full bg-slate-200 px-1.5 text-xs text-slate-500">অফলাইন</span>
					{/if}
					{#if p.isBankrupt}
						<span class="rounded-full bg-red-100 px-1.5 text-xs text-red-700">💸 দেউলিয়া</span>
					{/if}
					<span class="w-full text-xs text-slate-500" title="বর্তমান অবস্থান">
						📍 {locationOf(p.position)}
					</span>
				</li>
			{/each}
		</ul>
		<p class="mt-2 text-xs text-slate-500">
			বোর্ডে মালিকের রঙের বর্ডার দেখুন — যেকোনো ঘরে ক্লিক করলে বিস্তারিত দেখা যাবে।
		</p>
		{#if gameStore.gameState.status === 'IN_GAME' && gameStore.gameState.players.length < 10}
			<p class="mt-1 rounded-xl border border-emerald-700/20 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
				নতুন খেলোয়াড় Room Code ({gameStore.gameState.roomId}) দিয়ে খেলার মাঝেও যোগ দিতে পারবে — ৳1500 নিয়ে শুরু করবে।
			</p>
		{/if}
	{/if}
</div>

<style>
	.circle { border-radius: 9999px; }
	.square { border-radius: 2px; }
	.triangle { clip-path: polygon(50% 0, 100% 100%, 0 100%); }
	.diamond { transform: rotate(45deg) scale(0.78); border-radius: 2px; }
	.star { clip-path: polygon(50% 0, 61% 35%, 98% 35%, 68% 57%, 79% 100%, 50% 73%, 21% 100%, 32% 57%, 2% 35%, 39% 35%); }
	.hexagon { clip-path: polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%); }
	.pentagon { clip-path: polygon(50% 0, 100% 38%, 82% 100%, 18% 100%, 0 38%); }
	.plus { clip-path: polygon(35% 0, 65% 0, 65% 35%, 100% 35%, 100% 65%, 65% 65%, 65% 100%, 35% 100%, 35% 65%, 0 65%, 0 35%, 35% 35%); }
	.ring { border: 3px solid currentColor; border-radius: 9999px; background: transparent !important; }
	.shield { clip-path: polygon(50% 0, 95% 18%, 85% 72%, 50% 100%, 15% 72%, 5% 18%); }
</style>
