<script lang="ts">
	import { gameStore } from '$lib/stores/gameStore.svelte';
	import { tileIcon } from '$lib/utils/tileIcons';
	import { GROUP_COLORS } from '$lib/constants/boardData';

	let {
		open,
		onclose,
		onselect
	}: {
		open: boolean;
		onclose: () => void;
		onselect?: (id: number) => void;
	} = $props();

	const unsold = $derived(
		Object.values(gameStore.gameState?.tiles ?? {})
			.filter(
				(t) =>
					(t.type === 'PROPERTY' || t.type === 'UTILITY' || t.type === 'RAILROAD') &&
					!t.ownerId
			)
			.sort((a, b) => a.id - b.id)
	);

	function typeLabel(type: string): string {
		if (type === 'UTILITY') return 'ইউটিলিটি';
		if (type === 'RAILROAD') return 'স্টেশন';
		return 'সম্পত্তি';
	}
</script>

{#if open}
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
			<h3 class="text-xl font-bold text-slate-900">🏘️ অবিক্রীত সম্পত্তি ({unsold.length}টি)</h3>
			<p class="mt-0.5 text-xs text-slate-500">কিনতে ঘরটিতে থামুন — বিস্তারিত দেখতে ট্যাপ করুন।</p>
			{#if unsold.length === 0}
				<p class="mt-2 text-sm text-slate-500">সব সম্পত্তি বিক্রি হয়ে গেছে! 🎉</p>
			{:else}
				<ul class="mt-2 max-h-72 space-y-1.5 overflow-y-auto">
					{#each unsold as t (t.id)}
						<li>
							<button
								class="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left text-sm transition hover:border-emerald-600/50 hover:bg-emerald-50/50 active:scale-[0.99]"
								onclick={() => {
									onselect?.(t.id);
									onclose();
								}}
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
									<span class="block text-xs text-slate-500">{typeLabel(t.type)}</span>
								</span>
								<span class="shrink-0 font-mono text-emerald-700">৳{t.price}</span>
							</button>
						</li>
					{/each}
				</ul>
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
