// Action GIFs — gif assets in static/gifs (served at /gifs/*) shown as a
// center overlay for big game moments. Triggered from the same fresh-log
// watcher as sounds in +page.svelte, so no server changes are needed.
//
// Only high-signal events get GIFs: plain dice rolls happen every turn and
// would spam the overlay, so they stay sound-only. Priority order decides
// which single GIF wins when several match in one poll batch.
export interface ActionGif {
	src: string;
	caption: string;
}

// Highest priority first.
const RULES: Array<{ match: (logs: string[]) => string | undefined; gif: ActionGif }> = [
	{
		match: (logs) => logs.find((l) => l.includes('দেউলিয়া')),
		gif: { src: '/gifs/bankruptcy.gif', caption: 'দেউলিয়া! 💸' }
	},
	{
		match: (logs) => logs.find((l) => l.includes('জেলে গেছেন')),
		gif: { src: '/gifs/jail.gif', caption: 'জেল! 🔒' }
	},
	{
		match: (logs) => logs.find((l) => l.includes('জোড়া পেয়েছেন')),
		gif: { src: '/gifs/dice-6.gif', caption: 'জোড়া ছক্কা! 🎲' }
	}
];

/** Pick the single GIF to show for a batch of fresh log entries. */
export function gifForLogs(fresh: string[]): ActionGif | null {
	if (fresh.length === 0) return null;
	for (const rule of RULES) {
		if (rule.match(fresh)) return rule.gif;
	}
	return null;
}

/** Warm the browser cache so the first trigger isn't blank. */
export function preloadGifs(): void {
	try {
		if (typeof window === 'undefined') return;
		for (const src of [
			'/gifs/bankruptcy.gif',
			'/gifs/dice-6.gif',
			'/gifs/jail.gif'
		]) {
			const img = new Image();
			img.src = src;
		}
	} catch {
		/* ignore */
	}
}
