<script lang="ts">
	import type { FeedItem } from '$lib/constants/boardData';
	import { FLOAT_MS, FLOAT_MAX } from '$lib/utils/social';

	let { feed }: { feed: FeedItem[] } = $props();

	interface Float {
		id: string;
		emoji: string;
		name: string;
		left: number;
	}

	let shown = $state<Float[]>([]);
	let knownIds = new Set<string>();

	// Spread floats horizontally so simultaneous reactions don't stack.
	function jitter(id: string): number {
		let h = 0;
		for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 1000;
		return 12 + (h % 76);
	}

	$effect(() => {
		const fresh = feed.filter((f) => f.kind === 'emoji' && !knownIds.has(f.id));
		if (fresh.length === 0) return;
		for (const f of fresh) {
			knownIds.add(f.id);
			const fl: Float = { id: f.id, emoji: f.body, name: f.playerName, left: jitter(f.id) };
			shown = [...shown.slice(-(FLOAT_MAX - 1)), fl];
			setTimeout(() => {
				shown = shown.filter((s) => s.id !== fl.id);
			}, FLOAT_MS);
		}
	});
</script>

<div class="pointer-events-none absolute inset-x-0 bottom-0 top-0 z-10 overflow-visible">
	{#each shown as fl (fl.id)}
		<div class="anim-react-float absolute bottom-16 text-center" style="left: {fl.left}%;">
			<div class="text-4xl drop-shadow-lg">{fl.emoji}</div>
			<div
				class="mx-auto mt-0.5 max-w-20 truncate rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white"
			>
				{fl.name}
			</div>
		</div>
	{/each}
</div>
