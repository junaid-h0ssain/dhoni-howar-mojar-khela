<script lang="ts">
	import { gameStore } from '$lib/stores/gameStore.svelte';
	import { CHANCE_CARDS, CHEST_CARDS, cardTone, type Card } from '$lib/constants/cards';

	const gs = $derived(gameStore.gameState);
	const lastCard = $derived(
		gs?.status === 'IN_GAME' &&
		gs.lastCard &&
		gs.lastCard.turnPlayerId === gs.currentTurnPlayerId
			? gs.lastCard
			: undefined
	);
	const toneClass = $derived(
		lastCard?.tone === 'good'
			? 'border-emerald-600/30 bg-emerald-50 text-emerald-900'
			: lastCard?.tone === 'bad'
				? 'border-red-600/30 bg-red-50 text-red-800'
				: 'border-slate-200 bg-slate-50 text-slate-700'
	);

	function dot(c: Card): string {
		const t = cardTone(c);
		return t === 'good' ? 'bg-emerald-500' : t === 'bad' ? 'bg-red-500' : 'bg-slate-400';
	}

	function isLastDrawn(deck: 'CHANCE' | 'CHEST', text: string): boolean {
		return !!lastCard && lastCard.deck === deck && lastCard.text === text;
	}
</script>

{#if gs && (gs.status === 'IN_GAME' || gs.status === 'LOBBY')}
	<section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
		<h2 class="mb-2 text-sm font-semibold tracking-wide text-slate-600">🎴 ভাগ্য ও সুযোগ</h2>
		{#if lastCard}
			<div class="mb-2 rounded-xl border px-3 py-2 text-center text-sm font-medium {toneClass}">
				{lastCard.deck === 'CHANCE' ? '🎲' : '🎁'}
				{lastCard.text}
			</div>
		{/if}
		<div class="flex flex-col gap-2">
			<details class="rounded-xl border border-slate-200 bg-slate-50" open>
				<summary class="cursor-pointer px-3 py-2 text-sm font-bold text-slate-800">
					🎲 ভাগ্য পরীক্ষা <span class="font-normal text-slate-500">({CHANCE_CARDS.length}টি কার্ড)</span>
				</summary>
				<ul class="max-h-56 space-y-1 overflow-y-auto px-3 pb-3 text-sm">
					{#each CHANCE_CARDS as c, i (i)}
						<li
							class="flex items-start gap-2 rounded-lg px-2 py-1 {isLastDrawn('CHANCE', c.text)
								? 'bg-amber-100 font-semibold text-amber-950'
								: 'text-slate-700'}"
						>
							<span class="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full {dot(c)}"></span>
							<span>{c.text}</span>
						</li>
					{/each}
				</ul>
			</details>
			<details class="rounded-xl border border-slate-200 bg-slate-50">
				<summary class="cursor-pointer px-3 py-2 text-sm font-bold text-slate-800">
					🎁 সুযোগ গ্রহণ <span class="font-normal text-slate-500">({CHEST_CARDS.length}টি কার্ড)</span>
				</summary>
				<ul class="max-h-56 space-y-1 overflow-y-auto px-3 pb-3 text-sm">
					{#each CHEST_CARDS as c, i (i)}
						<li
							class="flex items-start gap-2 rounded-lg px-2 py-1 {isLastDrawn('CHEST', c.text)
								? 'bg-amber-100 font-semibold text-amber-950'
								: 'text-slate-700'}"
						>
							<span class="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full {dot(c)}"></span>
							<span>{c.text}</span>
						</li>
					{/each}
				</ul>
			</details>
		</div>
		<p class="mt-2 text-center text-[11px] text-slate-400">
			🟢 সবুজ = লাভ &nbsp;•&nbsp; 🔴 লাল = জরিমানা/শাস্তি
		</p>
	</section>
{/if}
