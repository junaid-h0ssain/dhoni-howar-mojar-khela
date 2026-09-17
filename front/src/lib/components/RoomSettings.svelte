<script lang="ts">
// Room rules picker — used in the pre-create Lobby and in the host's
// lobby panel. Pure presentational: parent owns the values.
	export const START_CASH_OPTIONS = [1000, 1500, 2000, 3000, 5000];
	export const GO_SALARY_OPTIONS = [100, 200, 300, 500];

	let {
		startCash = $bindable(1500),
		goSalary = $bindable(200),
		extremeMode = $bindable(false),
		editable = true,
		onchange
	}: {
		startCash?: number;
		goSalary?: number;
		extremeMode?: boolean;
		editable?: boolean;
		onchange?: (settings: { startCash: number; goSalary: number; extremeMode: boolean }) => void;
	} = $props();

	function emit() {
		onchange?.({ startCash, goSalary, extremeMode });
	}
</script>

<div class="rounded-2xl border border-amber-600/20 bg-amber-50/60 p-3">
	<p class="mb-2 text-xs font-bold tracking-wide text-amber-900">⚙️ খেলার নিয়ম</p>
	<div class="grid grid-cols-2 gap-2">
		<label class="block">
			<span class="mb-1 block text-xs font-medium text-slate-600">শুরুর টাকা</span>
			<select
				class="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-semibold text-slate-900 disabled:opacity-70"
				bind:value={startCash}
				disabled={!editable}
				onchange={emit}
			>
				{#each START_CASH_OPTIONS as v (v)}
					<option value={v}>৳{v}</option>
				{/each}
			</select>
		</label>
		<label class="block">
			<span class="mb-1 block text-xs font-medium text-slate-600">GO পার হলে</span>
			<select
				class="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-semibold text-slate-900 disabled:opacity-70"
				bind:value={goSalary}
				disabled={!editable || extremeMode}
				onchange={emit}
				title={extremeMode ? 'এক্সট্রিম মোডে GO সবসময় ৳500' : 'GO পার হলে এই টাকা পাবেন'}
			>
				{#each GO_SALARY_OPTIONS as v (v)}
					<option value={v}>৳{v}</option>
				{/each}
			</select>
		</label>
	</div>
	<label
		class="mt-2 flex cursor-pointer items-center justify-between gap-2 rounded-xl border px-2.5 py-2 transition {extremeMode
			? 'border-red-400 bg-red-50'
			: 'border-slate-200 bg-white'} {editable ? '' : 'pointer-events-none opacity-80'}"
		title="এক্সট্রিম মোড: GO পার হলে ৳500, কিন্তু আয়কর ও বিলাস কর দ্বিগুণ!"
	>
		<span class="text-xs font-bold {extremeMode ? 'text-red-700' : 'text-slate-700'}">
			🔥 এক্সট্রিম মোড
			<span class="block text-[11px] font-normal {extremeMode ? 'text-red-600' : 'text-slate-500'}">
				GO = ৳500 · আয়কর/বিলাস কর দ্বিগুণ
			</span>
		</span>
		<input
			type="checkbox"
			class="h-5 w-5 accent-red-600"
			bind:checked={extremeMode}
			disabled={!editable}
			onchange={emit}
		/>
	</label>
</div>
