<script lang="ts">
	import { onMount } from 'svelte';
	import Lobby from '$lib/components/Lobby.svelte';
	import BoardCanvas from '$lib/components/BoardCanvas.svelte';
	import ActionPanel from '$lib/components/ActionPanel.svelte';
	import PlayerList from '$lib/components/PlayerList.svelte';
	import PropertyModal from '$lib/components/PropertyModal.svelte';
	import { gameStore } from '$lib/stores/gameStore.svelte';
	import { connect, hasSavedSession } from '$lib/utils/websocket';

	let selectedTile: number | null = $state(null);

	onMount(() => {
		// Reload / dropped connection: the store starts empty but the seat
		// lives on the server for 120s — auto-RECONNECT to retain play state.
		if (!gameStore.gameState && hasSavedSession()) {
			connect({ resume: true });
		}
	});

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
			<h1 class="text-2xl font-bold">ধনী হওয়ার মজার খেলা</h1>
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
				{#if gameStore.connection !== 'open' && gameStore.gameState}
					<span class="ml-1">— পুনরায় সংযোগ হচ্ছে… আপনার চাল সংরক্ষিত আছে।</span>
				{/if}
			</span>
		</header>

		<div class="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[1fr_320px]">
			<div class="order-1">
				<BoardCanvas onselect={(id) => (selectedTile = id)} />
			</div>
			<div class="order-2 flex flex-col gap-4 lg:col-start-2 lg:row-span-2">
				<PlayerList />
				<ActionPanel />
			</div>
			{#if gameStore.gameState}
				<div class="order-3 rounded-2xl bg-white p-4 shadow lg:col-start-1">
					<h2 class="mb-1 font-semibold">খেলার লগ</h2>
					<ul class="max-h-32 space-y-0.5 overflow-y-auto text-sm text-gray-700">
						{#each [...gameStore.gameState.logs].reverse().slice(0, 20) as log}
							<li>{log}</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
	{/if}

	<PropertyModal tileId={selectedTile} onclose={() => (selectedTile = null)} />
</main>
