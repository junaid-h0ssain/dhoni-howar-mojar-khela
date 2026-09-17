'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Lobby from '@/lib/components/Lobby';
import BoardCanvas from '@/lib/components/BoardCanvas';
import ActionPanel from '@/lib/components/ActionPanel';
import CardDecks from '@/lib/components/CardDecks';
import PlayerList from '@/lib/components/PlayerList';
import PropertyModal from '@/lib/components/PropertyModal';
import PlayerModal from '@/lib/components/PlayerModal';
import SoldOutModal from '@/lib/components/SoldOutModal';
import ClickSpark from '@/lib/components/bits/ClickSpark';
import { useGameStore } from '@/lib/stores/gameStore';
import {
	connect,
	hasSavedSession,
	leaveRoom,
	retryNow,
	getReconnectAttempts
} from '@/lib/utils/polling';
import {
	playDiceRoll,
	playDouble,
	playBuild,
	playJail,
	unlockAudio,
	isMuted,
	setMuted
} from '@/lib/utils/sound';

export default function Home() {
	const [selectedTile, setSelectedTile] = useState<number | null>(null);
	const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
	const [soldOutSeenFor, setSoldOutSeenFor] = useState<string | null>(null);
	const [soundMuted, setSoundMuted] = useState(
		() => typeof window !== 'undefined' && isMuted()
	);
	// Log watermark: only entries appended after we first see the state can
	// trigger sounds, so joining mid-game never blasts audio.
	const seenLogCount = useRef(-1);

	const gs = useGameStore((s) => s.gameState);
	const roomCode = useGameStore((s) => s.roomCode);
	const connection = useGameStore((s) => s.connection);

	function handleLeave() {
		setSelectedTile(null);
		setSelectedPlayer(null);
		leaveRoom();
	}

	useEffect(() => {
		// Reload / dropped connection: the store starts empty but the seat and
		// game live on the server for 24h — auto-RECONNECT to retain play state.
		if (!useGameStore.getState().gameState && hasSavedSession()) {
			connect({ resume: true });
		}
		// Browsers block audio until a gesture — unlock on first interaction.
		const unlock = () => unlockAudio();
		window.addEventListener('pointerdown', unlock, { once: true });
		window.addEventListener('keydown', unlock, { once: true });
		return () => {
			window.removeEventListener('pointerdown', unlock);
			window.removeEventListener('keydown', unlock);
		};
	}, []);

	function toggleMute() {
		const next = !soundMuted;
		setSoundMuted(next);
		setMuted(next);
		if (!next) playDiceRoll();
	}

	// Game sounds: react to newly appended authoritative log entries.
	// Dice ("পাশা ফেলেছেন") → rattle; double-six ("জোড়া পেয়েছেন") layers a
	// fanfare on top; builds ("বাড়ি/হোটেল/ধাপ তৈরি") → cha-ching; sent to
	// jail ("জেলে গেছেন") → sting. Build matching is deliberately specific:
	// "ঘর তৈরি করেছেন" (room creation) must NOT trigger the build sound.
	const logs = useMemo(
		() => [...(gs?.logs ?? [])].reverse().slice(0, 12),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[gs?.logs?.length]
	);

	useEffect(() => {
		const all = gs?.logs;
		if (!all) return;
		if (seenLogCount.current < 0) {
			seenLogCount.current = all.length;
			return;
		}
		if (all.length <= seenLogCount.current) return;
		const fresh = all.slice(seenLogCount.current);
		seenLogCount.current = all.length;
		if (fresh.some((l) => l.includes('পাশা ফেলেছেন'))) playDiceRoll();
		if (fresh.some((l) => l.includes('জোড়া পেয়েছেন'))) playDouble();
		if (
			fresh.some(
				(l) => l.includes('বাড়ি তৈরি') || l.includes('হোটেল তৈরি') || l.includes('ধাপ তৈরি')
			)
		) {
			playBuild();
		}
		if (fresh.some((l) => l.includes('জেলে গেছেন'))) playJail();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [gs?.logs?.length]);

	function copyRoomCode() {
		if (roomCode) navigator.clipboard?.writeText(roomCode).catch(() => {});
	}

	const inGame = !!gs || !!roomCode;
	// Pop for EVERY player when the board sells out: derived from the
	// authoritative GAME_STATE broadcast, so all clients see it together.
	const allSold = useMemo(
		() =>
			!!gs &&
			gs.status === 'IN_GAME' &&
			Object.values(gs.tiles ?? {}).every((t) =>
				t.type === 'PROPERTY' || t.type === 'UTILITY' || t.type === 'RAILROAD'
					? !!t.ownerId
					: true
			),
		[gs]
	);

	// Derived (not an effect): pops once per room when the board sells out,
	// until dismissed. A new room id re-arms it automatically.
	const showSoldOut = allSold && soldOutSeenFor !== (gs?.roomId ?? null);

	function dismissSoldOut() {
		setSoldOutSeenFor(gs?.roomId ?? soldOutSeenFor);
	}

	// Header title overrides mirror the board center: a jailed turn player
	// shows bright-red "JAIL!!!" until the turn passes; a freshly drawn card
	// shows the deck name, green for rewards and red for payments/punishments.
	const headerTurnPlayer =
		gs?.status === 'IN_GAME' ? gs.players.find((p) => p.id === gs?.currentTurnPlayerId) : undefined;
	const headerJailed = !!headerTurnPlayer?.inJail;
	const headerCard =
		!headerJailed && gs?.status === 'IN_GAME' && gs.lastCard ? gs.lastCard : undefined;
	const headerTitle = headerJailed
		? 'JAIL!!!'
		: headerCard
			? headerCard.deck === 'CHANCE'
				? 'ভাগ্য পরীক্ষা'
				: 'সুযোগ গ্রহণ'
			: 'ধনী হওয়ার মজার খেলা';
	const headerTitleClass =
		headerJailed || headerCard?.tone === 'bad'
			? 'text-red-600'
			: headerCard?.tone === 'good'
				? 'text-emerald-600'
				: 'text-emerald-950';
	const currentPlayer =
		gs?.players.find((p) => p.id === gs?.currentTurnPlayerId) ?? null;
	const reconnectAttempts = connection !== 'open' ? getReconnectAttempts() : 0;

	return (
		<>
			{/* Flat off-white backdrop */}
			<div className="pointer-events-none fixed inset-0 -z-10 bg-[#f7f4ec]"></div>

			<main className="min-h-screen p-4 text-slate-800">
				{!inGame ? (
					<div className="py-10">
						<Lobby />
					</div>
				) : (
					<>
						<header className="mx-auto mb-4 flex max-w-6xl flex-wrap items-center justify-between gap-3">
							<div>
								<h1 className={`text-2xl font-bold sm:text-3xl ${headerTitleClass}`}>{headerTitle}</h1>
								<p className="mt-0.5 text-xs text-emerald-800/70">
									{currentPlayer?.name ? `${currentPlayer.name} এর চাল চলছে…` : 'মহাজনি বাজারে স্বাগতম'}
								</p>
							</div>
							<div className="flex items-center gap-2">
								<button
									className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:bg-slate-100 active:scale-95"
									onClick={toggleMute}
									title={soundMuted ? 'সাউন্ড চালু করুন' : 'সাউন্ড বন্ধ করুন'}
								>
									{soundMuted ? '🔇 নীরব' : '🔊 সাউন্ড'}
								</button>
								{roomCode && (
									<button
										className="rounded-xl border border-amber-600/30 bg-amber-100 px-3 py-1.5 font-mono text-lg tracking-widest text-amber-900 transition hover:bg-amber-200 active:scale-95"
										onClick={copyRoomCode}
										title="কপি করুন"
									>
										{roomCode} ⧉
									</button>
								)}
								<span className="flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600">
									<span
										className={`inline-block h-2 w-2 rounded-full ${
											connection === 'open' ? 'anim-glow-drift bg-emerald-500' : 'bg-red-500'
										}`}
									></span>
									{connection === 'open' ? 'সংযুক্ত' : 'বিচ্ছিন্ন'}
								</span>
							</div>
							{connection !== 'open' && gs && (
								<div className="flex w-full flex-wrap items-center justify-center gap-2 rounded-xl border border-amber-600/30 bg-amber-100 px-3 py-2 text-center text-xs text-amber-900">
									<span>
										পুনরায় সংযোগ হচ্ছে… আপনার টাকা, জমি ও চাল সংরক্ষিত আছে।
										{reconnectAttempts > 0 && <>(চেষ্টা {reconnectAttempts})</>}
									</span>
									<button
										className="rounded-lg bg-amber-400 px-2.5 py-1 font-bold text-amber-950 transition hover:bg-amber-300 active:scale-95"
										onClick={() => retryNow()}
									>
										এখনই আবার চেষ্টা করুন
									</button>
								</div>
							)}
						</header>

						<div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[1fr_330px]">
							<div className="order-1">
								<div className="rounded-3xl border-2 border-emerald-700/25 bg-white p-1.5 shadow-[0_0_40px_-12px_rgba(4,120,87,0.35)]">
									<div className="overflow-hidden rounded-2xl">
										<ClickSpark sparkColor="#d97706" sparkCount={8} sparkRadius={28} duration={500}>
											<BoardCanvas onselect={(id) => setSelectedTile(id)} />
										</ClickSpark>
									</div>
								</div>
							</div>
							<div className="order-2 flex flex-col gap-4 lg:col-start-2 lg:row-span-2">
								<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
									<ActionPanel onselecttile={(id) => setSelectedTile(id)} />
								</section>
								<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
									<PlayerList onselect={(id) => setSelectedPlayer(id)} />
								</section>
								<CardDecks />
							</div>
							{gs && (
								<div className="order-3 lg:col-start-1">
									<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
										<h2 className="mb-2 text-sm font-semibold tracking-wide text-emerald-800">
											✨ খেলার লগ
										</h2>
										<ul className="max-h-36 space-y-1.5 overflow-y-auto text-sm">
											{logs.map((log, i) => (
												<li
													key={i + ':' + log}
													className={
														i === 0
															? 'anim-log-in rounded-lg border border-emerald-600/20 bg-emerald-50 px-2.5 py-1 text-emerald-900'
															: 'px-2.5 py-0.5 text-slate-500'
													}
												>
													{log}
												</li>
											))}
										</ul>
									</section>
								</div>
							)}
						</div>
						<footer className="mx-auto mt-4 max-w-6xl pb-6 text-center">
							<button
								className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-500 transition hover:border-slate-400 hover:text-slate-700"
								onClick={handleLeave}
								title="ঘর ছেড়ে লবিতে ফিরুন (আবার যোগ দিতে একই নাম ও রুম কোড লাগবে)"
							>
								ঘর ছেড়ে যান
							</button>
						</footer>
					</>
				)}

				<PropertyModal tileId={selectedTile} onclose={() => setSelectedTile(null)} />
				<PlayerModal playerId={selectedPlayer} onclose={() => setSelectedPlayer(null)} />
				<SoldOutModal open={showSoldOut} onclose={dismissSoldOut} />
			</main>
		</>
	);
}
