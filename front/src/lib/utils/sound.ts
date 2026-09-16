// Tiny synthesized game sounds — Web Audio API, zero assets.
// Dice roll: rapid rattling clicks. Jail: descending "caught!" sting.
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
	} catch {
		/* ignore */
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

/** Rattling dice: 6 quick clicks of rising-then-random pitch + final thud. */
export function playDiceRoll(): void {
	const c = ac();
	if (!c) return;
	const t0 = c.currentTime + 0.01;
	for (let i = 0; i < 6; i++) {
		blip(c, t0 + i * 0.055, 700 + Math.random() * 900, 0.05, 'square', 0.08);
	}
	blip(c, t0 + 6 * 0.055, 220, 0.12, 'triangle', 0.16);
}

/** Jail sting: descending minor-second "caught!" wail + low clang. */
export function playJail(): void {
	const c = ac();
	if (!c) return;
	const t0 = c.currentTime + 0.01;
	blip(c, t0, 392, 0.22, 'sawtooth', 0.1);
	blip(c, t0 + 0.22, 370, 0.22, 'sawtooth', 0.1);
	blip(c, t0 + 0.44, 311, 0.4, 'sawtooth', 0.12);
	blip(c, t0 + 0.44, 98, 0.5, 'triangle', 0.18);
}
