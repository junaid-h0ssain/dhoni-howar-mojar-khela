<script lang="ts">
	import type { ActionGif } from '$lib/utils/actionGif';

	let {
		gif,
		onclose
	}: {
		gif: ActionGif | null;
		onclose: () => void;
	} = $props();

	// Auto-dismiss the overlay; cleanup on unmount or gif change.
	$effect(() => {
		if (!gif) return;
		const t = setTimeout(onclose, 2500);
		return () => clearTimeout(t);
	});
</script>

{#if gif}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
		onclick={onclose}
		role="presentation"
	>
		<div
			class="anim-modal-in w-full max-w-xs rounded-3xl border border-amber-600/20 bg-white p-4 text-center shadow-xl"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => {
				if (e.key === 'Escape') onclose();
			}}
			role="dialog"
			aria-modal="true"
			tabindex="-1"
		>
			<img
				src={gif.src}
				alt={gif.caption}
				class="mx-auto max-h-64 w-auto rounded-2xl"
				draggable="false"
			/>
			<p class="mt-2 text-lg font-bold text-slate-800">{gif.caption}</p>
			<button
				class="mt-3 w-full rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-200 active:scale-95"
				onclick={onclose}
			>
				বন্ধ করুন
			</button>
		</div>
	</div>
{/if}
