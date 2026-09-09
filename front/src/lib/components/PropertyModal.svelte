<script lang="ts">
	import { gameStore } from '$lib/stores/gameStore.svelte';
	import { tileIcon } from '$lib/utils/tileIcons';

	let { tileId, onclose }: { tileId: number | null; onclose: () => void } = $props();

	const tile = $derived(
		tileId != null ? gameStore.gameState?.tiles[tileId] : undefined
	);
	const owner = $derived(
		tile?.ownerId
			? gameStore.gameState?.players.find((p) => p.id === tile.ownerId)
			: undefined
	);
	const levelLabel = $derived(
		!tile ? '' : tile.houses >= 5 ? 'হোটেল' : tile.houses > 0 ? `বাড়ি ×${tile.houses}` : 'খালি জমি'
	);
	const currentRent = $derived(
		tile?.rentTiers
			? tile.rentTiers[Math.min(tile.houses, 5)]
			: undefined
	);
</script>

{#if tileId != null && tile}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
		<div class="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
			<h3 class="text-xl font-bold">
				{#if tileIcon(tile)}<span class="mr-1">{tileIcon(tile)}</span>{/if}{tile.nameBn}
			</h3>
			<p class="text-sm text-gray-500">{tile.nameEn}</p>
			{#if tile.price}
				<p class="mt-2">মূল্য: ৳{tile.price}</p>
			{/if}
			<p class="mt-1 flex items-center gap-2 text-sm">
				<span>মালিক:</span>
				{#if owner}
					<span
						class="inline-block h-3 w-3 rounded-full"
						style:background-color={owner.tokenColor}
					></span>
					<span class="font-medium">{owner.name}</span>
				{:else}
					<span class="text-gray-500">ব্যাংক (কেনা যায়)</span>
				{/if}
			</p>
			{#if tile.type === 'PROPERTY'}
				<p class="mt-1 text-sm">অবস্থা: {levelLabel}</p>
			{/if}
			{#if tile.rentTiers}
				<div class="mt-2 text-sm">
					<p class="font-medium">ভাড়া তালিকা:</p>
					<ul class="mt-1 grid grid-cols-3 gap-1 text-center">
						{#each tile.rentTiers as rent, i}
							<li
								class="rounded px-1 py-0.5 {i === Math.min(tile.houses, 5)
									? 'bg-green-100 font-bold'
									: 'bg-gray-50'}"
							>
								{i === 5 ? 'হোটেল' : i === 0 ? 'খালি' : i + '🏠'}: ৳{rent}
							</li>
						{/each}
					</ul>
					{#if currentRent !== undefined && owner}
						<p class="mt-1">বর্তমান ভাড়া: <b>৳{currentRent}</b></p>
					{/if}
				</div>
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
