<script lang="ts">
	import { gameStore } from '$lib/stores/gameStore.svelte';
	import { tileIcon } from '$lib/utils/tileIcons';

	let { tileId, onclose }: { tileId: number | null; onclose: () => void } = $props();

	const tile = $derived(
		tileId != null ? gameStore.gameState?.tiles[tileId] : undefined
	);
	const owner = $derived(
		tile?.ownerId
			? gameStore.gameState?.players.find((p) => p.id === tile.ownerId)
			: undefined
	);
	const levelLabel = $derived(
		!tile ? '' : tile.houses >= 5 ? 'হোটেল 🏨' : tile.houses > 0 ? `বাড়ি ×${tile.houses} 🏠` : 'খালি জমি'
	);
	const currentRent = $derived(
		tile?.rentTiers
			? tile.rentTiers[Math.min(tile.houses, 5)]
			: undefined
	);
	// Railroad rent (server rule: 25/50/100/200 by count owned).
	const RAILROAD_RENTS = [25, 50, 100, 200];
	const ownerRailCount = $derived(
		tile?.type === 'RAILROAD' && tile.ownerId
			? Object.values(gameStore.gameState?.tiles ?? {}).filter(
					(t) => t.type === 'RAILROAD' && t.ownerId === tile.ownerId
				).length
			: 0
	);
	const currentRailRent = $derived(
		ownerRailCount > 0 ? RAILROAD_RENTS[Math.min(ownerRailCount, 4) - 1] : undefined
	);
	// Utility rent (server rule: dice total ×4 with one, ×10 with both).
	const ownerUtilCount = $derived(
		tile?.type === 'UTILITY' && tile.ownerId
			? Object.values(gameStore.gameState?.tiles ?? {}).filter(
					(t) => t.type === 'UTILITY' && t.ownerId === tile.ownerId
				).length
			: 0
	);
	const utilMult = $derived(ownerUtilCount >= 2 ? 10 : 4);
	const occupants = $derived(
		tileId != null
			? (gameStore.gameState?.players.filter((pl) => pl.position === tileId) ?? [])
			: []
	);
</script>

{#if tileId != null && tile}
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
			<h3 class="text-xl font-bold text-slate-900">
				{#if tileIcon(tile)}<span class="mr-1">{tileIcon(tile)}</span>{/if}{tile.nameBn}
			</h3>
			<p class="text-sm text-slate-500">{tile.nameEn}</p>
			{#if tile.price}
				<p class="mt-2 font-mono text-lg text-emerald-700">৳{tile.price}</p>
			{/if}
			<p class="mt-1 flex items-center gap-2 text-sm text-slate-600">
				<span>মালিক:</span>
				{#if owner}
					<span
						class="inline-block h-3 w-3 rounded-full"
						style:background-color={owner.tokenColor}
					></span>
					<span class="font-medium text-slate-900">{owner.name}</span>
				{:else}
					<span class="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
						✨ ব্যাংক (কেনা যায়)
					</span>
				{/if}
			</p>
			{#if tile.type === 'PROPERTY'}
				<p class="mt-1 text-sm text-slate-600">অবস্থা: {levelLabel}</p>
				<div class="mt-1.5 flex items-center gap-1.5">
					{#each [1, 2, 3, 4] as i}
						<span
							class="inline-block h-3 w-3 rounded-full border {tile.houses >= 5
								? 'border-slate-200 bg-slate-100'
								: i <= tile.houses
									? 'border-green-700 bg-green-600'
									: 'border-slate-300 bg-slate-100'}"
							title={i <= tile.houses ? `বাড়ি ${i}` : `খালি স্লট ${i}`}
						></span>
					{/each}
					<span class="text-xs text-slate-400">→</span>
					<span
						class="inline-block h-3.5 w-3.5 rounded-full border {tile.houses >= 5
							? 'border-red-700 bg-red-600'
							: 'border-slate-300 bg-slate-100'}"
						title="হোটেল (৪ বাড়ির পর)"
					></span>
					<span class="text-xs text-slate-500">
						{tile.houses >= 5 ? 'হোটেল হয়ে গেছে' : tile.houses === 4 ? 'পরের ধাপ: হোটেল' : `${tile.houses}/৪ বাড়ি`}
					</span>
				</div>
			{/if}
			{#if occupants.length > 0}
				<div class="mt-2 text-sm">
					<p class="font-medium text-slate-700">📍 এখানে আছে:</p>
					<ul class="mt-1 flex flex-wrap gap-1.5">
						{#each occupants as pl (pl.id)}
							<li
								class="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs"
							>
								<span
									class="inline-block h-2.5 w-2.5 rounded-full"
									style:background-color={pl.tokenColor}
								></span>
								<span class="font-medium text-slate-700">{pl.name}</span>
								{#if pl.isBankrupt}
									<span class="text-red-600">(দেউলিয়া)</span>
								{/if}
							</li>
						{/each}
					</ul>
				</div>
			{/if}
			{#if tile.rentTiers}
				<div class="mt-2 text-sm">
					<p class="font-medium text-slate-700">ভাড়া তালিকা:</p>
					<ul class="mt-1 grid grid-cols-3 gap-1 text-center">
						{#each tile.rentTiers as rent, i}
							<li
								class="rounded-lg border px-1 py-0.5 {i === Math.min(tile.houses, 5)
									? 'border-emerald-600/50 bg-emerald-100 font-bold text-emerald-900'
									: 'border-slate-200 bg-slate-50 text-slate-500'}"
							>
								{i === 5 ? 'হোটেল' : i === 0 ? 'খালি' : i + '🏠'}: ৳{rent}
							</li>
						{/each}
					</ul>
					{#if currentRent !== undefined && owner}
						<p class="mt-1 text-slate-600">বর্তমান ভাড়া: <b class="text-amber-700">৳{currentRent}</b></p>
					{/if}
				</div>
			{/if}
			{#if tile.type === 'RAILROAD'}
				<div class="mt-2 text-sm">
					<p class="font-medium text-slate-700">🚂 ভাড়া তালিকা (মালিকের স্টেশন সংখ্যা অনুযায়ী):</p>
					<ul class="mt-1 grid grid-cols-2 gap-1 text-center">
						{#each RAILROAD_RENTS as rent, i}
							<li
								class="rounded-lg border px-1 py-0.5 {ownerRailCount === i + 1
									? 'border-emerald-600/50 bg-emerald-100 font-bold text-emerald-900'
									: 'border-slate-200 bg-slate-50 text-slate-500'}"
							>
								{i + 1}টি স্টেশন: ৳{rent}
							</li>
						{/each}
					</ul>
					{#if owner && currentRailRent !== undefined}
						<p class="mt-1 text-slate-600">
							{owner.name}-এর {ownerRailCount}টি স্টেশন — বর্তমান ভাড়া:
							<b class="text-amber-700">৳{currentRailRent}</b>
						</p>
					{:else}
						<p class="mt-1 text-slate-500">যত বেশি স্টেশন একজনের হাতে, ভাড়া তত বেশি।</p>
					{/if}
				</div>
			{/if}
			{#if tile.type === 'UTILITY'}
				<div class="mt-2 text-sm">
					<p class="font-medium text-slate-700">💡 ভাড়া (পাশার যোগফল × গুণক):</p>
					<ul class="mt-1 grid grid-cols-2 gap-1 text-center">
						<li class="rounded-lg border px-1 py-0.5 {ownerUtilCount === 1 ? 'border-emerald-600/50 bg-emerald-100 font-bold text-emerald-900' : 'border-slate-200 bg-slate-50 text-slate-500'}">
							১টি থাকলে: পাশা × ৪
						</li>
						<li class="rounded-lg border px-1 py-0.5 {ownerUtilCount >= 2 ? 'border-emerald-600/50 bg-emerald-100 font-bold text-emerald-900' : 'border-slate-200 bg-slate-50 text-slate-500'}">
							২টি থাকলে: পাশা × ১০
						</li>
					</ul>
					{#if owner}
						<p class="mt-1 text-slate-600">
							{owner.name}-এর {ownerUtilCount}টি — বর্তমান গুণক: <b class="text-amber-700">× {utilMult}</b>
							(যেমন পাশায় ৭ উঠলে ভাড়া ৳{7 * utilMult})
						</p>
					{:else}
						<p class="mt-1 text-slate-500">
							যে পাশা ফেলে এখানে থামবে তার যোগফলের সাথে গুণ হবে — দুটোই একজনের হাতে থাকলে ভাড়া বেশি।
						</p>
					{/if}
				</div>
			{/if}
			<button
				class="mt-4 w-full rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white transition hover:bg-slate-700 active:scale-95"
				onclick={onclose}
			>
				বন্ধ করুন
			</button>
		</div>
	</div>
{/if}
