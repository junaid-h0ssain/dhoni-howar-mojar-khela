<script lang="ts">
	import { gameStore } from '$lib/stores/gameStore.svelte';
	import { send } from '$lib/utils/websocket';
	import { diceFace } from '$lib/utils/dice';

	let buildTileId = $state<number | null>(null);

	const tilesList = $derived(
		Object.values(gameStore.gameState?.tiles ?? {}).sort((a, b) => a.id - b.id)
	);
	const unsoldCount = $derived(
		tilesList.filter(
			(t) =>
				(t.type === 'PROPERTY' || t.type === 'UTILITY' || t.type === 'RAILROAD') &&
				!t.ownerId
		).length
	);
	const allSold = $derived(
		!!gameStore.gameState && gameStore.gameState.status === 'IN_GAME' && unsoldCount === 0
	);
	const myBuildable = $derived(
		tilesList.filter(
			(t) => t.type === 'PROPERTY' && t.ownerId === gameStore.playerId && t.houses < 5
		)
	);
	const buildTile = $derived(tilesList.find((t) => t.id === buildTileId));
	const buildLabel = $derived(
		!buildTile ? '' : buildTile.houses >= 4 ? 'হোটেল তৈরি করুন' : 'বাড়ি তৈরি করুন'
	);

	$effect(() => {
		// Default the dropdown to the first buildable tile.
		if (buildTileId == null && myBuildable.length > 0) {
			buildTileId = myBuildable[0].id;
		}
		if (buildTileId != null && !myBuildable.some((t) => t.id === buildTileId)) {
			buildTileId = myBuildable.length > 0 ? myBuildable[0].id : null;
		}
	});

	function levelLabel(houses: number): string {
		if (houses >= 5) return 'হোটেল';
		if (houses > 0) return `বাড়ি ×${houses}`;
		return 'খালি জমি';
	}
</script>

<div class="rounded-2xl bg-white p-4 shadow">
	<h2 class="mb-2 font-semibold">চাল</h2>
	{#if gameStore.gameState?.status === 'IN_GAME'}
		{@const [d1, d2] = gameStore.gameState.dice}
		<p class="mb-2 text-center text-2xl tracking-widest" title="সর্বশেষ দান">
			{diceFace(d1)}{diceFace(d2)}
			<span class="ml-1 align-middle text-sm text-gray-500">= {d1 + d2}</span>
		</p>
	{/if}
	{#if !gameStore.gameState}
		<p class="text-sm text-gray-500">ঘরে যোগ দিন।</p>
	{:else if gameStore.gameState.status === 'LOBBY'}
		{#if gameStore.isHost}
			<button
				class="w-full rounded-lg bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700"
				onclick={() => send('START_GAME')}
			>
				খেলা শুরু করুন
			</button>
		{:else}
			<p class="text-sm text-gray-500">হোস্ট খেলা শুরু করার অপেক্ষায়…</p>
		{/if}
	{:else if gameStore.gameState.status === 'FINISHED'}
		<p class="text-lg">🏆 বিজয়ী: {gameStore.gameState.players.find((p) => p.id === gameStore.gameState?.winnerId)?.name ?? '—'}</p>
	{:else if gameStore.canRoll}
		<button
			class="w-full rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
			onclick={() => send('ROLL_DICE')}
		>
			দান চালুন (Roll Dice)
		</button>
	{:else if gameStore.canAct}
		{#if gameStore.me?.inJail}
			<p class="mb-2 text-sm text-gray-600">জেলে আছেন — জোড়া ফেলে মুক্ত হোন অথবা দান শেষ করুন।</p>
		{/if}
		<div class="flex flex-col gap-2">
			<button
				class="rounded-lg bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700"
				onclick={() => send('BUY_PROPERTY', { tileId: gameStore.me?.position ?? 0 })}
			>
				সম্পত্তি কিনুন
			</button>
			{#if !allSold}
				<p class="rounded-lg bg-gray-100 px-3 py-2 text-center text-xs text-gray-600">
					সব সম্পত্তি বিক্রি হলে বাড়ি/হোটেল তৈরি করা যাবে ({unsoldCount}টি বাকি)।
				</p>
			{:else if myBuildable.length === 0}
				<p class="rounded-lg bg-gray-100 px-3 py-2 text-center text-xs text-gray-600">
					তৈরি করার মতো সম্পত্তি নেই (পুরো গ্রুপ + খালি জায়গা থাকতে হবে)।
				</p>
			{:else}
				<div class="rounded-lg border border-purple-200 bg-purple-50 p-2">
					<p class="mb-1 text-xs font-medium text-purple-900">
						বাড়ি → হোটেল (সর্বোচ্চ: ৪ বাড়ি, তারপর হোটেল)
					</p>
					<select
						class="mb-2 w-full rounded-lg border border-purple-300 bg-white px-2 py-1.5 text-sm"
						bind:value={buildTileId}
					>
						{#each myBuildable as t (t.id)}
							<option value={t.id}>
								{t.nameBn} · {levelLabel(t.houses)} · ৳{t.houseCost}
							</option>
						{/each}
					</select>
					<button
						class="w-full rounded-lg bg-purple-600 px-4 py-2 text-white hover:bg-purple-700 disabled:opacity-50"
						disabled={buildTileId == null}
						onclick={() => {
							if (buildTileId != null) send('BUILD_HOUSE', { tileId: buildTileId });
						}}
					>
						{buildLabel || 'বাড়ি তৈরি করুন'} {buildTile ? `(৳${buildTile.houseCost})` : ''}
					</button>
				</div>
			{/if}
			<button
				class="rounded-lg bg-amber-600 px-4 py-2 text-white hover:bg-amber-700"
				onclick={() => send('END_TURN')}
			>
				দান শেষ করুন
			</button>
		</div>
	{:else if gameStore.canEndTurn}
		{#if gameStore.me?.inJail}
			<p class="mb-2 text-sm text-gray-600">জেলে আছেন ({gameStore.me.jailTurns + 1}/3) — পরের চালে জোড়া ফেলার চেষ্টা করুন।</p>
		{/if}
		<button
			class="w-full rounded-lg bg-amber-600 px-4 py-2 font-semibold text-white hover:bg-amber-700"
			onclick={() => send('END_TURN')}
		>
			দান শেষ করুন
		</button>
	{:else}
		<p class="text-sm text-gray-500">
			{gameStore.currentPlayer?.name ?? '—'} এর চাল চলছে…
		</p>
	{/if}
</div>
