<script lang="ts">
	import { gameStore } from '$lib/stores/gameStore.svelte';
</script>

<div class="rounded-2xl bg-white p-4 shadow">
	<h2 class="mb-2 font-semibold">Players</h2>
	{#if !gameStore.gameState}
		<p class="text-sm text-gray-500">এখনও কেউ যোগ দেয়নি।</p>
	{:else}
		<ul class="space-y-1">
			{#each gameStore.gameState.players as p (p.id)}
				<li class="flex items-center gap-2 text-sm">
					<span
						class="inline-block h-3 w-3 rounded-full"
						style:background-color={p.tokenColor}
					></span>
					<span class="font-medium">{p.name}</span>
					<span class="text-gray-500">৳{p.cash}</span>
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
	{/if}
</div>
