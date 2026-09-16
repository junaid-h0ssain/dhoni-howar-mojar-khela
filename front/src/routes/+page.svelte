<script lang="ts">
	import { onMount } from 'svelte';
	import Lobby from '$lib/components/Lobby.svelte';
	import BoardCanvas from '$lib/components/BoardCanvas.svelte';
	import ActionPanel from '$lib/components/ActionPanel.svelte';
	import CardDecks from '$lib/components/CardDecks.svelte';
	import PlayerList from '$lib/components/PlayerList.svelte';	import PropertyModal from '$lib/components/PropertyModal.svelte';
	import PlayerModal from '$lib/components/PlayerModal.svelte';
	import SoldOutModal from '$lib/components/SoldOutModal.svelte';
	import ClickSpark from '$lib/components/svelte-bits/ClickSpark.svelte';
	import { gameStore } from '$lib/stores/gameStore.svelte';
	import { connect, hasSavedSession, leaveRoom, retryNow, getReconnectAttempts } from '$lib/utils/polling';
	import { playDiceRoll, playDouble, playBuild, playJail, unlockAudio, isMuted, setMuted } from '$lib/utils/sound';

	let selectedTile: number | null = $state(null);
	let selectedPlayer: string | null = $state(null);
	let showSoldOut = $state(false);
	let soldOutSeenFor: string | null = $state(null);
	let soundMuted = $state(false);
	// Log watermark: only entries appended after we first see the state can
	// trigger sounds, so joining mid-game never blasts audio.
	let seenLogCount = $state(-1);

	function handleLeave() {
		selectedTile = null;
		selectedPlayer = null;
		leaveRoom();
	}

	onMount(() => {
		// Reload / dropped connection: the store starts empty but the seat and
		// game live on the server for 24h — auto-RECONNECT to retain play state.
		if (!gameStore.gameState && hasSavedSession()) {
			connect({ resume: true });
		}
		soundMuted = isMuted();
		// Browsers block audio until a gesture — unlock on first interaction.
		const unlock = () => unlockAudio();
		window.addEventListener('pointerdown', unlock, { once: true });
		window.addEventListener('keydown', unlock, { once: true });
	});

	function toggleMute() {
		soundMuted = !soundMuted;
		setMuted(soundMuted);
		if (!soundMuted) playDiceRoll();
	}

	// Game sounds: react to newly appended authoritative log entries.
	// Dice ("পাশা ফেলেছেন") → rattle; double-six ("জোড়া পেয়েছেন") layers a
	// fanfare on top; builds ("বাড়ি/হোটেল/ধাপ তৈরি") → cha-ching; sent to
	// jail ("জেলে গেছেন") → sting. Build matching is deliberately specific:
	// "ঘর তৈরি করেছেন" (room creation) must NOT trigger the build sound.
	$effect(() => {
		const logs = gameStore.gameState?.logs;
		if (!logs) return;
		if (seenLogCount < 0) {
			seenLogCount = logs.length;
			return;
		}
		if (logs.length <= seenLogCount) return;
		const fresh = logs.slice(seenLogCount);
		seenLogCount = logs.length;
		if (fresh.some((l) => l.includes('পাশা ফেলেছেন'))) playDiceRoll();
		if (fresh.some((l) => l.includes('জোড়া পেয়েছেন'))) playDouble();
		if (
			fresh.some((l) => l.includes('বাড়ি তৈরি') || l.includes('হোটেল তৈরি') || l.includes('ধাপ তৈরি'))
		) {
			playBuild();
		}
		if (fresh.some((l) => l.includes('জেলে গেছেন'))) playJail();
	});

	function copyRoomCode() {
		if (gameStore.roomCode) navigator.clipboard?.writeText(gameStore.roomCode).catch(() => {});
	}

	const inGame = $derived(!!gameStore.gameState || !!gameStore.roomCode);
	const logs = $derived([...(gameStore.gameState?.logs ?? [])].reverse().slice(0, 12));
	// Pop for EVERY player when the board sells out: derived from the
	// authoritative GAME_STATE broadcast, so all clients see it together.
	const allSold = $derived(
		!!gameStore.gameState &&
			gameStore.gameState.status === 'IN_GAME' &&
			Object.values(gameStore.gameState.tiles ?? {}).every((t) =>
				t.type === 'PROPERTY' || t.type === 'UTILITY' || t.type === 'RAILROAD'
					? !!t.ownerId
					: true
			)
	);
	$effect(() => {
		const room = gameStore.gameState?.roomId ?? null;
		if (!room) return;
		if (soldOutSeenFor !== room) {
			soldOutSeenFor = null;
			showSoldOut = false;
		}
		if (allSold && soldOutSeenFor !== room) {
			showSoldOut = true;
		}
		if (!allSold) {
			showSoldOut = false;
		}
	});
	function dismissSoldOut() {
		showSoldOut = false;
		soldOutSeenFor = gameStore.gameState?.roomId ?? soldOutSeenFor;
	}
	// Header title overrides mirror the board center: a jailed turn player
	// shows bright-red "JAIL!!!" until the turn passes; a freshly drawn card
	// shows the deck name, green for rewards and red for payments/punishments.
	const headerTurnPlayer = $derived(
		gameStore.gameState?.status === 'IN_GAME'
			? gameStore.gameState.players.find(
					(p) => p.id === gameStore.gameState?.currentTurnPlayerId
				)
			: undefined
	);
	const headerJailed = $derived(!!headerTurnPlayer?.inJail);
	const headerCard = $derived(
		!headerJailed &&
		gameStore.gameState?.status === 'IN_GAME' &&
		gameStore.gameState.lastCard
			? gameStore.gameState.lastCard
			: undefined
	);
	const headerTitle = $derived(
		headerJailed
			? 'JAIL!!!'
			: headerCard
				? headerCard.deck === 'CHANCE'
					? 'ভাগ্য পরীক্ষা'
					: 'সুযোগ গ্রহণ'
				: 'ধনী হওয়ার মজার খেলা'
	);
	const headerTitleClass = $derived(
		headerJailed || headerCard?.tone === 'bad'
			? 'text-red-600'
			: headerCard?.tone === 'good'
				? 'text-emerald-600'
				: 'text-emerald-950'
	);
</script>

<!-- Flat off-white backdrop -->
<div class="pointer-events-none fixed inset-0 -z-10 bg-[#f7f4ec]"></div>

<main class="min-h-screen p-4 text-slate-800">
	{#if !inGame}
		<div class="py-10">
			<Lobby />
		</div>
	{:else}
		<header class="mx-auto mb-4 flex max-w-6xl flex-wrap items-center justify-between gap-3">
			<div>
				<h1 class="text-2xl font-bold sm:text-3xl {headerTitleClass}">{headerTitle}</h1>
				<p class="mt-0.5 text-xs text-emerald-800/70">
					{gameStore.currentPlayer?.name
						? `${gameStore.currentPlayer.name} এর চাল চলছে…`
						: 'মহাজনি বাজারে স্বাগতম'}
				</p>
			</div>
			<div class="flex items-center gap-2">
				<button
					class="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:bg-slate-100 active:scale-95"
					onclick={toggleMute}
					title={soundMuted ? 'সাউন্ড চালু করুন' : 'সাউন্ড বন্ধ করুন'}
				>
					{soundMuted ? '🔇 নীরব' : '🔊 সাউন্ড'}
				</button>
				{#if gameStore.roomCode}
					<button
						class="rounded-xl border border-amber-600/30 bg-amber-100 px-3 py-1.5 font-mono text-lg tracking-widest text-amber-900 transition hover:bg-amber-200 active:scale-95"
						onclick={copyRoomCode}
						title="কপি করুন"
					>
						{gameStore.roomCode} ⧉
					</button>
				{/if}
				<span
					class="flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600"
				>
					<span
						class="inline-block h-2 w-2 rounded-full {gameStore.connection === 'open'
							? 'anim-glow-drift bg-emerald-500'
							: 'bg-red-500'}"
					></span>
					{gameStore.connection === 'open' ? 'সংযুক্ত' : 'বিচ্ছিন্ন'}
				</span>
			</div>
			{#if gameStore.connection !== 'open' && gameStore.gameState}
				<div
					class="flex w-full flex-wrap items-center justify-center gap-2 rounded-xl border border-amber-600/30 bg-amber-100 px-3 py-2 text-center text-xs text-amber-900"
				>
					<span>
						পুনরায় সংযোগ হচ্ছে… আপনার টাকা, জমি ও চাল সংরক্ষিত আছে।
						{#if getReconnectAttempts() > 0}
							(চেষ্টা {getReconnectAttempts()})
						{/if}
					</span>
					<button
						class="rounded-lg bg-amber-400 px-2.5 py-1 font-bold text-amber-950 transition hover:bg-amber-300 active:scale-95"
						onclick={() => retryNow()}
					>
						এখনই আবার চেষ্টা করুন
					</button>
				</div>
			{/if}
		</header>

		<div class="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[1fr_330px]">
			<div class="order-1">
				<div
					class="rounded-3xl border-2 border-emerald-700/25 bg-white p-1.5 shadow-[0_0_40px_-12px_rgba(4,120,87,0.35)]"
				>
					<div class="overflow-hidden rounded-2xl">
						<ClickSpark sparkColor="#d97706" sparkCount={8} sparkRadius={28} duration={500}>
							<BoardCanvas onselect={(id) => (selectedTile = id)} />
						</ClickSpark>
					</div>
				</div>
			</div>
			<div class="order-2 flex flex-col gap-4 lg:col-start-2 lg:row-span-2">
				<section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
					<ActionPanel onselecttile={(id) => (selectedTile = id)} />
				</section>
				<section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
					<PlayerList onselect={(id) => (selectedPlayer = id)} />
				</section>
				<CardDecks />
			</div>
			{#if gameStore.gameState}
				<div class="order-3 lg:col-start-1">
					<section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
						<h2 class="mb-2 text-sm font-semibold tracking-wide text-emerald-800">
							✨ খেলার লগ
						</h2>
						<ul class="max-h-36 space-y-1.5 overflow-y-auto text-sm">
							{#each logs as log, i (i + ':' + log)}
								<li
									class="{i === 0
										? 'anim-log-in rounded-lg border border-emerald-600/20 bg-emerald-50 px-2.5 py-1 text-emerald-900'
										: 'px-2.5 py-0.5 text-slate-500'}"
								>
									{log}
								</li>
							{/each}
						</ul>
					</section>
				</div>
			{/if}
		</div>
		<footer class="mx-auto mt-4 max-w-6xl pb-6 text-center">
			<button
				class="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-500 transition hover:border-slate-400 hover:text-slate-700"
				onclick={handleLeave}
				title="ঘর ছেড়ে লবিতে ফিরুন (আবার যোগ দিতে একই নাম ও রুম কোড লাগবে)"
			>
				ঘর ছেড়ে যান
			</button>
		</footer>
	{/if}

	<PropertyModal tileId={selectedTile} onclose={() => (selectedTile = null)} />
	<PlayerModal playerId={selectedPlayer} onclose={() => (selectedPlayer = null)} />
	<SoldOutModal open={showSoldOut} onclose={dismissSoldOut} />
</main>
