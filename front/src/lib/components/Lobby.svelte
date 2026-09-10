<script lang="ts">
	import { gameStore } from '$lib/stores/gameStore.svelte';
	import { connect, send } from '$lib/utils/websocket';

	let playerName = $state('');
	let roomCode = $state('');

	function createRoom() {
		if (!playerName.trim()) return;
		connect();
		const wait = setInterval(() => {
			if (gameStore.connection === 'open') {
				clearInterval(wait);
				send('CREATE_ROOM', { playerName: playerName.trim() });
			}
		}, 100);
	}

	function joinRoom() {
		if (!playerName.trim() || !roomCode.trim()) return;
		connect();
		const wait = setInterval(() => {
			if (gameStore.connection === 'open') {
				clearInterval(wait);
				send('JOIN_ROOM', { roomId: roomCode.trim().toUpperCase(), playerName: playerName.trim() });
			}
		}, 100);
	}
</script>

<div class="mx-auto max-w-md space-y-6 rounded-2xl bg-white p-6 shadow-lg">
	<h1 class="text-center text-3xl font-bold">মহাজনি</h1>
	<p class="text-center text-sm text-gray-500">বাংলাদেশের মনোপলি — বন্ধুদের সাথে অনলাইনে খেলুন</p>

	<label class="block">
		<span class="mb-1 block text-sm font-medium">আপনার নাম</span>
		<input
			class="w-full rounded-lg border px-3 py-2"
			bind:value={playerName}
			placeholder="যেমন: রাফি"
		/>
	</label>

	<button
		class="w-full rounded-lg bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700"
		onclick={createRoom}
	>
		ঘর তৈরি করুন
	</button>

	<div class="border-t pt-4">
		<label class="block">
			<span class="mb-1 block text-sm font-medium">Room Code</span>
			<input
				class="w-full rounded-lg border px-3 py-2 uppercase"
				bind:value={roomCode}
				placeholder="BD8921"
				maxlength={6}
			/>
		</label>
		<button
			class="mt-2 w-full rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
			onclick={joinRoom}
		>
			ঘরে যোগ দিন
		</button>
		<p class="mt-2 text-center text-xs text-gray-500">খেলা শুরু হয়ে গেলেও Room Code দিয়ে মাঝখানে যোগ দেওয়া যাবে।</p>
	</div>

	{#if gameStore.lastError}
		<p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{gameStore.lastError}</p>
	{/if}
</div>
