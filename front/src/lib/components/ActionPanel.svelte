<script lang="ts">
	import { gameStore } from '$lib/stores/gameStore.svelte';
	import { send } from '$lib/utils/websocket';
	import { diceFace } from '$lib/utils/dice';
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
