<script lang="ts">
	import { onMount } from 'svelte';
	import { gameStore } from '$lib/stores/gameStore.svelte';
	import {
		connect,
		send,
		hasSavedSession,
		loadSavedSession,
		reconnectSaved,
		clearSavedSession,
		savePlayerName,
		type SavedSession
	} from '$lib/utils/websocket';

	let playerName = $state('');
	let roomCode = $state('');
	let saved: SavedSession | null = $state(null);

	onMount(() => {
		saved = loadSavedSession();
		if (saved?.playerName) playerName = saved.playerName;
	});

	function refreshSaved() {
		saved = loadSavedSession();
	}

	function createRoom() {
		if (!playerName.trim()) return;
		savePlayerName(playerName.trim());
		clearSavedSession();
		savePlayerName(playerName.trim());
		connect({ resume: false });
		const wait = setInterval(() => {
			if (gameStore.connection === 'open') {
				clearInterval(wait);
				send('CREATE_ROOM', { playerName: playerName.trim() });
			}
		}, 100);
	}

	function joinRoom() {
		if (!playerName.trim() || !roomCode.trim()) return;
		savePlayerName(playerName.trim());
		clearSavedSession();
		savePlayerName(playerName.trim());
		connect({ resume: false });
		const wait = setInterval(() => {
			if (gameStore.connection === 'open') {
				clearInterval(wait);
				send('JOIN_ROOM', { roomId: roomCode.trim().toUpperCase(), playerName: playerName.trim() });
			}
		}, 100);
	}

	function rejoin() {
		const s = loadSavedSession();
		if (s?.playerName) playerName = s.playerName;
		reconnectSaved();
	}

	function forgetSession() {
		clearSavedSession();
		refreshSaved();
	}
</script>

<div class="mx-auto max-w-md space-y-6 rounded-2xl bg-white p-6 shadow-lg">
	<h1 class="text-center text-3xl font-bold">ধনী হওয়ার মজার খেলা</h1>
	<p class="text-center text-sm text-gray-500">ধনী হওয়ার মজার খেলা — বন্ধুদের সাথে অনলাইনে খেলুন</p>

	{#if saved}
		<div class="rounded-xl border border-amber-300 bg-amber-50 p-3">
			<p class="text-sm font-medium text-amber-900">
				আপনার আগের খেলা এখনও চলছে — ঘর {saved.roomId}
			</p>
			<p class="mt-0.5 text-xs text-amber-700">
				রিলোড বা সংযোগ বিচ্ছিন্ন হলেও আপনার টাকা, অবস্থান ও সম্পত্তি সংরক্ষিত আছে।
			</p>
			<div class="mt-2 flex gap-2">
				<button
					class="flex-1 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
					onclick={rejoin}
				>
					আবার যোগ দিন
				</button>
				<button
					class="rounded-lg border px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
					onclick={forgetSession}
					title="পুরনো সেশন মুছে নতুন করে শুরু করুন"
				>
					ভুলে যান
				</button>
			</div>
		</div>
	{/if}

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
