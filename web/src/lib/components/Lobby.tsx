'use client';

import { useEffect, useState } from 'react';
import { useGameStore } from '@/lib/stores/gameStore';
import SplitText from '@/lib/components/bits/SplitText';
import ClickSpark from '@/lib/components/bits/ClickSpark';
import RoomSettings from '@/lib/components/RoomSettings';
import {
	createRoom,
	joinRoomByCode,
	loadSavedSession,
	loadLastRoomId,
	reconnectSaved,
	clearSavedSession,
	savePlayerName,
	type SavedSession
} from '@/lib/utils/polling';

export default function Lobby() {
	const [playerName, setPlayerName] = useState('');
	const [roomCode, setRoomCode] = useState('');
	const [saved, setSaved] = useState<SavedSession | null>(null);
	const [busy, setBusy] = useState(false);
	// Room rules for the room we're about to create (host's choice).
	const [startCash, setStartCash] = useState(1500);
	const [goSalary, setGoSalary] = useState(200);
	const [extremeMode, setExtremeMode] = useState(false);
	const lastError = useGameStore((s) => s.lastError);

	useEffect(() => {
		const s = loadSavedSession();
		setSaved(s);
		if (s?.playerName) setPlayerName(s.playerName);
		// Seat expired but we remember the room: prefill for a quick rejoin.
		if (!s) {
			const last = loadLastRoomId();
			if (last) setRoomCode(last);
		} else {
			setRoomCode(s.roomId);
		}
	}, []);

	function refreshSaved() {
		setSaved(loadSavedSession());
	}

	async function createRoomHandler() {
		if (!playerName.trim() || busy) return;
		setBusy(true);
		try {
			savePlayerName(playerName.trim());
			clearSavedSession();
			savePlayerName(playerName.trim());
			await createRoom(playerName.trim(), { startCash, goSalary, extremeMode });
		} finally {
			setBusy(false);
		}
	}

	async function joinRoomHandler() {
		if (!playerName.trim() || !roomCode.trim() || busy) return;
		setBusy(true);
		try {
			savePlayerName(playerName.trim());
			clearSavedSession();
			savePlayerName(playerName.trim());
			await joinRoomByCode(roomCode.trim().toUpperCase(), playerName.trim());
		} finally {
			setBusy(false);
		}
	}

	async function rejoin() {
		const s = loadSavedSession();
		if (s?.playerName) setPlayerName(s.playerName);
		await reconnectSaved();
	}

	function forgetSession() {
		clearSavedSession();
		refreshSaved();
	}

	return (
		<div className="mx-auto max-w-md space-y-5">
			<div className="text-center">
				<p className="mb-2 inline-block rounded-full border border-amber-600/30 bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">
					🎲 বন্ধুদের সাথে অনলাইন মহাজনি 🎲
				</p>
				<SplitText
					text="ধনী হওয়ার মজার খেলা"
					tag="h1"
					splitType="chars"
					delay={45}
					duration={0.9}
					className="text-4xl font-bold text-emerald-950 sm:text-5xl"
				/>
				<div className="mt-2">
					<p className="text-sm text-emerald-800/80">
						চট্টগ্রামের অলিগলি কিনুন, বাড়ি তুলুন, বন্ধুদের ফকির বানান!
					</p>
				</div>
				<div className="mt-3 flex items-center justify-center gap-4 text-2xl" aria-hidden="true">
					<span className="anim-float-slow inline-block">🏠</span>
					<span className="anim-float-slow inline-block" style={{ animationDelay: '-1.5s' }}>
						🎲
					</span>
					<span className="anim-float-slow inline-block" style={{ animationDelay: '-3s' }}>
						💰
					</span>
				</div>
			</div>

			{saved && (
				<div className="anim-log-in rounded-2xl border border-amber-600/30 bg-amber-50 p-4">
					<p className="text-sm font-medium text-amber-900">
						আপনার আগের খেলা এখনও চলছে — ঘর {saved.roomId}
					</p>
					<p className="mt-0.5 text-xs text-amber-800/70">
						রিলোড বা সংযোগ বিচ্ছিন্ন হলেও আপনার টাকা, অবস্থান ও সম্পত্তি সংরক্ষিত আছে।
					</p>
					<div className="mt-2 flex gap-2">
						<button
							className="flex-1 rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-amber-950 transition hover:bg-amber-300 active:scale-95"
							onClick={rejoin}
						>
							আবার যোগ দিন ⚡
						</button>
						<button
							className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100"
							onClick={forgetSession}
							title="পুরনো সেশন মুছে নতুন করে শুরু করুন"
						>
							ভুলে যান
						</button>
					</div>
				</div>
			)}

			<div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
				<ClickSpark sparkColor="#059669" sparkCount={10} sparkRadius={24}>
					<div className="space-y-4">
						<label className="block">
							<span className="mb-1 block text-sm font-medium text-slate-700">আপনার নাম</span>
							<input
								className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
								value={playerName}
								onChange={(e) => setPlayerName(e.target.value)}
								placeholder="যেমন: ঝন্টু"
							/>
						</label>

						<RoomSettings
							startCash={startCash}
							goSalary={goSalary}
							extremeMode={extremeMode}
							editable={!busy}
							onchange={(v) => {
								setStartCash(v.startCash);
								setGoSalary(v.goSalary);
								setExtremeMode(v.extremeMode);
							}}
						/>

						<button
							className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 font-bold text-white transition hover:bg-emerald-500 active:scale-95 disabled:opacity-50"
							disabled={busy}
							onClick={createRoomHandler}
						>
							{busy ? '…' : '🏝️ ঘর তৈরি করুন'}
						</button>

						<div className="border-t border-slate-200 pt-4">
							<label className="block">
								<span className="mb-1 block text-sm font-medium text-slate-700">Room Code</span>
								<input
									className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-mono text-lg tracking-[0.3em] text-slate-900 uppercase outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
									value={roomCode}
									onChange={(e) => setRoomCode(e.target.value)}
									placeholder="1234"
									maxLength={4}
									inputMode="numeric"
									pattern="[0-9]*"
									autoComplete="one-time-code"
									enterKeyHint="go"
								/>
							</label>
							<button
								className="mt-2 w-full rounded-xl bg-blue-600 px-4 py-2.5 font-bold text-white transition hover:bg-blue-500 active:scale-95 disabled:opacity-50"
								disabled={busy}
								onClick={joinRoomHandler}
							>
								{busy ? '…' : 'ঘরে যোগ দিন 🚪'}
							</button>
							<p className="mt-2 text-center text-xs text-slate-500">
								খেলা শুরু হয়ে গেলেও Room Code দিয়ে মাঝখানে যোগ দেওয়া যাবে। একই নামে ঢুকলে আগের
								টাকা-জমি-চাল ফিরে পাবেন।
							</p>
						</div>

						{lastError && (
							<p className="anim-log-in rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
								{lastError}
							</p>
						)}
					</div>
				</ClickSpark>
			</div>

			<p className="text-center text-xs text-slate-500">
				ইঙ্গিত: ২–১০ জন মিলে খেলুন · পাশা সার্ভার থেকে আসে, চুরির সুযোগ নেই 😉
			</p>
		</div>
	);
}
