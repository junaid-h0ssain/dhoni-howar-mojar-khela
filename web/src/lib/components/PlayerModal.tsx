'use client';

import { useGameStore } from '@/lib/stores/gameStore';
import { GROUP_COLORS } from '@/lib/constants/boardData';
import CashDisplay from '@/lib/components/CashDisplay';
import { tileIcon } from '@/lib/utils/tileIcons';

function levelLabel(houses: number): string {
	if (houses >= 5) return 'হোটেল 🏨';
	if (houses > 0) return `বাড়ি ×${houses} 🏠`;
	return 'খালি জমি';
}

export default function PlayerModal({
	playerId,
	onclose
}: {
	playerId: string | null;
	onclose: () => void;
}) {
	const gs = useGameStore((s) => s.gameState);

	const player = playerId != null ? gs?.players.find((p) => p.id === playerId) : undefined;
	const isTurn = player != null && player.id === gs?.currentTurnPlayerId;
	const location = (() => {
		if (!player) return '—';
		const t = gs?.tiles[player.position];
		if (!t) return `ঘর ${player.position}`;
		const icon = tileIcon(t);
		return icon ? `${icon} ${t.nameBn}` : t.nameBn;
	})();
	const properties = player
		? Object.values(gs?.tiles ?? {})
				.filter((t) => t.ownerId === player.id)
				.sort((a, b) => a.id - b.id)
		: [];
	const cards = player?.jailCards ?? 0;

	if (playerId == null || !player) return null;

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
				<h3 className="flex items-center gap-2 text-xl font-bold text-slate-900">
					<span
						className="inline-block h-4 w-4 rounded-full"
						style={{ backgroundColor: player.tokenColor }}
					></span>
					{player.name}
				</h3>
				<div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
					{isTurn && (
						<span className="rounded-full bg-amber-500/20 px-2 py-0.5 font-bold text-amber-800">
							● চাল চলছে
						</span>
					)}
					{player.inJail && (
						<span className="rounded-full bg-slate-700 px-2 py-0.5 text-white">
							🔒 জেলে ({player.jailTurns + 1}/3)
						</span>
					)}
					{!player.isConnected && (
						<span className="rounded-full bg-slate-200 px-2 py-0.5 text-slate-500">অফলাইন</span>
					)}
					{player.isBankrupt && (
						<span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">💸 দেউলিয়া</span>
					)}
				</div>
				<div className="mt-3 space-y-1 text-sm text-slate-600">
					<p className="flex items-center gap-2">
						<span>💰 নগদ:</span>
						<CashDisplay cash={player.cash} />
					</p>
					<p>
						📍 অবস্থান: <span className="font-medium text-slate-800">{location}</span>
					</p>
					<p>
						🃏 মুক্তির কার্ড:{' '}
						<span className="font-medium text-slate-800">{cards > 0 ? `${cards}টি` : 'নেই'}</span>
					</p>
				</div>
				<div className="mt-3">
					<p className="text-sm font-medium text-slate-700">🏠 সম্পত্তি ({properties.length}টি):</p>
					{properties.length === 0 ? (
						<p className="mt-1 text-sm text-slate-500">এখনও কোনো সম্পত্তি কেনেননি।</p>
					) : (
						<ul className="mt-1.5 max-h-56 space-y-1.5 overflow-y-auto">
							{properties.map((t) => (
								<li
									key={t.id}
									className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm"
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
										<span className="block text-xs text-slate-500">
											{t.type === 'PROPERTY' ? `${levelLabel(t.houses)} · ` : ''}৳{t.price}
										</span>
									</span>
								</li>
							))}
						</ul>
					)}
				</div>
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
