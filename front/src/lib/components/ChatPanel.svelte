<script lang="ts">
	import { gameStore } from '$lib/stores/gameStore.svelte';
	import { send } from '$lib/utils/polling';
	import { REACT_COOLDOWN_MS } from '$lib/utils/social';

	let draft = $state('');
	let cooling = $state(false);
	let open = $state(false);

	const messages = $derived(
		[...(gameStore.gameState?.reactions ?? [])]
			.filter((f) => f.kind === 'text')
			.slice(-8)
			.reverse()
	);
	const unreadHint = $derived(messages.length > 0);

	async function sendChat() {
		const text = draft.trim();
		if (!text || cooling) return;
		cooling = true;
		setTimeout(() => (cooling = false), REACT_COOLDOWN_MS);
		draft = '';
		await send('SEND_CHAT', { text });
	}

	function onkey(e: KeyboardEvent) {
		if (e.key === 'Enter') sendChat();
	}
</script>

<div>
	<button
		class="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-500/50 hover:bg-sky-50 active:scale-[0.99]"
		onclick={() => (open = !open)}
	>
		<span>💬 চ্যাট {unreadHint ? `(${messages.length})` : ''}</span>
		<span class="text-xs text-slate-400">{open ? '▲' : '▼'}</span>
	</button>
	{#if open}
		<ul class="anim-log-in mt-2 max-h-40 space-y-1.5 overflow-y-auto text-sm">
			{#each messages as m (m.id)}
				<li class="rounded-lg bg-slate-50 px-2.5 py-1">
					<span class="font-semibold text-slate-700">{m.playerName}:</span>
					<span class="text-slate-600"> {m.body}</span>
				</li>
			{:else}
				<li class="px-2 py-1 text-xs text-slate-400">এখনও কোনো বার্তা নেই — প্রথমটি পাঠান!</li>
			{/each}
		</ul>
		<div class="mt-2 flex gap-1.5">
			<input
				class="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-500"
				placeholder="বার্তা লিখুন… (সর্বোচ্চ ১৪০ অক্ষর)"
				maxlength="140"
				bind:value={draft}
				onkeydown={onkey}
			/>
			<button
				class="shrink-0 rounded-xl bg-sky-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-sky-500 active:scale-95 disabled:opacity-50"
				disabled={!draft.trim() || cooling}
				onclick={sendChat}
			>
				➤
			</button>
		</div>
	{/if}
</div>
