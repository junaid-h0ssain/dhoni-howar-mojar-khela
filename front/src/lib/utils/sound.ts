// Game sounds — mp3 assets in static/sounds (served at /sounds/*) played
// through a single shared Web Audio context from pre-decoded buffers.
// Why buffers and not HTMLAudioElement: every `new Audio()` allocates a
// media element + decode pipeline, and browsers cap concurrent players.
// After enough plays the pool saturates and play() goes permanently silent.
// A decoded AudioBuffer + one-shot BufferSource per hit is cheap, overlaps
// freely, and is GC'd automatically after it ends. The oscillator synth is
// the offline fallback when a file can't be fetched/decoded.
const MUTE_KEY = 'mahajoni.muted';

let actx: AudioContext | null = null;
let muted = false;

try {
	muted = localStorage.getItem(MUTE_KEY) === '1';
} catch {
	/* ignore */
}

export function isMuted(): boolean {
	return muted;
}

export function setMuted(m: boolean): void {
	muted = m;
	try {
		localStorage.setItem(MUTE_KEY, m ? '1' : '0');
	} catch {
		/* ignore */
	}
}

/** Shared context: created lazily, resumed on every access (cheap). */
function ac(): AudioContext | null {
	if (muted) return null;
	try {
		if (typeof window === 'undefined') return null;
		if (!actx) {
			const AC =
				window.AudioContext ??
				(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
			actx = new AC();
		}
		if (actx.state === 'closed') {
			// Dead context (discarded output device, etc.): resume() can
			// never revive it, so drop it and start a fresh one instead of
			// scheduling hits on a corpse forever.
			try {
				void actx.close();
			} catch {
				/* ignore */
			}
			actx = null;
			return ac();
		}
		// Auto-suspends when the tab is backgrounded; resume is a no-op
		// when already running, so call it unconditionally.
		if (actx.state === 'suspended') void actx.resume();
		return actx;
	} catch {
		return null;
	}
}

// --- Pre-decoded sample cache ---

const SAMPLES = [
	'/sounds/dice.mp3',
	'/sounds/double-6.mp3',
	'/sounds/hotel+houses.mp3',
	'/sounds/jail.mp3',
	'/sounds/buy-property.mp3',
	'/sounds/bankruptcy.mp3',
	'/sounds/chat.mp3',
	'/sounds/income-tax.mp3',
	'/sounds/luxury-tax.mp3'
] as const;

type Sample = (typeof SAMPLES)[number];

const decoded = new Map<string, AudioBuffer>();
const inflight = new Map<string, Promise<AudioBuffer | null>>();

function loadSample(c: AudioContext, src: Sample): Promise<AudioBuffer | null> {
	const hit = decoded.get(src);
	if (hit) return Promise.resolve(hit);
	const ongoing = inflight.get(src);
	if (ongoing) return ongoing;
	const p = (async (): Promise<AudioBuffer | null> => {
		try {
			const res = await fetch(src);
			if (!res.ok) return null;
			const raw = await res.arrayBuffer();
			const buf = await c.decodeAudioData(raw);
			decoded.set(src, buf);
			return buf;
		} catch {
			return null;
		}
	})();
	inflight.set(src, p);
	void p.finally(() => {
		if (inflight.get(src) === p) inflight.delete(src);
	});
	return p;
}

function preloadSamples(): void {
	const c = ac();
	if (!c) return;
	for (const src of SAMPLES) void loadSample(c, src);
}

/** Call from a user gesture so the browser unlocks audio. */
export function unlockAudio(): void {
	try {
		preloadSamples();
	} catch {
		/* ignore */
	}
}

function strike(c: AudioContext, buf: AudioBuffer, vol: number): void {
	try {
		const src = c.createBufferSource();
		src.buffer = buf;
		const gain = c.createGain();
		gain.gain.value = vol;
		src.connect(gain).connect(c.destination);
		src.start();
	} catch {
		/* ignore — a failed hit is silent, never fatal */
	}
}

/**
 * Play a bundled sample. Synchronous fire-and-forget: cache hit plays
 * instantly; first-ever hit decodes in the background and plays on arrival;
 * decode failure runs the synth fallback so no trigger is ever silent.
 */
function playSample(src: Sample, vol: number, fallback: () => void): void {
	if (muted) return;
	const c = ac();
	if (!c) return;
	const buf = decoded.get(src);
	if (buf) {
		strike(c, buf, vol);
		return;
	}
	void loadSample(c, src).then((b) => {
		if (muted) return;
		// Re-resolve: the context may have been replaced while decoding.
		const live = ac() ?? c;
		if (b) strike(live, b, vol);
		else fallback();
	});
}

function blip(
	c: AudioContext,
	at: number,
	freq: number,
	dur: number,
	type: OscillatorType = 'square',
	vol = 0.12
): void {
	try {
		const osc = c.createOscillator();
		const gain = c.createGain();
		osc.type = type;
		osc.frequency.setValueAtTime(freq, at);
		gain.gain.setValueAtTime(vol, at);
		gain.gain.exponentialRampToValueAtTime(0.001, at + dur);
		osc.connect(gain).connect(c.destination);
		osc.start(at);
		osc.stop(at + dur + 0.02);
	} catch {
		/* ignore */
	}
}

function synthDice(c: AudioContext): void {
	const t0 = c.currentTime + 0.01;
	for (let i = 0; i < 6; i++) {
		blip(c, t0 + i * 0.055, 700 + Math.random() * 900, 0.05, 'square', 0.08);
	}
	blip(c, t0 + 6 * 0.055, 220, 0.12, 'triangle', 0.16);
}

function synthDouble(c: AudioContext): void {
	const t0 = c.currentTime + 0.01;
	blip(c, t0, 523, 0.1, 'triangle', 0.14);
	blip(c, t0 + 0.1, 659, 0.1, 'triangle', 0.14);
	blip(c, t0 + 0.2, 784, 0.18, 'triangle', 0.16);
}

function synthBuild(c: AudioContext): void {
	const t0 = c.currentTime + 0.01;
	blip(c, t0, 660, 0.09, 'triangle', 0.14);
	blip(c, t0 + 0.09, 990, 0.14, 'triangle', 0.14);
}

function synthJail(c: AudioContext): void {
	const t0 = c.currentTime + 0.01;
	blip(c, t0, 392, 0.22, 'sawtooth', 0.1);
	blip(c, t0 + 0.22, 370, 0.22, 'sawtooth', 0.1);
	blip(c, t0 + 0.44, 311, 0.4, 'sawtooth', 0.12);
	blip(c, t0 + 0.44, 98, 0.5, 'triangle', 0.18);
}

function synthBuy(c: AudioContext): void {
	const t0 = c.currentTime + 0.01;
	blip(c, t0, 880, 0.09, 'triangle', 0.14);
	blip(c, t0 + 0.09, 1320, 0.16, 'triangle', 0.14);
}

function synthBankrupt(c: AudioContext): void {
	const t0 = c.currentTime + 0.01;
	blip(c, t0, 330, 0.2, 'sawtooth', 0.1);
	blip(c, t0 + 0.2, 262, 0.2, 'sawtooth', 0.1);
	blip(c, t0 + 0.4, 196, 0.45, 'sawtooth', 0.12);
}

function synthJailRelease(c: AudioContext): void {
	const t0 = c.currentTime + 0.01;
	blip(c, t0, 311, 0.12, 'triangle', 0.14);
	blip(c, t0 + 0.12, 392, 0.12, 'triangle', 0.14);
	blip(c, t0 + 0.24, 523, 0.2, 'triangle', 0.16);
}

function synthChat(c: AudioContext): void {
	const t0 = c.currentTime + 0.01;
	blip(c, t0, 990, 0.08, 'sine', 0.14);
	blip(c, t0 + 0.09, 1320, 0.12, 'sine', 0.14);
}

function synthIncomeTax(c: AudioContext): void {
	const t0 = c.currentTime + 0.01;
	blip(c, t0, 520, 0.12, 'triangle', 0.14);
	blip(c, t0 + 0.12, 390, 0.18, 'triangle', 0.14);
}

function synthLuxuryTax(c: AudioContext): void {
	const t0 = c.currentTime + 0.01;
	blip(c, t0, 660, 0.1, 'triangle', 0.14);
	blip(c, t0 + 0.1, 495, 0.1, 'triangle', 0.14);
	blip(c, t0 + 0.2, 330, 0.2, 'triangle', 0.14);
}

function withSynth(fn: (c: AudioContext) => void): () => void {
	return () => {
		const c = ac();
		if (c) fn(c);
	};
}

/** Rattling dice: file, else 6 quick synth clicks + final thud. */
export function playDiceRoll(): void {
	playSample('/sounds/dice.mp3', 0.6, withSynth(synthDice));
}

/** Double-six fanfare: file, else a bright ascending synth arpeggio. */
export function playDouble(): void {
	playSample('/sounds/double-6.mp3', 0.65, withSynth(synthDouble));
}

/** House/hotel cha-ching: file, else a bright two-tone synth blip. */
export function playBuild(): void {
	playSample('/sounds/hotel+houses.mp3', 0.6, withSynth(synthBuild));
}

/** Jail sting: file, else descending "caught!" wail + low clang. */
export function playJail(): void {
	playSample('/sounds/jail.mp3', 0.65, withSynth(synthJail));
}

/** Property purchase stamp: file, else a bright cash-register blip. */
export function playBuy(): void {
	playSample('/sounds/buy-property.mp3', 0.6, withSynth(synthBuy));
}

/** Bankruptcy crash: file, else a descending sad-trombone synth. */
export function playBankrupt(): void {
	playSample('/sounds/bankruptcy.mp3', 0.65, withSynth(synthBankrupt));
}

/** Jail release: synth-only ascending "unlocked!" arpeggio (no sample file). */
export function playJailRelease(): void {
	if (muted) return;
	const c = ac();
	if (!c) return;
	synthJailRelease(c);
}

/** Chat message ping: file, else a soft two-tone sine blip. */
export function playChat(): void {
	playSample('/sounds/chat.mp3', 0.55, withSynth(synthChat));
}

/** Income tax bill: file, else a descending two-tone synth. */
export function playIncomeTax(): void {
	playSample('/sounds/income-tax.mp3', 0.6, withSynth(synthIncomeTax));
}

/** Luxury tax bill: file, else a descending three-tone synth. */
export function playLuxuryTax(): void {
	playSample('/sounds/luxury-tax.mp3', 0.6, withSynth(synthLuxuryTax));
}
