<script lang="ts">
	import { gameStore } from '$lib/stores/gameStore.svelte';

	let { tileId, onclose }: { tileId: number | null; onclose: () => void } = $props();

	const tile = $derived(
		tileId != null ? gameStore.gameState?.tiles[tileId] : undefined
	);
</script>

{#if tileId != null && tile}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
		<div class="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
			<h3 class="text-xl font-bold">{tile.nameBn}</h3>
			<p class="text-sm text-gray-500">{tile.nameEn}</p>
			{#if tile.price}
				<p class="mt-2">মূল্য: ৳{tile.price}</p>
			{/if}
			{#if tile.rentTiers}
				<p class="mt-1 text-sm">ভাড়া: ৳{tile.rentTiers[0]} থেকে ৳{tile.rentTiers[5]}</p>
			{/if}
			<button
				class="mt-4 w-full rounded-lg bg-gray-800 px-4 py-2 text-white"
				onclick={onclose}
			>
				বন্ধ করুন
			</button>
		</div>
	</div>
{/if}
