'use client';

import { useGameStore } from '@/lib/stores/gameStore';
import CashDisplay from '@/lib/components/CashDisplay';
import { tileIcon } from '@/lib/utils/tileIcons';

const tokenShapes = [
	'circle',
	'square',
	'triangle',
	'diamond',
	'star',
	'hexagon',
	'pentagon',
	'plus',
	'ring',
	'shield'
];

const shapeClass: Record<string, string> = {
	circle: 'rounded-full',
	square: 'rounded-[2px]',
	triangle: '[clip-path:polygon(50%_0,100%_100%,0_100%)]',
	diamond: 'rotate-45 scale-[0.78] rounded-[2px]',
	star: '[clip-path:polygon(50%_0,61%_35%,98%_35%,68%_57%,79%_100%,50%_73%,21%_100%,32%_57%,2%_35%,39%_35%)]',
	hexagon: '[clip-path:polygon(25%_0,75%_0,100%_50%,75%_100%,25%_100%,0_50%)]',
	pentagon: '[clip-path:polygon(50%_0,100%_38%,82%_100%,18%_100%,0_38%)]',
	plus: '[clip-path:polygon(35%_0,65%_0,65%_35%,100%_35%,100%_65%,65%_65%,65%_100%,35%_100%,35%_65%,0_65%,0_35%,35%_35%)]',
	ring: 'rounded-full border-[3px] border-current bg-transparent',
	shield: '[clip-path:polygon(50%_0,95%_18%,85%_72%,50%_100%,15%_72%,5%_18%)]'
};

export default function PlayerList({ onselect }: { onselect?: (id: string) => void }) {
	const gs = useGameStore((s) => s.gameState);

	/** Property + house counts per player, derived from authoritative tiles. */
	function holdings(playerId: string): { props: number; houses: number } {
		let props = 0;
		let houses = 0;
		const tiles = gs?.tiles;
		if (!tiles) return { props, houses };
		for (const t of Object.values(tiles)) {
			if (t.ownerId === playerId) {
				props += 1;
				houses += t.type === 'PROPERTY' ? Math.min(t.houses, 5) : 0;
			}
		}
		return { props, houses };
	}

	/** Where a player token sits, e.g. "🚂 পাহাড়তলী স্টেশন". */
	function locationOf(position: number): string {
		const t = gs?.tiles[position];
		if (!t) return `ঘর ${position}`;
		const icon = tileIcon(t);
		return icon ? `${icon} ${t.nameBn}` : t.nameBn;
	}

	return (
		<div>
			<h2 className="mb-2 text-sm font-semibold tracking-wide text-emerald-800">👥 Players</h2>
			{!gs ? (
				<p className="text-sm text-slate-500">এখনও কেউ যোগ দেয়নি।</p>
			) : (
				<>
					<ul className="space-y-1.5">
						{gs.players.map((p, i) => {
							const h = holdings(p.id);
							const isTurn = p.id === gs.currentTurnPlayerId;
							return (
								<li
									key={p.id}
									className={`rounded-xl border px-2.5 py-1.5 text-sm transition ${
										isTurn
											? 'anim-turn-pulse border-amber-600/50 bg-amber-100'
											: 'border-slate-200 bg-slate-50'
									} ${p.isBankrupt ? 'opacity-50 saturate-50' : ''}`}
									title={`সম্পত্তি: ${h.props}, বাড়ি/হোটেল: ${h.houses}`}
								>
									<button
										className="flex w-full cursor-pointer flex-wrap items-center gap-2 rounded-lg text-left hover:bg-emerald-50/50"
										title="বিস্তারিত দেখতে ক্লিক করুন"
										onClick={() => onselect?.(p.id)}
									>
										<span
											className={`inline-block h-3 w-3 ${shapeClass[tokenShapes[i % tokenShapes.length]]}`}
											style={{ backgroundColor: p.tokenColor }}
										></span>
										<span className="font-medium text-slate-800">{p.name}</span>
										<CashDisplay cash={p.cash} />
										<span className="text-slate-500">
											· 🏠{h.props}
											{h.houses > 0 && <>+{h.houses}</>}
										</span>
										{isTurn && (
											<span className="anim-glow-drift rounded-full bg-amber-500/20 px-1.5 text-xs font-bold text-amber-800">
												● চাল
											</span>
										)}
										{p.inJail && (
											<span className="rounded-full bg-slate-700 px-1.5 text-xs text-white">🔒 জেলে</span>
										)}
										{(p.jailCards ?? 0) > 0 && (
											<span
												className="rounded-full bg-purple-100 px-1.5 text-xs text-purple-800"
												title="জেল থেকে মুক্তির কার্ড"
											>
												🃏×{p.jailCards}
											</span>
										)}
										{!p.isConnected && (
											<span className="rounded-full bg-slate-200 px-1.5 text-xs text-slate-500">অফলাইন</span>
										)}
										{p.isBankrupt && (
											<span className="rounded-full bg-red-100 px-1.5 text-xs text-red-700">💸 দেউলিয়া</span>
										)}
										<span className="w-full text-xs text-slate-500" title="বর্তমান অবস্থান">
											📍 {locationOf(p.position)}
										</span>
									</button>
								</li>
							);
						})}
					</ul>
					<p className="mt-2 text-xs text-slate-500">
						বোর্ডে মালিকের রঙের বর্ডার দেখুন — যেকোনো ঘরে ক্লিক করলে বিস্তারিত দেখা যাবে।
					</p>
					{gs.status === 'IN_GAME' && gs.players.length < 10 && (
						<p className="mt-1 rounded-xl border border-emerald-700/20 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
							নতুন খেলোয়াড় Room Code ({gs.roomId}) দিয়ে খেলার মাঝেও যোগ দিতে পারবে — ৳1500 নিয়ে শুরু
							করবে।
						</p>
					)}
				</>
			)}
		</div>
	);
}
