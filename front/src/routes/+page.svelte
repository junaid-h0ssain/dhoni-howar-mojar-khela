<script lang="ts">
	import Lobby from '$lib/components/Lobby.svelte';
	import BoardCanvas from '$lib/components/BoardCanvas.svelte';
	import ActionPanel from '$lib/components/ActionPanel.svelte';
	import PlayerList from '$lib/components/PlayerList.svelte';
	import PropertyModal from '$lib/components/PropertyModal.svelte';
	import { gameStore } from '$lib/stores/gameStore.svelte';

	let selectedTile: number | null = $state(null);

	function copyRoomCode() {
		if (gameStore.roomCode) navigator.clipboard?.writeText(gameStore.roomCode).catch(() => {});
	}
</script>

<main class="min-h-screen bg-gradient-to-b from-emerald-50 to-slate-100 p-4">
	{#if !gameStore.gameState && !gameStore.roomCode}
		<div class="py-10">
			<Lobby />
		</div>
	{:else}
		<header class="mx-auto mb-4 flex max-w-6xl flex-wrap items-center justify-between gap-2">
			<h1 class="text-2xl font-bold">মহাজনি</h1>
			{#if gameStore.roomCode}
				<button
					class="rounded-lg bg-white px-3 py-1 font-mono text-lg shadow"
					onclick={copyRoomCode}
					title="কপি করুন"
				>
					{gameStore.roomCode} ⧉
				</button>
			{/if}
			<span class="text-xs text-gray-500">
				সংযোগ: {gameStore.connection === 'open' ? '🟢 সংযুক্ত' : '🔴 বিচ্ছিন্ন'}
			</span>
		</header>

		<div class="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[1fr_320px]">
			<div>
				<BoardCanvas />
				{#if gameStore.gameState}
					<div class="mt-4 rounded-2xl bg-white p-4 shadow">
						<h2 class="mb-1 font-semibold">খেলার লগ</h2>
						<ul class="max-h-32 space-y-0.5 overflow-y-auto text-sm text-gray-700">
							{#each [...gameStore.gameState.logs].reverse().slice(0, 20) as log}
								<li>{log}</li>
							{/each}
						</ul>
					</div>
				{/if}
			</div>
			<div class="flex flex-col gap-4">
				<PlayerList />
				<ActionPanel />
			</div>
		</div>
	{/if}

	<PropertyModal tileId={selectedTile} onclose={() => (selectedTile = null)} />
</main>
