<script lang="ts">
	import { gameStore } from '$lib/stores/gameStore.svelte';
	import { send } from '$lib/utils/websocket';
	import { diceFace } from '$lib/utils/dice';
	import ClickSpark from '$lib/components/svelte-bits/ClickSpark.svelte';
	import UnsoldModal from '$lib/components/UnsoldModal.svelte';

	let { onselecttile }: { onselecttile?: (id: number) => void } = $props();

	let buildTileId = $state<number | null>(null);
	let adminD1 = $state(6);
	let adminD2 = $state(6);
	let showUnsold = $state(false);

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
	// Older servers omit lapsCompleted — only an explicit 0 locks buying.
	const buyLocked = $derived((gameStore.me?.lapsCompleted ?? 1) < 1);

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

	function rollDice(payload?: Record<string, unknown>) {
		send('ROLL_DICE', payload ?? {});
	}

	const shownDice = $derived(gameStore.gameState?.dice ?? [1, 1]);
</script>

<div>
	<h2 class="mb-2 text-sm font-semibold tracking-wide text-amber-700">🎯 চাল</h2>
	{#if gameStore.gameState?.status === 'IN_GAME'}
		<p class="mb-2 text-center text-3xl tracking-widest" title="সর্বশেষ দান">
			{diceFace(shownDice[0])}{diceFace(shownDice[1])}
			<span class="ml-1 align-middle text-sm text-slate-500">= {shownDice[0] + shownDice[1]}</span>
		</p>
		{#if allSold}
			<p class="mb-2 rounded-xl border border-emerald-600/20 bg-emerald-50 px-3 py-1.5 text-center text-xs font-medium text-emerald-900">
				✅ সব সম্পত্তি বিক্রি — বাড়ি তৈরি করা যাবে!
			</p>
		{:else}
			<button
				class="mb-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-center text-xs text-slate-600 transition hover:border-emerald-600/50 hover:bg-emerald-50/50 active:scale-[0.99]"
				title="কোন সম্পত্তিগুলো এখনও অবিক্রীত — দেখতে ট্যাপ করুন"
				onclick={() => (showUnsold = true)}
			>
				🏘️ অবিক্রীত <b class="text-slate-900">{unsoldCount}টি</b> — তালিকা দেখুন
			</button>
		{/if}
		<UnsoldModal
			open={showUnsold}
			onclose={() => (showUnsold = false)}
			onselect={(id) => onselecttile?.(id)}
		/>
	{/if}
	{#if !gameStore.gameState}
		<p class="text-sm text-slate-500">ঘরে যোগ দিন।</p>
	{:else if gameStore.gameState.status === 'LOBBY'}
		{#if gameStore.isHost}
			<ClickSpark sparkColor="#d97706" sparkCount={10} sparkRadius={24}>
				<button
					class="w-full rounded-xl bg-amber-500 px-4 py-2.5 font-bold text-white transition hover:bg-amber-400 active:scale-95"
					onclick={() => send('START_GAME')}
				>
					🚀 খেলা শুরু করুন
				</button>
			</ClickSpark>
			<p class="mt-2 text-center text-xs text-slate-500">
				সবাই তৈরি? বাজি ধরার সময় এসেছে!
			</p>
		{:else}
			<p class="anim-glow-drift rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-sm text-slate-600">
				হোস্ট খেলা শুরু করার অপেক্ষায়… ☕
			</p>
		{/if}
	{:else if gameStore.gameState.status === 'FINISHED'}
		{@const winner = gameStore.gameState.players.find((p) => p.id === gameStore.gameState?.winnerId)}
		<div class="text-center">
			<p class="anim-trophy text-5xl">🏆</p>
			<p class="mt-1 text-2xl font-bold text-amber-600">{winner?.name ?? '—'}</p>
			<p class="text-sm text-slate-600">মহাজনি চ্যাম্পিয়ন! 🎉</p>
		</div>
	{:else if gameStore.canRoll}
		{#if gameStore.me?.inJail}
			{@const cards = gameStore.me?.jailCards ?? 0}
			<div class="rounded-xl border border-slate-300 bg-slate-50 p-2">
				<p class="mb-2 text-center text-sm font-semibold text-slate-700">
					🔒 জেলে আছেন ({(gameStore.me?.jailTurns ?? 0) + 1}/3) — জোড়া ফেলুন, জরিমানা
					দিন, বা কার্ড ব্যবহার করুন।
				</p>
				<div class="flex flex-col gap-2">
					<button
						class="w-full rounded-xl bg-amber-600 px-4 py-2.5 font-bold text-white transition hover:bg-amber-500 active:scale-95"
						onclick={() => send('PAY_JAIL_FINE', {})}
					>
						🔓 ৳100 জরিমানা দিয়ে বের হোন
					</button>
					<button
						class="w-full rounded-xl bg-purple-600 px-4 py-2.5 font-bold text-white transition hover:bg-purple-500 active:scale-95 disabled:opacity-50"
						disabled={cards <= 0}
						onclick={() => send('USE_JAIL_CARD', {})}
					>
						🃏 মুক্তির কার্ড ব্যবহার করুন ({cards}টি)
					</button>
				</div>
				<p class="mt-2 text-center text-xs text-slate-500">
					অথবা বোর্ডের মাঝখানে 🎲 চাপুন — জোড়া পড়লে ফ্রি মুক্তি!
				</p>
			</div>
		{:else if !gameStore.isAdmin}
			<p class="anim-glow-drift rounded-xl border border-emerald-600/20 bg-emerald-50 px-3 py-2.5 text-center text-sm font-medium text-emerald-900">
				বোর্ডের মাঝখানে 🎲 চাপুন!
			</p>
		{/if}
		{#if gameStore.isAdmin}
			<div class="mt-2 rounded-xl border border-red-300 bg-red-50 p-2">
				<p class="mb-1 text-xs font-semibold text-red-700">🔧 Admin: পাশা নিয়ন্ত্রণ</p>
				<div class="mb-2 flex gap-2">
					<label class="flex-1 text-xs text-slate-600">
						পাশা ১
						<select class="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900" bind:value={adminD1}>
							{#each [1, 2, 3, 4, 5, 6] as n}
								<option value={n}>{n}</option>
							{/each}
						</select>
					</label>
					<label class="flex-1 text-xs text-slate-600">
						পাশা ২
						<select class="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900" bind:value={adminD2}>
							{#each [1, 2, 3, 4, 5, 6] as n}
								<option value={n}>{n}</option>
							{/each}
						</select>
					</label>
				</div>
				<button
					class="w-full rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 active:scale-95 disabled:opacity-50"
					onclick={() => rollDice({ d1: adminD1, d2: adminD2 })}
				>
					নির্দিষ্ট দান ({adminD1} + {adminD2})
				</button>
			</div>
		{/if}
	{:else if gameStore.canAct}
		{#if gameStore.me?.inJail}
			<p class="mb-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
				🔒 জেলে আছেন — জোড়া ফেলে মুক্ত হোন অথবা দান শেষ করুন।
			</p>
		{/if}
		<div class="flex flex-col gap-2">
			{#if buyLocked}
				<p class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs text-slate-500">
					🔒 বোর্ডের প্রথম রাউন্ড শেষ করুন (GO পার হোন) — তারপর সম্পত্তি কেনা যাবে।
				</p>
			{:else}
				<button
					class="rounded-xl bg-emerald-600 px-4 py-2.5 font-bold text-white transition hover:bg-emerald-500 active:scale-95"
					onclick={() => send('BUY_PROPERTY', { tileId: gameStore.me?.position ?? 0 })}
				>
					💰 সম্পত্তি কিনুন
				</button>
			{/if}
			{#if !allSold}
				<p class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs text-slate-500">
					সব সম্পত্তি বিক্রি হলে বাড়ি/হোটেল তৈরি করা যাবে ({unsoldCount}টি বাকি)।
				</p>
			{:else if myBuildable.length === 0}
				<p class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs text-slate-500">
					তৈরি করার মতো সম্পত্তি নেই (পুরো গ্রুপ + খালি জায়গা থাকতে হবে)।
				</p>
			{:else}
				<div class="rounded-xl border border-purple-300 bg-purple-50 p-2">
					<p class="mb-1 text-xs font-medium text-purple-800">
						🏠 বাড়ি → হোটেল (সর্বোচ্চ: ৪ বাড়ি, তারপর হোটেল)
					</p>
					<select
						class="mb-2 w-full rounded-lg border border-purple-300 bg-white px-2 py-1.5 text-sm text-slate-900"
						bind:value={buildTileId}
					>
						{#each myBuildable as t (t.id)}
							<option value={t.id}>
								{t.nameBn} · {levelLabel(t.houses)} · ৳{t.houseCost}
							</option>
						{/each}
					</select>
					<button
						class="w-full rounded-xl bg-purple-600 px-4 py-2 font-bold text-white transition hover:bg-purple-500 active:scale-95 disabled:opacity-50"
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
				class="rounded-xl bg-amber-600 px-4 py-2.5 font-bold text-white transition hover:bg-amber-500 active:scale-95"
				onclick={() => send('END_TURN')}
			>
				দান শেষ করুন ⏭️
			</button>
		</div>
	{:else if gameStore.canEndTurn}
		{#if gameStore.me?.inJail}
			<p class="mb-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
				🔒 জেলে আছেন ({gameStore.me.jailTurns + 1}/3) — পরের চালে জোড়া ফেলার চেষ্টা করুন।
			</p>
		{/if}
		<button
			class="w-full rounded-xl bg-amber-600 px-4 py-2.5 font-bold text-white transition hover:bg-amber-500 active:scale-95"
			onclick={() => send('END_TURN')}
		>
			দান শেষ করুন ⏭️
		</button>
	{:else}
		<p class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-sm text-slate-600">
			<span class="font-semibold text-amber-700">{gameStore.currentPlayer?.name ?? '—'}</span>
			এর চাল চলছে… 👀
		</p>
	{/if}
</div>
