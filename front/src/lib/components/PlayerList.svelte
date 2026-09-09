<script lang="ts">
	import { gameStore } from '$lib/stores/gameStore.svelte';

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
</script>

<div class="rounded-2xl bg-white p-4 shadow">
	<h2 class="mb-2 font-semibold">Players</h2>
	{#if !gameStore.gameState}
		<p class="text-sm text-gray-500">এখনও কেউ যোগ দেয়নি।</p>
	{:else}
		<ul class="space-y-1">
			{#each gameStore.gameState.players as p (p.id)}
				{@const h = holdings(p.id)}
				<li class="flex flex-wrap items-center gap-2 text-sm" title="সম্পত্তি: {h.props}, বাড়ি/হোটেল: {h.houses}">
					<span
						class="inline-block h-3 w-3 rounded-full"
						style:background-color={p.tokenColor}
					></span>
					<span class="font-medium">{p.name}</span>
					<span class="text-gray-500">৳{p.cash}</span>
					<span class="text-gray-500">· 🏠{h.props}{#if h.houses > 0}+{h.houses}{/if}</span>
					{#if p.id === gameStore.gameState.currentTurnPlayerId}
						<span class="rounded bg-yellow-100 px-1 text-xs">● চাল</span>
					{/if}
					{#if !p.isConnected}
						<span class="rounded bg-gray-200 px-1 text-xs">অফলাইন</span>
					{/if}
					{#if p.isBankrupt}
						<span class="rounded bg-red-100 px-1 text-xs">দেউলিয়া</span>
					{/if}
				</li>
			{/each}
		</ul>
		<p class="mt-2 text-xs text-gray-400">বোর্ডে মালিকের রঙের বর্ডার দেখুন — যেকোনো ঘরে ক্লিক করলে বিস্তারিত দেখা যাবে।</p>
	{/if}
</div>
