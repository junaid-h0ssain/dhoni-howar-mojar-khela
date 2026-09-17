'use client';

import { useEffect, useState } from 'react';
import {
	useGameStore,
	selectCanRoll,
	selectCanAct,
	selectCanEndTurn,
	selectIsHost,
	selectMe,
	selectCurrentPlayer
} from '@/lib/stores/gameStore';
import { send } from '@/lib/utils/polling';
import { diceFace } from '@/lib/utils/dice';
import ClickSpark from '@/lib/components/bits/ClickSpark';
import UnsoldModal from '@/lib/components/UnsoldModal';
import RoomSettings from '@/lib/components/RoomSettings';

export default function ActionPanel({ onselecttile }: { onselecttile?: (id: number) => void }) {
	const [buildTileId, setBuildTileId] = useState<number | null>(null);
	const [buildCount, setBuildCount] = useState(1);
	const [building, setBuilding] = useState(false);
	const [showUnsold, setShowUnsold] = useState(false);

	const gs = useGameStore((s) => s.gameState);
	const playerId = useGameStore((s) => s.playerId);
	const lastError = useGameStore((s) => s.lastError);
	const st = useGameStore();
	const canRoll = selectCanRoll(st);
	const canAct = selectCanAct(st);
	const canEndTurn = selectCanEndTurn(st);
	const isHost = selectIsHost(st);
	const me = selectMe(st);
	const currentPlayer = selectCurrentPlayer(st);

	const tilesList = Object.values(gs?.tiles ?? {}).sort((a, b) => a.id - b.id);
	const unsoldCount = tilesList.filter(
		(t) => (t.type === 'PROPERTY' || t.type === 'UTILITY' || t.type === 'RAILROAD') && !t.ownerId
	).length;
	const allSold = !!gs && gs.status === 'IN_GAME' && unsoldCount === 0;
	const myBuildable = tilesList.filter(
		(t) => t.type === 'PROPERTY' && t.ownerId === playerId && t.houses < 5
	);
	const buildTile = tilesList.find((t) => t.id === buildTileId);
	const buildLabel = !buildTile ? '' : buildTile.houses >= 4 ? 'হোটেল তৈরি করুন' : 'বাড়ি তৈরি করুন';
	// Group this build belongs to: bulk builds spread evenly across the
	// player's owned tiles here (server distributes lowest-first).
	const buildGroup = !buildTile
		? []
		: tilesList.filter(
				(t) =>
					t.type === 'PROPERTY' && t.group === buildTile.group && t.ownerId === playerId
			);
	const groupHeadroom = buildGroup.reduce((a, t) => a + Math.max(0, 5 - t.houses), 0);
	// Client-side preview of an even bulk build: mirror the server's
	// lowest-first distribution to show real cost & per-tile result.
	const buildPreview = (() => {
		if (!buildTile || buildGroup.length === 0)
			return { levels: 0, cost: 0, per: [] as { id: number; name: string; add: number; to: number }[] };
		const levels = buildGroup.map((t) => ({
			id: t.id,
			name: t.nameBn,
			houses: t.houses,
			cost: t.houseCost ?? 0
		}));
		let cash = me?.cash ?? 0;
		let cost = 0;
		let n = 0;
		const want = Math.max(1, Math.min(25, Math.floor(buildCount) || 1));
		for (let i = 0; i < want; i++) {
			const open = levels.filter((l) => l.houses < 5);
			if (open.length === 0) break;
			open.sort(
				(a, b) => a.houses - b.houses || (a.id === buildTile.id ? -1 : b.id === buildTile.id ? 1 : a.id - b.id)
			);
			const target = open[0];
			if (cash < target.cost) break;
			cash -= target.cost;
			cost += target.cost;
			target.houses++;
			n++;
		}
		const per = levels
			.filter((l) => {
				const before = buildGroup.find((t) => t.id === l.id)?.houses ?? 0;
				return l.houses > before;
			})
			.map((l) => {
				const before = buildGroup.find((t) => t.id === l.id)?.houses ?? 0;
				return { id: l.id, name: l.name, add: l.houses - before, to: l.houses };
			});
		return { levels: n, cost, per };
	})();
	const buildCapped = Math.min(Math.max(1, Math.floor(buildCount) || 1), Math.max(1, groupHeadroom));
	const previewShort =
		buildGroup.length <= 1 || buildPreview.levels <= 1
			? ''
			: ` → ${buildPreview.per.map((p) => `${p.name} +${p.add}`).join(', ')}`;
	// Older servers omit lapsCompleted — only an explicit 0 locks buying.
	const buyLocked = (me?.lapsCompleted ?? 1) < 1;

	// Lobby rules (host-editable). Local mirrors let the host tweak without
	// fighting the 4s lobby poll; server remains authoritative.
	const [lobbyStartCash, setLobbyStartCash] = useState(1500);
	const [lobbyGoSalary, setLobbyGoSalary] = useState(200);
	const [lobbyExtreme, setLobbyExtreme] = useState(false);

	const serverSettings = gs?.settings;

	useEffect(() => {
		// Adopt server truth whenever we're not the host editing.
		if (!isHost || gs?.status !== 'LOBBY') {
			if (serverSettings) {
				setLobbyStartCash(serverSettings.startCash);
				setLobbyGoSalary(serverSettings.goSalary);
				setLobbyExtreme(serverSettings.extremeMode);
			}
		}
	}, [isHost, gs?.status, serverSettings]);

	function pushSettings(settings: { startCash: number; goSalary: number; extremeMode: boolean }) {
		setLobbyStartCash(settings.startCash);
		setLobbyGoSalary(settings.goSalary);
		setLobbyExtreme(settings.extremeMode);
		send('UPDATE_SETTINGS', { settings });
	}

	// In-game rules badge: effective GO payout + extreme flag.
	const effectiveGo = gs?.settings?.extremeMode ? 500 : (gs?.settings?.goSalary ?? 200);
	const isExtreme = gs?.settings?.extremeMode === true;

	useEffect(() => {
		// Default the dropdown to the first buildable tile.
		if (buildTileId == null && myBuildable.length > 0) {
			setBuildTileId(myBuildable[0].id);
		}
		if (buildTileId != null && !myBuildable.some((t) => t.id === buildTileId)) {
			setBuildTileId(myBuildable.length > 0 ? myBuildable[0].id : null);
		}
		// Keep the bulk quantity within the group's remaining headroom.
		if (groupHeadroom > 0 && buildCount > groupHeadroom) setBuildCount(groupHeadroom);
		if (buildCount < 1) setBuildCount(1);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [buildTileId, groupHeadroom, myBuildable.map((t) => t.id).join(',')]);

	async function buildMany() {
		if (buildTileId == null || building) return;
		const n = Math.min(Math.max(1, Math.floor(buildCount) || 1), 25);
		setBuilding(true);
		try {
			await send('BUILD_HOUSE', { tileId: buildTileId, count: n });
		} finally {
			setBuilding(false);
		}
	}

	function levelLabel(houses: number): string {
		if (houses >= 5) return 'হোটেল';
		if (houses > 0) return `বাড়ি ×${houses}`;
		return 'খালি জমি';
	}

	const shownDice = gs?.dice ?? [1, 1];
	const jailCards = me?.jailCards ?? 0;

	return (
		<div>
			<h2 className="mb-2 text-sm font-semibold tracking-wide text-amber-700">🎯 চাল</h2>
			{gs?.status === 'IN_GAME' && (
				<>
					<p className="mb-1 text-center text-[11px] font-medium text-slate-500">
						💰 শুরু ৳{gs.settings?.startCash ?? 1500} · GO ৳{effectiveGo}
						{isExtreme && <span className="font-bold text-red-600"> · 🔥 এক্সট্রিম</span>}
					</p>
					<p className="mb-2 text-center text-3xl tracking-widest" title="সর্বশেষ দান">
						{diceFace(shownDice[0])}
						{diceFace(shownDice[1])}
						<span className="ml-1 align-middle text-sm text-slate-500">= {shownDice[0] + shownDice[1]}</span>
					</p>
					{allSold ? (
						<p className="mb-2 rounded-xl border border-emerald-600/20 bg-emerald-50 px-3 py-1.5 text-center text-xs font-medium text-emerald-900">
							✅ সব সম্পত্তি বিক্রি — বাড়ি তৈরি করা যাবে!
						</p>
					) : (
						<button
							className="mb-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-center text-xs text-slate-600 transition hover:border-emerald-600/50 hover:bg-emerald-50/50 active:scale-[0.99]"
							title="কোন সম্পত্তিগুলো এখনও অবিক্রীত — দেখতে ট্যাপ করুন"
							onClick={() => setShowUnsold(true)}
						>
							🏘️ অবিক্রীত <b className="text-slate-900">{unsoldCount}টি</b> — তালিকা দেখুন
						</button>
					)}
					<UnsoldModal
						open={showUnsold}
						onclose={() => setShowUnsold(false)}
						onselect={(id) => onselecttile?.(id)}
					/>
				</>
			)}
			{!gs ? (
				<p className="text-sm text-slate-500">ঘরে যোগ দিন।</p>
			) : gs.status === 'LOBBY' ? (
				isHost ? (
					<>
						<RoomSettings
							startCash={lobbyStartCash}
							goSalary={lobbyGoSalary}
							extremeMode={lobbyExtreme}
							editable={true}
							onchange={pushSettings}
						/>
						<div className="mt-2">
							<ClickSpark sparkColor="#d97706" sparkCount={10} sparkRadius={24}>
								<button
									className="w-full rounded-xl bg-amber-500 px-4 py-2.5 font-bold text-white transition hover:bg-amber-400 active:scale-95"
									onClick={() => send('START_GAME')}
								>
									🚀 খেলা শুরু করুন
								</button>
							</ClickSpark>
						</div>
						<p className="mt-2 text-center text-xs text-slate-500">সবাই তৈরি? বাজি ধরার সময় এসেছে!</p>
					</>
				) : (
					<>
						<RoomSettings
							startCash={serverSettings?.startCash ?? 1500}
							goSalary={serverSettings?.goSalary ?? 200}
							extremeMode={serverSettings?.extremeMode ?? false}
							editable={false}
						/>
						<p className="anim-glow-drift mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-sm text-slate-600">
							হোস্ট খেলা শুরু করার অপেক্ষায়… ☕
						</p>
					</>
				)
			) : gs.status === 'FINISHED' ? (
				(() => {
					const winner = gs.players.find((p) => p.id === gs?.winnerId);
					return (
						<div className="text-center">
							<p className="anim-trophy text-5xl">🏆</p>
							<p className="mt-1 text-2xl font-bold text-amber-600">{winner?.name ?? '—'}</p>
							<p className="text-sm text-slate-600">মহাজনি চ্যাম্পিয়ন! 🎉</p>
						</div>
					);
				})()
			) : canRoll ? (
				me?.inJail ? (
					<div className="rounded-xl border border-slate-300 bg-slate-50 p-2">
						<p className="mb-2 text-center text-sm font-semibold text-slate-700">
							🔒 জেলে আছেন ({(me?.jailTurns ?? 0) + 1}/3) — জোড়া ফেলুন, জরিমানা দিন, বা কার্ড ব্যবহার
							করুন।
						</p>
						<div className="flex flex-col gap-2">
							<button
								className="w-full rounded-xl bg-amber-600 px-4 py-2.5 font-bold text-white transition hover:bg-amber-500 active:scale-95"
								onClick={() => send('PAY_JAIL_FINE', {})}
							>
								🔓 ৳100 জরিমানা দিয়ে বের হোন
							</button>
							<button
								className="w-full rounded-xl bg-purple-600 px-4 py-2.5 font-bold text-white transition hover:bg-purple-500 active:scale-95 disabled:opacity-50"
								disabled={jailCards <= 0}
								onClick={() => send('USE_JAIL_CARD', {})}
							>
								🃏 মুক্তির কার্ড ব্যবহার করুন ({jailCards}টি)
							</button>
						</div>
						<p className="mt-2 text-center text-xs text-slate-500">
							অথবা বোর্ডের মাঝখানে 🎲 চাপুন — জোড়া পড়লে ফ্রি মুক্তি!
						</p>
					</div>
				) : (
					<p className="anim-glow-drift rounded-xl border border-emerald-600/20 bg-emerald-50 px-3 py-2.5 text-center text-sm font-medium text-emerald-900">
						বোর্ডের মাঝখানে 🎲 চাপুন!
					</p>
				)
			) : canAct ? (
				<>
					{me?.inJail && (
						<p className="mb-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
							🔒 জেলে আছেন — জোড়া ফেলে মুক্ত হোন অথবা দান শেষ করুন।
						</p>
					)}
					<div className="flex flex-col gap-2">
						{buyLocked ? (
							<p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs text-slate-500">
								🔒 বোর্ডের প্রথম রাউন্ড শেষ করুন (GO পার হোন) — তারপর সম্পত্তি কেনা যাবে।
							</p>
						) : (
							<button
								className="rounded-xl bg-emerald-600 px-4 py-2.5 font-bold text-white transition hover:bg-emerald-500 active:scale-95"
								onClick={() => send('BUY_PROPERTY', { tileId: me?.position ?? 0 })}
							>
								💰 সম্পত্তি কিনুন
							</button>
						)}
						{!allSold ? (
							<p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs text-slate-500">
								সব সম্পত্তি বিক্রি হলে বাড়ি/হোটেল তৈরি করা যাবে ({unsoldCount}টি বাকি)।
							</p>
						) : myBuildable.length === 0 ? (
							<p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs text-slate-500">
								নিজের কোনো জমিতে জায়গা খালি নেই — সবগুলোতে হোটেল হয়ে গেছে!
							</p>
						) : (
							<div className="rounded-xl border border-purple-300 bg-purple-50 p-2">
								<p className="mb-1 text-xs font-medium text-purple-800">
									🏠 বাড়ি → হোটেল (গ্রুপে সমানভাবে বণ্টন হয়)
								</p>
								<select
									className="mb-2 w-full rounded-lg border border-purple-300 bg-white px-2 py-1.5 text-sm text-slate-900"
									value={buildTileId ?? ''}
									onChange={(e) => setBuildTileId(e.target.value === '' ? null : Number(e.target.value))}
								>
									{myBuildable.map((t) => (
										<option key={t.id} value={t.id}>
											{t.nameBn} · {levelLabel(t.houses)} · ৳{t.houseCost}
										</option>
									))}
								</select>
								{buildGroup.length > 1 && (
									<p className="mb-2 text-[11px] leading-relaxed text-purple-900/80">
										{buildTile?.group} গ্রুপ:{' '}
										{buildGroup.map((t) => `${t.nameBn} ${levelLabel(t.houses)}`).join(' · ')}
									</p>
								)}
								<div className="mb-2 flex items-center gap-2">
									<span className="text-xs font-medium text-purple-800">পরিমাণ:</span>
									<div className="flex items-center rounded-lg border border-purple-300 bg-white">
										<button
											className="px-2.5 py-1 text-base font-bold text-purple-700 transition hover:bg-purple-100 active:scale-95 disabled:opacity-40"
											disabled={building || buildCapped <= 1}
											onClick={() => setBuildCount(Math.max(1, buildCapped - 1))}
											aria-label="কমান"
										>
											−
										</button>
										<span className="min-w-8 text-center text-sm font-bold text-slate-900">
											{buildCapped}
										</span>
										<button
											className="px-2.5 py-1 text-base font-bold text-purple-700 transition hover:bg-purple-100 active:scale-95 disabled:opacity-40"
											disabled={building || buildCapped >= Math.max(1, groupHeadroom)}
											onClick={() =>
												setBuildCount(Math.min(Math.max(1, groupHeadroom), buildCapped + 1))
											}
											aria-label="বাড়ান"
										>
											+
										</button>
									</div>
									<div className="flex gap-1">
										{[1, 3, 5].map((q) => (
											<button
												key={q}
												className={`rounded-lg border px-2 py-1 text-xs font-bold transition active:scale-95 disabled:opacity-40 ${
													buildCapped === Math.min(q, Math.max(1, groupHeadroom))
														? 'border-purple-600 bg-purple-600 text-white'
														: 'border-purple-300 bg-white text-purple-700 hover:bg-purple-100'
												}`}
												disabled={building || q > Math.max(1, groupHeadroom)}
												onClick={() => setBuildCount(Math.min(q, Math.max(1, groupHeadroom)))}
											>
												×{q}
											</button>
										))}
										<button
											className={`rounded-lg border px-2 py-1 text-xs font-bold transition active:scale-95 disabled:opacity-40 ${
												buildCapped === Math.max(1, groupHeadroom)
													? 'border-purple-600 bg-purple-600 text-white'
													: 'border-purple-300 bg-white text-purple-700 hover:bg-purple-100'
											}`}
											disabled={building || groupHeadroom < 1}
											onClick={() => setBuildCount(Math.max(1, groupHeadroom))}
											title="গ্রুপের সব খালি ধাপ একবারে"
										>
											MAX
										</button>
									</div>
								</div>
								<button
									className="w-full rounded-xl bg-purple-600 px-4 py-2 font-bold text-white transition hover:bg-purple-500 active:scale-95 disabled:opacity-50"
									disabled={building || buildTileId == null || buildPreview.levels === 0}
									onClick={buildMany}
								>
									{building ? (
										<>
											<span className="inline-block animate-spin align-middle">⏳</span> তৈরি হচ্ছে…
										</>
									) : buildCapped > 1 ? (
										<>
											{buildPreview.levels}টি ধাপ তৈরি করুন (৳{buildPreview.cost}){previewShort}
										</>
									) : (
										<>
											{buildLabel || 'বাড়ি তৈরি করুন'} {buildTile ? `(৳${buildTile.houseCost})` : ''}
										</>
									)}
								</button>
								{lastError && (
									<p className="mt-1 text-center text-[11px] font-medium text-red-600">{lastError}</p>
								)}
							</div>
						)}
						<button
							className="rounded-xl bg-amber-600 px-4 py-2.5 font-bold text-white transition hover:bg-amber-500 active:scale-95"
							onClick={() => send('END_TURN')}
						>
							দান শেষ করুন ⏭️
						</button>
					</div>
				</>
			) : canEndTurn ? (
				<>
					{me?.inJail && (
						<p className="mb-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
							🔒 জেলে আছেন ({me.jailTurns + 1}/3) — পরের চালে জোড়া ফেলার চেষ্টা করুন।
						</p>
					)}
					<button
						className="w-full rounded-xl bg-amber-600 px-4 py-2.5 font-bold text-white transition hover:bg-amber-500 active:scale-95"
						onClick={() => send('END_TURN')}
					>
						দান শেষ করুন ⏭️
					</button>
				</>
			) : (
				<p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-sm text-slate-600">
					<span className="font-semibold text-amber-700">{currentPlayer?.name ?? '—'}</span>
					এর চাল চলছে… 👀
				</p>
			)}
		</div>
	);
}
