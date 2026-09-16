<script lang="ts">
	import { onMount } from 'svelte';
	import { gameStore } from '$lib/stores/gameStore.svelte';
	import SplitText from '$lib/components/svelte-bits/SplitText.svelte';
	import ClickSpark from '$lib/components/svelte-bits/ClickSpark.svelte';
	import RoomSettings from '$lib/components/RoomSettings.svelte';
	import {
		createRoom,
		joinRoomByCode,
		loadSavedSession,
		loadLastRoomId,
		reconnectSaved,
		clearSavedSession,
		savePlayerName,
		type SavedSession
	} from '$lib/utils/polling';

	let playerName = $state('');
	let roomCode = $state('');
	let saved: SavedSession | null = $state(null);
	let busy = $state(false);
	// Room rules for the room we're about to create (host's choice).
	let startCash = $state(1500);
	let goSalary = $state(200);
	let extremeMode = $state(false);

	onMount(() => {
		saved = loadSavedSession();
		if (saved?.playerName) playerName = saved.playerName;
		// Seat expired but we remember the room: prefill for a quick rejoin.
		if (!roomCode) {
			const last = loadLastRoomId();
			if (last) roomCode = last;
		}
		if (saved) roomCode = saved.roomId;
	});

	function refreshSaved() {
		saved = loadSavedSession();
	}

	async function createRoomHandler() {
		if (!playerName.trim() || busy) return;
		busy = true;
		try {
			savePlayerName(playerName.trim());
			clearSavedSession();
			savePlayerName(playerName.trim());
			await createRoom(playerName.trim(), { startCash, goSalary, extremeMode });
		} finally {
			busy = false;
		}
	}

	async function joinRoomHandler() {
		if (!playerName.trim() || !roomCode.trim() || busy) return;
		busy = true;
		try {
			savePlayerName(playerName.trim());
			clearSavedSession();
			savePlayerName(playerName.trim());
			await joinRoomByCode(roomCode.trim().toUpperCase(), playerName.trim());
		} finally {
			busy = false;
		}
	}

	async function rejoin() {
		const s = loadSavedSession();
		if (s?.playerName) playerName = s.playerName;
		await reconnectSaved();
	}

	function forgetSession() {
		clearSavedSession();
		refreshSaved();
	}
</script>

<div class="mx-auto max-w-md space-y-5">
	<div class="text-center">
		<p class="mb-2 inline-block rounded-full border border-amber-600/30 bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">
			🎲 বন্ধুদের সাথে অনলাইন মহাজনি 🎲
		</p>
		<SplitText
			text="ধনী হওয়ার মজার খেলা"
			tag="h1"
			splitType="chars"
			delay={45}
			duration={0.9}
			class="text-4xl font-bold text-emerald-950 sm:text-5xl"
		/>
		<div class="mt-2">
			<p class="text-sm text-emerald-800/80">
				চট্টগ্রামের অলিগলি কিনুন, বাড়ি তুলুন, বন্ধুদের ফকির বানান!
			</p>
		</div>
		<div class="mt-3 flex items-center justify-center gap-4 text-2xl" aria-hidden="true">
			<span class="anim-float-slow inline-block">🏠</span>
			<span class="anim-float-slow inline-block" style:animation-delay="-1.5s">🎲</span>
			<span class="anim-float-slow inline-block" style:animation-delay="-3s">💰</span>
		</div>
	</div>

	{#if saved}
		<div class="anim-log-in rounded-2xl border border-amber-600/30 bg-amber-50 p-4">
			<p class="text-sm font-medium text-amber-900">
				আপনার আগের খেলা এখনও চলছে — ঘর {saved.roomId}
			</p>
			<p class="mt-0.5 text-xs text-amber-800/70">
				রিলোড বা সংযোগ বিচ্ছিন্ন হলেও আপনার টাকা, অবস্থান ও সম্পত্তি সংরক্ষিত আছে।
			</p>
			<div class="mt-2 flex gap-2">
				<button
					class="flex-1 rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-amber-950 transition hover:bg-amber-300 active:scale-95"
					onclick={rejoin}
				>
					আবার যোগ দিন ⚡
				</button>
				<button
					class="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100"
					onclick={forgetSession}
					title="পুরনো সেশন মুছে নতুন করে শুরু করুন"
				>
					ভুলে যান
				</button>
			</div>
		</div>
	{/if}

	<div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
		<ClickSpark sparkColor="#059669" sparkCount={10} sparkRadius={24}>
			<div class="space-y-4">
				<label class="block">
					<span class="mb-1 block text-sm font-medium text-slate-700">আপনার নাম</span>
					<input
						class="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
						bind:value={playerName}
						placeholder="যেমন: ঝন্টু"
					/>
				</label>

				<RoomSettings bind:startCash bind:goSalary bind:extremeMode editable={!busy} />

				<button
					class="w-full rounded-xl bg-emerald-600 px-4 py-2.5 font-bold text-white transition hover:bg-emerald-500 active:scale-95 disabled:opacity-50"
					disabled={busy}
					onclick={createRoomHandler}
				>
					{busy ? '…' : '🏝️ ঘর তৈরি করুন'}
				</button>

				<div class="border-t border-slate-200 pt-4">
					<label class="block">
						<span class="mb-1 block text-sm font-medium text-slate-700">Room Code</span>
						<input
							class="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-mono text-lg tracking-[0.3em] text-slate-900 uppercase placeholder:text-slate-400 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
							bind:value={roomCode}
							placeholder="1234"
							maxlength={4}
							inputmode="numeric"
							pattern="[0-9]*"
							autocomplete="one-time-code"
							enterkeyhint="go"
						/>
					</label>
					<button
						class="mt-2 w-full rounded-xl bg-blue-600 px-4 py-2.5 font-bold text-white transition hover:bg-blue-500 active:scale-95 disabled:opacity-50"
						disabled={busy}
						onclick={joinRoomHandler}
					>
						{busy ? '…' : 'ঘরে যোগ দিন 🚪'}
					</button>
						<p class="mt-2 text-center text-xs text-slate-500">
							খেলা শুরু হয়ে গেলেও Room Code দিয়ে মাঝখানে যোগ দেওয়া যাবে। একই নামে
							ঢুকলে আগের টাকা-জমি-চাল ফিরে পাবেন।
						</p>
				</div>

				{#if gameStore.lastError}
					<p class="anim-log-in rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
						{gameStore.lastError}
					</p>
				{/if}
			</div>
		</ClickSpark>
	</div>

	<p class="text-center text-xs text-slate-500">
		ইঙ্গিত: ২–১০ জন মিলে খেলুন · পাশা সার্ভার থেকে আসে, চুরির সুযোগ নেই 😉
	</p>
</div>
