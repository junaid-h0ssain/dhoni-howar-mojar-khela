'use client';

import { useGameStore } from '@/lib/stores/gameStore';
import { CHANCE_CARDS, CHEST_CARDS, cardTone, type Card } from '@/lib/constants/cards';

export default function CardDecks() {
	const gs = useGameStore((s) => s.gameState);
	const lastCard = gs?.status === 'IN_GAME' && gs.lastCard ? gs.lastCard : undefined;
	const toneClass =
		lastCard?.tone === 'good'
			? 'border-emerald-600/30 bg-emerald-50 text-emerald-900'
			: lastCard?.tone === 'bad'
				? 'border-red-600/30 bg-red-50 text-red-800'
				: 'border-slate-200 bg-slate-50 text-slate-700';

	function dot(c: Card): string {
		const t = cardTone(c);
		return t === 'good' ? 'bg-emerald-500' : t === 'bad' ? 'bg-red-500' : 'bg-slate-400';
	}

	function isLastDrawn(deck: 'CHANCE' | 'CHEST', text: string): boolean {
		return !!lastCard && lastCard.deck === deck && lastCard.text === text;
	}

	if (!gs || (gs.status !== 'IN_GAME' && gs.status !== 'LOBBY')) return null;

	return (
		<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
			<h2 className="mb-2 text-sm font-semibold tracking-wide text-slate-600">🎴 ভাগ্য ও সুযোগ</h2>
			{lastCard && (
				<div className={`mb-2 rounded-xl border px-3 py-2 text-center text-sm font-medium ${toneClass}`}>
					{lastCard.deck === 'CHANCE' ? '🎲' : '🎁'}
					{lastCard.text}
				</div>
			)}
			<div className="flex flex-col gap-2">
				<details className="rounded-xl border border-slate-200 bg-slate-50" open>
					<summary className="cursor-pointer px-3 py-2 text-sm font-bold text-slate-800">
						🎲 ভাগ্য পরীক্ষা <span className="font-normal text-slate-500">({CHANCE_CARDS.length}টি কার্ড)</span>
					</summary>
					<ul className="max-h-56 space-y-1 overflow-y-auto px-3 pb-3 text-sm">
						{CHANCE_CARDS.map((c, i) => (
							<li
								key={i}
								className={`flex items-start gap-2 rounded-lg px-2 py-1 ${
									isLastDrawn('CHANCE', c.text)
										? 'bg-amber-100 font-semibold text-amber-950'
										: 'text-slate-700'
								}`}
							>
								<span className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${dot(c)}`}></span>
								<span>{c.text}</span>
							</li>
						))}
					</ul>
				</details>
				<details className="rounded-xl border border-slate-200 bg-slate-50">
					<summary className="cursor-pointer px-3 py-2 text-sm font-bold text-slate-800">
						🎁 সুযোগ গ্রহণ <span className="font-normal text-slate-500">({CHEST_CARDS.length}টি কার্ড)</span>
					</summary>
					<ul className="max-h-56 space-y-1 overflow-y-auto px-3 pb-3 text-sm">
						{CHEST_CARDS.map((c, i) => (
							<li
								key={i}
								className={`flex items-start gap-2 rounded-lg px-2 py-1 ${
									isLastDrawn('CHEST', c.text)
										? 'bg-amber-100 font-semibold text-amber-950'
										: 'text-slate-700'
								}`}
							>
								<span className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${dot(c)}`}></span>
								<span>{c.text}</span>
							</li>
						))}
					</ul>
				</details>
			</div>
			<p className="mt-2 text-center text-[11px] text-slate-400">
				🟢 সবুজ = লাভ &nbsp;•&nbsp; 🔴 লাল = জরিমানা/শাস্তি
			</p>
		</section>
	);
}
