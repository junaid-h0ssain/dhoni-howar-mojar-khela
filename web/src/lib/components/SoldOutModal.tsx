'use client';

import { useGameStore } from '@/lib/stores/gameStore';

export default function SoldOutModal({
	open,
	onclose
}: {
	open: boolean;
	onclose: () => void;
}) {
	const gs = useGameStore((s) => s.gameState);
	const playerId = useGameStore((s) => s.playerId);

	const myProps = Object.values(gs?.tiles ?? {})
		.filter((t) => t.type === 'PROPERTY' && t.ownerId === playerId)
		.sort((a, b) => a.id - b.id);

	if (!open) return null;

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
			onClick={onclose}
			role="presentation"
		>
			<div
				className="anim-modal-in w-full max-w-sm rounded-3xl border border-emerald-600/20 bg-white p-6 text-center text-slate-800 shadow-xl"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => {
					if (e.key === 'Escape') onclose();
				}}
				role="dialog"
				aria-modal="true"
				tabIndex={-1}
			>
				<p className="text-5xl">🎉</p>
				<h3 className="mt-2 text-xl font-bold text-emerald-900">সব সম্পত্তি বিক্রি হয়ে গেছে!</h3>
				<p className="mt-1 text-sm text-slate-600">
					এখন নিজের যেকোনো জমিতে বাড়ি তুলতে পারবেন — <b>৪টি 🏠 সবুজ ডট</b> হলে পরের ধাপে
					<b className="text-red-600">১টি 🔴 হোটেল ডটে</b> আপগ্রেড হবে। পুরো গ্রুপ একা দখলে থাকলে
					খালি জমির ভাড়া <b>দ্বিগুণ</b> পাবেন!
				</p>
				<div className="mt-3 flex items-center justify-center gap-2 text-sm">
					<span className="flex items-center gap-1">
						<span className="inline-block h-3 w-3 rounded-full bg-green-600"></span>
						<span className="inline-block h-3 w-3 rounded-full bg-green-600"></span>
						<span className="inline-block h-3 w-3 rounded-full bg-green-600"></span>
						<span className="inline-block h-3 w-3 rounded-full bg-green-600"></span>
						→<span className="inline-block h-3.5 w-3.5 rounded-full bg-red-600"></span>
					</span>
				</div>
				{myProps.length > 0 ? (
					<p className="mt-2 text-xs text-slate-500">
						আপনার {myProps.length}টি জমি তৈরি করার জন্য প্রস্তুত হতে পারে।
					</p>
				) : (
					<p className="mt-2 text-xs text-slate-500">আপনার নামে কোনো জমি নেই — ভাড়া দিয়ে টিকে থাকুন!</p>
				)}
				<button
					className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-2.5 font-bold text-white transition hover:bg-emerald-500 active:scale-95"
					onClick={onclose}
				>
					🏠 বাড়ি তোলা শুরু করুন
				</button>
			</div>
		</div>
	);
}
