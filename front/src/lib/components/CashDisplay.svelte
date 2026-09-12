<script lang="ts">
	import { untrack } from 'svelte';

	let { cash }: { cash: number } = $props();

	let prev = $state(cash);
	let delta: number | null = $state(null);
	let timer: ReturnType<typeof setTimeout> | undefined = undefined;

	$effect(() => {
		const current = cash;
		const old = untrack(() => prev);
		if (current === old) return;
		untrack(() => {
			prev = current;
		});
		delta = current - old;
		clearTimeout(timer);
		timer = setTimeout(() => {
			delta = null;
		}, 2400);
		return () => clearTimeout(timer);
	});

	const fmt = (n: number) => n.toLocaleString('en-US');
	const gain = $derived(delta !== null && delta > 0);
	const loss = $derived(delta !== null && delta < 0);
</script>

<span class="inline-flex items-center gap-1.5 font-mono">
	<span
		class="font-semibold transition-colors {gain
			? 'text-green-700'
			: loss
				? 'text-red-700'
				: 'text-slate-800'}"
	>
		৳{fmt(cash)}
	</span>
	{#if delta !== null && delta !== 0}
		<span
			class="anim-log-in rounded-full px-1.5 text-xs font-bold {gain
				? 'bg-green-100 text-green-800'
				: 'bg-red-100 text-red-800'}"
		>
			{gain ? `+${fmt(delta)}` : fmt(delta)}
		</span>
	{/if}
</span>
