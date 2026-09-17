// Game sounds — file assets in static/sounds (served at /sounds/*) with the
// old Web Audio synth as offline fallback. Dice roll, double-6, build, jail.
const MUTE_KEY = 'mahajoni.muted';

let ctx: AudioContext | null = null;
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

function ac(): AudioContext | null {
	if (muted) return null;
	try {
		if (!ctx) {
			const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
			ctx = new AC();
		}
		if (ctx.state === 'suspended') void ctx.resume();
		return ctx;
	} catch {
		return null;
	}
}

/** Call from a user gesture so the browser unlocks audio. */
export function unlockAudio(): void {
	try {
		ac();
		preloadFiles();
	} catch {
		/* ignore */
	}
}

// --- File-based sounds (static/sounds/*) ---

const FILES = [
	'/sounds/dice.mp3',
	'/sounds/double-6.mp3',
	'/sounds/hotel-%26-houses.mp3',
	'/sounds/jail.mp3'
] as const;

const fileCache = new Map<string, HTMLAudioElement>();

function preloadFiles(): void {
	try {
		for (const src of FILES) {
			if (!fileCache.has(src)) {
				// Warm the browser cache only — never play these instances.
				const el = new Audio(src);
				el.preload = 'auto';
				el.load();
				fileCache.set(src, el);
			}
		}
	} catch {
		/* ignore — synth fallback covers it */
	}
}

/**
 * Play a bundled sound file. Always uses a fresh HTMLAudioElement so rapid
 * or overlapping sounds never rewind/interrupt each other. Reusing a single
 * cached element and resetting currentTime mid-playback stalls the media
 * pipeline — after a while play() silently stops producing sound.
 */
function playFile(src: (typeof FILES)[number], vol = 0.6): boolean {
	if (muted) return false;
	try {
		// Ensure the file is at least preloaded once for low latency.
		if (!fileCache.has(src)) {
			const warm = new Audio(src);
			warm.preload = 'auto';
			warm.load();
			fileCache.set(src, warm);
		}
		const el = new Audio(src);
		el.preload = 'auto';
		el.volume = vol;
		void el.play().catch(() => {
			/* autoplay-blocked or missing file — stay silent */
		});
		return true;
	} catch {
		return false;
	}
}

function blip(
	c: AudioContext,
	at: number,
	freq: number,
	dur: number,
	type: OscillatorType = 'square',
	vol = 0.12
): void {
	const osc = c.createOscillator();
	const gain = c.createGain();
	osc.type = type;
	osc.frequency.setValueAtTime(freq, at);
	gain.gain.setValueAtTime(vol, at);
	gain.gain.exponentialRampToValueAtTime(0.001, at + dur);
	osc.connect(gain).connect(c.destination);
	osc.start(at);
	osc.stop(at + dur + 0.02);
}

/** Rattling dice: file, else 6 quick synth clicks + final thud. */
export function playDiceRoll(): void {
	if (playFile('/sounds/dice.mp3', 0.6)) return;
	const c = ac();
	if (!c) return;
	const t0 = c.currentTime + 0.01;
	for (let i = 0; i < 6; i++) {
		blip(c, t0 + i * 0.055, 700 + Math.random() * 900, 0.05, 'square', 0.08);
	}
	blip(c, t0 + 6 * 0.055, 220, 0.12, 'triangle', 0.16);
}

/** Double-six fanfare: file, no synth equivalent (dice rattle already played). */
export function playDouble(): void {
	playFile('/sounds/double-6.mp3', 0.65);
}

/** House/hotel build cha-ching: file, else a bright two-tone synth blip. */
export function playBuild(): void {
	if (playFile('/sounds/hotel-%26-houses.mp3', 0.6)) return;
	const c = ac();
	if (!c) return;
	const t0 = c.currentTime + 0.01;
	blip(c, t0, 660, 0.09, 'triangle', 0.14);
	blip(c, t0 + 0.09, 990, 0.14, 'triangle', 0.14);
}

/** Jail sting: file, else descending minor-second "caught!" wail + low clang. */
export function playJail(): void {
	if (playFile('/sounds/jail.mp3', 0.65)) return;
	const c = ac();
	if (!c) return;
	const t0 = c.currentTime + 0.01;
	blip(c, t0, 392, 0.22, 'sawtooth', 0.1);
	blip(c, t0 + 0.22, 370, 0.22, 'sawtooth', 0.1);
	blip(c, t0 + 0.44, 311, 0.4, 'sawtooth', 0.12);
	blip(c, t0 + 0.44, 98, 0.5, 'triangle', 0.18);
}
