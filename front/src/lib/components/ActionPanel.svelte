<script lang="ts">
	import { gameStore } from '$lib/stores/gameStore.svelte';
	import { send } from '$lib/utils/polling';
	import { diceFace } from '$lib/utils/dice';
	import ClickSpark from '$lib/components/svelte-bits/ClickSpark.svelte';
	import UnsoldModal from '$lib/components/UnsoldModal.svelte';
	import RoomSettings from '$lib/components/RoomSettings.svelte';

	let { onselecttile }: { onselecttile?: (id: number) => void } = $props();

	let buildTileId = $state<number | null>(null);
	let buildCount = $state(1);
	let building = $state(false);
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
	// Group this build belongs to: bulk builds spread evenly across the
	// player's owned tiles here (server distributes lowest-first).
	const buildGroup = $derived(
		!buildTile
			? []
			: tilesList.filter(
					(t) =>
						t.type === 'PROPERTY' &&
						t.group === buildTile.group &&
						t.ownerId === gameStore.playerId
				)
	);
	const groupHeadroom = $derived(buildGroup.reduce((a, t) => a + Math.max(0, 5 - t.houses), 0));
	// Client-side preview of an even bulk build: mirror the server's
	// lowest-first distribution to show real cost & per-tile result.
	const buildPreview = $derived.by(() => {
		if (!buildTile || buildGroup.length === 0) return { levels: 0, cost: 0, per: [] as { id: number; name: string; add: number; to: number }[] };
		const levels = buildGroup.map((t) => ({ id: t.id, name: t.nameBn, houses: t.houses, cost: t.houseCost ?? 0 }));
		let cash = gameStore.me?.cash ?? 0;
		let cost = 0;
		let n = 0;
		const want = Math.max(1, Math.min(25, Math.floor(buildCount) || 1));
		for (let i = 0; i < want; i++) {
			const open = levels.filter((l) => l.houses < 5);
			if (open.length === 0) break;
			open.sort((a, b) => a.houses - b.houses || (a.id === buildTile.id ? -1 : b.id === buildTile.id ? 1 : a.id - b.id));
			const target = open[0];
			if (cash < target.cost) break;
			cash -= target.cost;
			cost += target.cost;
			target.houses++;
			n++;
		}
		const per = levels
			.filter((l) => {
				const before = buildGroup.find((t) => t.id === l.id)?.houses ?? 0;
				return l.houses > before;
			})
			.map((l) => {
				const before = buildGroup.find((t) => t.id === l.id)?.houses ?? 0;
				return { id: l.id, name: l.name, add: l.houses - before, to: l.houses };
			});
		return { levels: n, cost, per };
	});
	const buildCapped = $derived(Math.min(Math.max(1, Math.floor(buildCount) || 1), Math.max(1, groupHeadroom)));
	const previewShort = $derived(
		buildGroup.length <= 1 || buildPreview.levels <= 1
			? ''
			: ` → ${buildPreview.per.map((p) => `${p.name} +${p.add}`).join(', ')}`
	);
	// Older servers omit lapsCompleted — only an explicit 0 locks buying.
	const buyLocked = $derived((gameStore.me?.lapsCompleted ?? 1) < 1);

	// Lobby rules (host-editable). Local mirrors let the host tweak without
	// fighting the 4s lobby poll; server remains authoritative.
	let lobbyStartCash = $state(1500);
	let lobbyGoSalary = $state(200);
	let lobbyExtreme = $state(false);

	const serverSettings = $derived(gameStore.gameState?.settings);

	$effect(() => {
		// Adopt server truth whenever we're not the host editing.
		if (!gameStore.isHost || gameStore.gameState?.status !== 'LOBBY') {
			if (serverSettings) {
				lobbyStartCash = serverSettings.startCash;
				lobbyGoSalary = serverSettings.goSalary;
				lobbyExtreme = serverSettings.extremeMode;
			}
		}
	});

	function pushSettings(settings: { startCash: number; goSalary: number; extremeMode: boolean }) {
		lobbyStartCash = settings.startCash;
		lobbyGoSalary = settings.goSalary;
		lobbyExtreme = settings.extremeMode;
		send('UPDATE_SETTINGS', { settings });
	}

	// In-game rules badge: effective GO payout + extreme flag.
	const effectiveGo = $derived(
		gameStore.gameState?.settings?.extremeMode
			? 500
			: (gameStore.gameState?.settings?.goSalary ?? 200)
	);
	const isExtreme = $derived(gameStore.gameState?.settings?.extremeMode === true);

	$effect(() => {
		// Default the dropdown to the first buildable tile.
		if (buildTileId == null && myBuildable.length > 0) {
			buildTileId = myBuildable[0].id;
		}
		if (buildTileId != null && !myBuildable.some((t) => t.id === buildTileId)) {
			buildTileId = myBuildable.length > 0 ? myBuildable[0].id : null;
		}
		// Keep the bulk quantity within the group's remaining headroom.
		if (groupHeadroom > 0 && buildCount > groupHeadroom) buildCount = groupHeadroom;
		if (buildCount < 1) buildCount = 1;
	});

	async function buildMany() {
		if (buildTileId == null || building) return;
		const n = Math.min(Math.max(1, Math.floor(buildCount) || 1), 25);
		building = true;
		try {
			await send('BUILD_HOUSE', { tileId: buildTileId, count: n });
		} finally {
			building = false;
		}
	}

	function levelLabel(houses: number): string {
		if (houses >= 5) return 'হোটেল';
		if (houses > 0) return `বাড়ি ×${houses}`;
		return 'খালি জমি';
	}

	function rollDice() {
		send('ROLL_DICE');
	}

	const shownDice = $derived(gameStore.gameState?.dice ?? [1, 1]);
</script>

<div>
	<h2 class="mb-2 text-sm font-semibold tracking-wide text-amber-700">🎯 চাল</h2>
	{#if gameStore.gameState?.status === 'IN_GAME'}
		<p class="mb-1 text-center text-[11px] font-medium text-slate-500">
			💰 শুরু ৳{gameStore.gameState.settings?.startCash ?? 1500} · GO ৳{effectiveGo}{#if isExtreme}
				<span class="font-bold text-red-600"> · 🔥 এক্সট্রিম</span>
			{/if}
		</p>
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
			<RoomSettings
				startCash={lobbyStartCash}
				goSalary={lobbyGoSalary}
				extremeMode={lobbyExtreme}
				editable={true}
				onchange={pushSettings}
			/>
			<div class="mt-2">
			<ClickSpark sparkColor="#d97706" sparkCount={10} sparkRadius={24}>
				<button
					class="w-full rounded-xl bg-amber-500 px-4 py-2.5 font-bold text-white transition hover:bg-amber-400 active:scale-95"
					onclick={() => send('START_GAME')}
				>
					🚀 খেলা শুরু করুন
				</button>
			</ClickSpark>
			</div>
			<p class="mt-2 text-center text-xs text-slate-500">
				সবাই তৈরি? বাজি ধরার সময় এসেছে!
			</p>
		{:else}
			<RoomSettings
				startCash={serverSettings?.startCash ?? 1500}
				goSalary={serverSettings?.goSalary ?? 200}
				extremeMode={serverSettings?.extremeMode ?? false}
				editable={false}
			/>
			<p class="anim-glow-drift mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-sm text-slate-600">
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
		{:else}
			<p class="anim-glow-drift rounded-xl border border-emerald-600/20 bg-emerald-50 px-3 py-2.5 text-center text-sm font-medium text-emerald-900">
				বোর্ডের মাঝখানে 🎲 চাপুন!
			</p>
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
					নিজের কোনো জমিতে জায়গা খালি নেই — সবগুলোতে হোটেল হয়ে গেছে!
				</p>
			{:else}
				<div class="rounded-xl border border-purple-300 bg-purple-50 p-2">
					<p class="mb-1 text-xs font-medium text-purple-800">
						🏠 বাড়ি → হোটেল (গ্রুপে সমানভাবে বণ্টন হয়)
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
					{#if buildGroup.length > 1}
						<p class="mb-2 text-[11px] leading-relaxed text-purple-900/80">
							{buildTile?.group} গ্রুপ: {buildGroup
								.map((t) => `${t.nameBn} ${levelLabel(t.houses)}`)
								.join(' · ')}
						</p>
					{/if}
					<div class="mb-2 flex items-center gap-2">
						<span class="text-xs font-medium text-purple-800">পরিমাণ:</span>
						<div class="flex items-center rounded-lg border border-purple-300 bg-white">
							<button
								class="px-2.5 py-1 text-base font-bold text-purple-700 transition hover:bg-purple-100 active:scale-95 disabled:opacity-40"
								disabled={building || buildCapped <= 1}
								onclick={() => (buildCount = Math.max(1, buildCapped - 1))}
								aria-label="কমান"
							>
								−
							</button>
							<span class="min-w-8 text-center text-sm font-bold text-slate-900">{buildCapped}</span>
							<button
								class="px-2.5 py-1 text-base font-bold text-purple-700 transition hover:bg-purple-100 active:scale-95 disabled:opacity-40"
								disabled={building || buildCapped >= Math.max(1, groupHeadroom)}
								onclick={() => (buildCount = Math.min(Math.max(1, groupHeadroom), buildCapped + 1))}
								aria-label="বাড়ান"
							>
								+
							</button>
						</div>
						<div class="flex gap-1">
							{#each [1, 3, 5] as q}
								<button
									class="rounded-lg border px-2 py-1 text-xs font-bold transition active:scale-95 disabled:opacity-40 {buildCapped === Math.min(q, Math.max(1, groupHeadroom)) ? 'border-purple-600 bg-purple-600 text-white' : 'border-purple-300 bg-white text-purple-700 hover:bg-purple-100'}"
									disabled={building || q > Math.max(1, groupHeadroom)}
									onclick={() => (buildCount = Math.min(q, Math.max(1, groupHeadroom)))}
								>
									×{q}
								</button>
							{/each}
							<button
								class="rounded-lg border px-2 py-1 text-xs font-bold transition active:scale-95 disabled:opacity-40 {buildCapped === Math.max(1, groupHeadroom) ? 'border-purple-600 bg-purple-600 text-white' : 'border-purple-300 bg-white text-purple-700 hover:bg-purple-100'}"
								disabled={building || groupHeadroom < 1}
								onclick={() => (buildCount = Math.max(1, groupHeadroom))}
								title="গ্রুপের সব খালি ধাপ একবারে"
							>
								MAX
							</button>
						</div>
					</div>
					<button
						class="w-full rounded-xl bg-purple-600 px-4 py-2 font-bold text-white transition hover:bg-purple-500 active:scale-95 disabled:opacity-50"
						disabled={building || buildTileId == null || buildPreview.levels === 0}
						onclick={buildMany}
					>
						{#if building}
							<span class="inline-block animate-spin align-middle">⏳</span> তৈরি হচ্ছে…
						{:else if buildCapped > 1}
							{buildPreview.levels}টি ধাপ তৈরি করুন (৳{buildPreview.cost}){previewShort}
						{:else}
							{buildLabel || 'বাড়ি তৈরি করুন'} {buildTile ? `(৳${buildTile.houseCost})` : ''}
						{/if}
					</button>
					{#if gameStore.lastError}
						<p class="mt-1 text-center text-[11px] font-medium text-red-600">{gameStore.lastError}</p>
					{/if}
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
