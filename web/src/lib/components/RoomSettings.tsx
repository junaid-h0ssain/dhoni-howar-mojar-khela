'use client';

export const START_CASH_OPTIONS = [1000, 1500, 2000, 3000, 5000];
export const GO_SALARY_OPTIONS = [100, 200, 300, 500];

export interface RoomSettingsValue {
	startCash: number;
	goSalary: number;
	extremeMode: boolean;
}

export default function RoomSettings({
	startCash = 1500,
	goSalary = 200,
	extremeMode = false,
	editable = true,
	onchange
}: Partial<RoomSettingsValue> & {
	editable?: boolean;
	onchange?: (settings: RoomSettingsValue) => void;
}) {
	function emit(next: RoomSettingsValue) {
		onchange?.(next);
	}

	return (
		<div className="rounded-2xl border border-amber-600/20 bg-amber-50/60 p-3">
			<p className="mb-2 text-xs font-bold tracking-wide text-amber-900">⚙️ খেলার নিয়ম</p>
			<div className="grid grid-cols-2 gap-2">
				<label className="block">
					<span className="mb-1 block text-xs font-medium text-slate-600">শুরুর টাকা</span>
					<select
						className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-semibold text-slate-900 disabled:opacity-70"
						value={startCash}
						disabled={!editable}
						onChange={(e) => emit({ startCash: Number(e.target.value), goSalary, extremeMode })}
					>
						{START_CASH_OPTIONS.map((v) => (
							<option key={v} value={v}>
								৳{v}
							</option>
						))}
					</select>
				</label>
				<label className="block">
					<span className="mb-1 block text-xs font-medium text-slate-600">GO পার হলে</span>
					<select
						className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-semibold text-slate-900 disabled:opacity-70"
						value={goSalary}
						disabled={!editable || extremeMode}
						onChange={(e) => emit({ startCash, goSalary: Number(e.target.value), extremeMode })}
						title={extremeMode ? 'এক্সট্রিম মোডে GO সবসময় ৳500' : 'GO পার হলে এই টাকা পাবেন'}
					>
						{GO_SALARY_OPTIONS.map((v) => (
							<option key={v} value={v}>
								৳{v}
							</option>
						))}
					</select>
				</label>
			</div>
			<label
				className={`mt-2 flex cursor-pointer items-center justify-between gap-2 rounded-xl border px-2.5 py-2 transition ${
					extremeMode ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white'
				} ${editable ? '' : 'pointer-events-none opacity-80'}`}
				title="এক্সট্রিম মোড: GO পার হলে ৳500, কিন্তু আয়কর ও বিলাস কর দ্বিগুণ!"
			>
				<span className={`text-xs font-bold ${extremeMode ? 'text-red-700' : 'text-slate-700'}`}>
					🔥 এক্সট্রিম মোড
					<span
						className={`block text-[11px] font-normal ${extremeMode ? 'text-red-600' : 'text-slate-500'}`}
					>
						GO = ৳500 · আয়কর/বিলাস কর দ্বিগুণ
					</span>
				</span>
				<input
					type="checkbox"
					className="h-5 w-5 accent-red-600"
					checked={extremeMode}
					disabled={!editable}
					onChange={(e) => emit({ startCash, goSalary, extremeMode: e.target.checked })}
				/>
			</label>
		</div>
	);
}
