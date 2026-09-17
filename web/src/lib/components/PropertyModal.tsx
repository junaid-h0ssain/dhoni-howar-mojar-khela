'use client';

import { useGameStore } from '@/lib/stores/gameStore';
import { tileIcon } from '@/lib/utils/tileIcons';

// Railroad rent (server rule: 25/50/100/200 by count owned).
const RAILROAD_RENTS = [25, 50, 100, 200];

export default function PropertyModal({
	tileId,
	onclose
}: {
	tileId: number | null;
	onclose: () => void;
}) {
	const gs = useGameStore((s) => s.gameState);

	const tile = tileId != null ? gs?.tiles[tileId] : undefined;
	const owner = tile?.ownerId ? gs?.players.find((p) => p.id === tile.ownerId) : undefined;
	const levelLabel = !tile
		? ''
		: tile.houses >= 5
			? 'হোটেল 🏨'
			: tile.houses > 0
				? `বাড়ি ×${tile.houses} 🏠`
				: 'খালি জমি';
	const currentRent = tile?.rentTiers ? tile.rentTiers[Math.min(tile.houses, 5)] : undefined;
	const ownerRailCount =
		tile?.type === 'RAILROAD' && tile.ownerId
			? Object.values(gs?.tiles ?? {}).filter(
					(t) => t.type === 'RAILROAD' && t.ownerId === tile.ownerId
				).length
			: 0;
	const currentRailRent =
		ownerRailCount > 0 ? RAILROAD_RENTS[Math.min(ownerRailCount, 4) - 1] : undefined;
	// Utility rent (server rule: dice total ×4 with one, ×10 with both).
	const ownerUtilCount =
		tile?.type === 'UTILITY' && tile.ownerId
			? Object.values(gs?.tiles ?? {}).filter(
					(t) => t.type === 'UTILITY' && t.ownerId === tile.ownerId
				).length
			: 0;
	const utilMult = ownerUtilCount >= 2 ? 10 : 4;
	const occupants =
		tileId != null ? (gs?.players.filter((pl) => pl.position === tileId) ?? []) : [];

	if (tileId == null || !tile) return null;

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
				<h3 className="text-xl font-bold text-slate-900">
					{tileIcon(tile) && <span className="mr-1">{tileIcon(tile)}</span>}
					{tile.nameBn}
				</h3>
				<p className="text-sm text-slate-500">{tile.nameEn}</p>
				{tile.price && <p className="mt-2 font-mono text-lg text-emerald-700">৳{tile.price}</p>}
				{tile.mortgage ? (
					<p className="mt-1 text-sm text-slate-600">
						🏦 বন্ধক মূল্য: <b className="text-slate-800">৳{tile.mortgage}</b>{' '}
						<span className="text-xs text-slate-400">(শুধু তথ্য)</span>
					</p>
				) : null}
				{tile.type === 'PROPERTY' && tile.houseCost ? (
					<p className="mt-1 text-sm text-slate-600">
						🏠 প্রতি বাড়ির খরচ: <b className="text-slate-800">৳{tile.houseCost}</b>
					</p>
				) : null}
				<p className="mt-1 flex items-center gap-2 text-sm text-slate-600">
					<span>মালিক:</span>
					{owner ? (
						<>
							<span
								className="inline-block h-3 w-3 rounded-full"
								style={{ backgroundColor: owner.tokenColor }}
							></span>
							<span className="font-medium text-slate-900">{owner.name}</span>
						</>
					) : (
						<span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
							✨ ব্যাংক (কেনা যায়)
						</span>
					)}
				</p>
				{tile.type === 'PROPERTY' && (
					<>
						<p className="mt-1 text-sm text-slate-600">অবস্থা: {levelLabel}</p>
						<div className="mt-1.5 flex items-center gap-1.5">
							{[1, 2, 3, 4].map((i) => (
								<span
									key={i}
									className={`inline-block h-3 w-3 rounded-full border ${
										tile.houses >= 5
											? 'border-slate-200 bg-slate-100'
											: i <= tile.houses
												? 'border-green-700 bg-green-600'
												: 'border-slate-300 bg-slate-100'
									}`}
									title={i <= tile.houses ? `বাড়ি ${i}` : `খালি স্লট ${i}`}
								></span>
							))}
							<span className="text-xs text-slate-400">→</span>
							<span
								className={`inline-block h-3.5 w-3.5 rounded-full border ${
									tile.houses >= 5
										? 'border-red-700 bg-red-600'
										: 'border-slate-300 bg-slate-100'
								}`}
								title="হোটেল (৪ বাড়ির পর)"
							></span>
							<span className="text-xs text-slate-500">
								{tile.houses >= 5
									? 'হোটেল হয়ে গেছে'
									: tile.houses === 4
										? 'পরের ধাপ: হোটেল'
										: `${tile.houses}/৪ বাড়ি`}
							</span>
						</div>
					</>
				)}
				{occupants.length > 0 && (
					<div className="mt-2 text-sm">
						<p className="font-medium text-slate-700">📍 এখানে আছে:</p>
						<ul className="mt-1 flex flex-wrap gap-1.5">
							{occupants.map((pl) => (
								<li
									key={pl.id}
									className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs"
								>
									<span
										className="inline-block h-2.5 w-2.5 rounded-full"
										style={{ backgroundColor: pl.tokenColor }}
									></span>
									<span className="font-medium text-slate-700">{pl.name}</span>
									{pl.isBankrupt && <span className="text-red-600">(দেউলিয়া)</span>}
								</li>
							))}
						</ul>
					</div>
				)}
				{tile.rentTiers && (
					<div className="mt-2 text-sm">
						<p className="font-medium text-slate-700">ভাড়া তালিকা:</p>
						<ul className="mt-1 grid grid-cols-3 gap-1 text-center">
							{tile.rentTiers.map((rent, i) => (
								<li
									key={i}
									className={`rounded-lg border px-1 py-0.5 ${
										i === Math.min(tile.houses, 5)
											? 'border-emerald-600/50 bg-emerald-100 font-bold text-emerald-900'
											: 'border-slate-200 bg-slate-50 text-slate-500'
									}`}
								>
									{i === 5 ? 'হোটেল' : i === 0 ? 'খালি' : i + '🏠'}: ৳{rent}
								</li>
							))}
						</ul>
						{currentRent !== undefined && owner && (
							<p className="mt-1 text-slate-600">
								বর্তমান ভাড়া: <b className="text-amber-700">৳{currentRent}</b>
							</p>
						)}
					</div>
				)}
				{tile.type === 'RAILROAD' && (
					<div className="mt-2 text-sm">
						<p className="font-medium text-slate-700">🚂 ভাড়া তালিকা (মালিকের স্টেশন সংখ্যা অনুযায়ী):</p>
						<ul className="mt-1 grid grid-cols-2 gap-1 text-center">
							{RAILROAD_RENTS.map((rent, i) => (
								<li
									key={i}
									className={`rounded-lg border px-1 py-0.5 ${
										ownerRailCount === i + 1
											? 'border-emerald-600/50 bg-emerald-100 font-bold text-emerald-900'
											: 'border-slate-200 bg-slate-50 text-slate-500'
									}`}
								>
									{i + 1}টি স্টেশন: ৳{rent}
								</li>
							))}
						</ul>
						{owner && currentRailRent !== undefined ? (
							<p className="mt-1 text-slate-600">
								{owner.name}-এর {ownerRailCount}টি স্টেশন — বর্তমান ভাড়া:
								<b className="text-amber-700">৳{currentRailRent}</b>
							</p>
						) : (
							<p className="mt-1 text-slate-500">যত বেশি স্টেশন একজনের হাতে, ভাড়া তত বেশি।</p>
						)}
					</div>
				)}
				{tile.type === 'UTILITY' && (
					<div className="mt-2 text-sm">
						<p className="font-medium text-slate-700">💡 ভাড়া (পাশার যোগফল × গুণক):</p>
						<ul className="mt-1 grid grid-cols-2 gap-1 text-center">
							<li
								className={`rounded-lg border px-1 py-0.5 ${ownerUtilCount === 1 ? 'border-emerald-600/50 bg-emerald-100 font-bold text-emerald-900' : 'border-slate-200 bg-slate-50 text-slate-500'}`}
							>
								১টি থাকলে: পাশা × ৪
							</li>
							<li
								className={`rounded-lg border px-1 py-0.5 ${ownerUtilCount >= 2 ? 'border-emerald-600/50 bg-emerald-100 font-bold text-emerald-900' : 'border-slate-200 bg-slate-50 text-slate-500'}`}
							>
								২টি থাকলে: পাশা × ১০
							</li>
						</ul>
						{owner ? (
							<p className="mt-1 text-slate-600">
								{owner.name}-এর {ownerUtilCount}টি — বর্তমান গুণক:{' '}
								<b className="text-amber-700">× {utilMult}</b>(যেমন পাশায় ৭ উঠলে ভাড়া ৳
								{7 * utilMult})
							</p>
						) : (
							<p className="mt-1 text-slate-500">
								যে পাশা ফেলে এখানে থামবে তার যোগফলের সাথে গুণ হবে — দুটোই একজনের হাতে থাকলে ভাড়া
								বেশি।
							</p>
						)}
					</div>
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
