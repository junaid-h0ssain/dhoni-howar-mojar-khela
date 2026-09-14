<script lang="ts">
	import { gameStore } from '$lib/stores/gameStore.svelte';
	import { GROUP_COLORS } from '$lib/constants/boardData';
	import CashDisplay from '$lib/components/CashDisplay.svelte';
	import { tileIcon } from '$lib/utils/tileIcons';

	let { playerId, onclose }: { playerId: string | null; onclose: () => void } = $props();

	const player = $derived(
		playerId != null ? gameStore.gameState?.players.find((p) => p.id === playerId) : undefined
	);
	const isTurn = $derived(
		player != null && player.id === gameStore.gameState?.currentTurnPlayerId
	);
	const location = $derived.by(() => {
		if (!player) return '—';
		const t = gameStore.gameState?.tiles[player.position];
		if (!t) return `ঘর ${player.position}`;
		const icon = tileIcon(t);
		return icon ? `${icon} ${t.nameBn}` : t.nameBn;
	});
	const properties = $derived(
		player
			? Object.values(gameStore.gameState?.tiles ?? {})
					.filter((t) => t.ownerId === player.id)
					.sort((a, b) => a.id - b.id)
			: []
	);
	const cards = $derived(player?.jailCards ?? 0);

	function levelLabel(houses: number): string {
		if (houses >= 5) return 'হোটেল 🏨';
		if (houses > 0) return `বাড়ি ×${houses} 🏠`;
		return 'খালি জমি';
	}
</script>

{#if playerId != null && player}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
		onclick={onclose}
		role="presentation"
	>
		<div
			class="anim-modal-in w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 text-slate-800 shadow-xl"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => {
				if (e.key === 'Escape') onclose();
			}}
			role="dialog"
			aria-modal="true"
			tabindex="-1"
		>
			<h3 class="flex items-center gap-2 text-xl font-bold text-slate-900">
				<span
					class="inline-block h-4 w-4 rounded-full"
					style:background-color={player.tokenColor}
				></span>
				{player.name}
			</h3>
			<div class="mt-1.5 flex flex-wrap gap-1.5 text-xs">
				{#if isTurn}
					<span class="rounded-full bg-amber-500/20 px-2 py-0.5 font-bold text-amber-800">● চাল চলছে</span>
				{/if}
				{#if player.inJail}
					<span class="rounded-full bg-slate-700 px-2 py-0.5 text-white">
						🔒 জেলে ({player.jailTurns + 1}/3)
					</span>
				{/if}
				{#if !player.isConnected}
					<span class="rounded-full bg-slate-200 px-2 py-0.5 text-slate-500">অফলাইন</span>
				{/if}
				{#if player.isBankrupt}
					<span class="rounded-full bg-red-100 px-2 py-0.5 text-red-700">💸 দেউলিয়া</span>
				{/if}
			</div>
			<div class="mt-3 space-y-1 text-sm text-slate-600">
				<p class="flex items-center gap-2">
					<span>💰 নগদ:</span>
					<CashDisplay cash={player.cash} />
				</p>
				<p>📍 অবস্থান: <span class="font-medium text-slate-800">{location}</span></p>
				<p>
					🃏 মুক্তির কার্ড:
					<span class="font-medium text-slate-800">
						{cards > 0 ? `${cards}টি` : 'নেই'}
					</span>
				</p>
			</div>
			<div class="mt-3">
				<p class="text-sm font-medium text-slate-700">
					🏠 সম্পত্তি ({properties.length}টি):
				</p>
				{#if properties.length === 0}
					<p class="mt-1 text-sm text-slate-500">এখনও কোনো সম্পত্তি কেনেননি।</p>
				{:else}
					<ul class="mt-1.5 max-h-56 space-y-1.5 overflow-y-auto">
						{#each properties as t (t.id)}
							<li
								class="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm"
							>
								{#if t.group && GROUP_COLORS[t.group]}
									<span
										class="inline-block h-6 w-1.5 shrink-0 rounded-full"
										style:background-color={GROUP_COLORS[t.group]}
									></span>
								{/if}
								<span class="min-w-0 flex-1">
									<span class="block truncate font-medium text-slate-800">
										{#if tileIcon(t)}{tileIcon(t)} {/if}{t.nameBn}
									</span>
									<span class="block text-xs text-slate-500">
										{t.type === 'PROPERTY' ? `${levelLabel(t.houses)} · ` : ''}৳{t.price}
									</span>
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
			<button
				class="mt-4 w-full rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white transition hover:bg-slate-700 active:scale-95"
				onclick={onclose}
			>
				বন্ধ করুন
			</button>
		</div>
	</div>
{/if}
