'use client';

import { useGameStore } from '@/lib/stores/gameStore';
import { tileIcon } from '@/lib/utils/tileIcons';
import { GROUP_COLORS } from '@/lib/constants/boardData';

export default function UnsoldModal({
	open,
	onclose,
	onselect
}: {
	open: boolean;
	onclose: () => void;
	onselect?: (id: number) => void;
}) {
	const gs = useGameStore((s) => s.gameState);

	const unsold = Object.values(gs?.tiles ?? {})
		.filter(
			(t) => (t.type === 'PROPERTY' || t.type === 'UTILITY' || t.type === 'RAILROAD') && !t.ownerId
		)
		.sort((a, b) => a.id - b.id);

	function typeLabel(type: string): string {
		if (type === 'UTILITY') return 'ইউটিলিটি';
		if (type === 'RAILROAD') return 'স্টেশন';
		return 'সম্পত্তি';
	}

	if (!open) return null;

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
			onClick={onclose}
			role="presentation"
		>
			<div
				className="anim-modal-in w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 text-slate-800 shadow-xl"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => {
					if (e.key === 'Escape') onclose();
				}}
				role="dialog"
				aria-modal="true"
				tabIndex={-1}
			>
				<h3 className="text-xl font-bold text-slate-900">🏘️ অবিক্রীত সম্পত্তি ({unsold.length}টি)</h3>
				<p className="mt-0.5 text-xs text-slate-500">কিনতে ঘরটিতে থামুন — বিস্তারিত দেখতে ট্যাপ করুন।</p>
				{unsold.length === 0 ? (
					<p className="mt-2 text-sm text-slate-500">সব সম্পত্তি বিক্রি হয়ে গেছে! 🎉</p>
				) : (
					<ul className="mt-2 max-h-72 space-y-1.5 overflow-y-auto">
						{unsold.map((t) => (
							<li key={t.id}>
								<button
									className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left text-sm transition hover:border-emerald-600/50 hover:bg-emerald-50/50 active:scale-[0.99]"
									onClick={() => {
										onselect?.(t.id);
										onclose();
									}}
								>
									{t.group && GROUP_COLORS[t.group] && (
										<span
											className="inline-block h-6 w-1.5 shrink-0 rounded-full"
											style={{ backgroundColor: GROUP_COLORS[t.group] }}
										></span>
									)}
									<span className="min-w-0 flex-1">
										<span className="block truncate font-medium text-slate-800">
											{tileIcon(t) && <>{tileIcon(t)} </>}
											{t.nameBn}
										</span>
										<span className="block text-xs text-slate-500">{typeLabel(t.type)}</span>
									</span>
									<span className="shrink-0 font-mono text-emerald-700">৳{t.price}</span>
								</button>
							</li>
						))}
					</ul>
				)}
				<button
					className="mt-4 w-full rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white transition hover:bg-slate-700 active:scale-95"
					onClick={onclose}
				>
					বন্ধ করুন
				</button>
			</div>
		</div>
	);
}
