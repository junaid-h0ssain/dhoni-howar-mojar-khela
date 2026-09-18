<script lang="ts">
	import { gameStore } from '$lib/stores/gameStore.svelte';
	import { send } from '$lib/utils/polling';
	import { EMOJI_PRESETS, REACT_COOLDOWN_MS } from '$lib/utils/social';

	let cooling = $state(false);

	const canSend = $derived(!!gameStore.gameState && !!gameStore.playerId);

	async function react(emoji: string) {
		if (cooling || !canSend) return;
		cooling = true;
		setTimeout(() => (cooling = false), REACT_COOLDOWN_MS);
		await send('SEND_REACTION', { emoji });
	}
</script>

<div>
	<h2 class="mb-2 text-sm font-semibold tracking-wide text-amber-700">😄 রিঅ্যাকশন</h2>
	<div class="grid grid-cols-8 gap-1">
		{#each EMOJI_PRESETS as emoji (emoji)}
			<button
				class="rounded-xl border border-slate-200 bg-slate-50 py-1.5 text-xl transition hover:border-amber-500/50 hover:bg-amber-50 active:scale-90 disabled:opacity-40"
				disabled={!canSend || cooling}
				onclick={() => react(emoji)}
				title="সবাইকে {emoji} পাঠান"
			>
				{emoji}
			</button>
		{/each}
	</div>
	{#if gameStore.lastError && gameStore.lastError.includes('সেকেন্ড')}
		<p class="mt-1 text-center text-[11px] font-medium text-red-600">{gameStore.lastError}</p>
	{/if}
</div>
