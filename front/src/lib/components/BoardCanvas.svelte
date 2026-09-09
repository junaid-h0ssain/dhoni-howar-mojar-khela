<script lang="ts">
	import { onMount } from 'svelte';
	import { gameStore } from '$lib/stores/gameStore.svelte';
	import { TILE_MAP } from '$lib/constants/tiles';
	import { GROUP_COLORS } from '$lib/constants/boardData';
	import { BOARD_SIZE, tileRect } from '$lib/utils/canvasRenderer';
	import { tileIcon } from '$lib/utils/tileIcons';
	import { diceFace } from '$lib/utils/dice';

	let { onselect }: { onselect?: (id: number) => void } = $props();

	let canvas: HTMLCanvasElement;

	const FONT_FAMILY = '"Hind Siliguri", sans-serif';

	/** Largest font size (down from base) that fits text into maxWidth. */
	function fitFont(
		ctx: CanvasRenderingContext2D,
		text: string,
		base: number,
		maxWidth: number,
		weight = ''
	): number {
		let size = base;
		const prefix = weight ? weight + ' ' : '';
		ctx.font = `${prefix}${size}px ${FONT_FAMILY}`;
		while (size > 9 && ctx.measureText(text).width > maxWidth) {
			size -= 1;
			ctx.font = `${prefix}${size}px ${FONT_FAMILY}`;
		}
		return size;
	}

	function draw() {
		const ctx = canvas?.getContext('2d');
		if (!ctx || !canvas) return;
		const dpr = window.devicePixelRatio || 1;
		canvas.width = BOARD_SIZE * dpr;
		canvas.height = BOARD_SIZE * dpr;
		ctx.scale(dpr, dpr);

		ctx.fillStyle = '#f8fafc';
		ctx.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);

		const tiles = gameStore.gameState?.tiles ?? TILE_MAP;
		const ownerColor = new Map(
			(gameStore.gameState?.players ?? []).map((p) => [p.id, p.tokenColor])
		);
		ctx.textAlign = 'center';
		for (let id = 0; id < 40; id++) {
			const t = tiles[id];
			if (!t) continue;
			const r = tileRect(id);
			ctx.fillStyle = '#ffffff';
			ctx.strokeStyle = '#cbd5e1';
			ctx.lineWidth = 1;
			ctx.fillRect(r.x, r.y, r.w, r.h);
			ctx.strokeRect(r.x, r.y, r.w, r.h);
			if (t.group && GROUP_COLORS[t.group]) {
				ctx.fillStyle = GROUP_COLORS[t.group];
				ctx.fillRect(r.x, r.y, r.w, Math.min(14, r.h / 4));
			}
			// Ownership: inner border in the owner's token color.
			const oColor = (t.ownerId && ownerColor.get(t.ownerId)) || null;
			if (oColor) {
				ctx.strokeStyle = oColor;
				ctx.lineWidth = 3;
				ctx.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
			}
			ctx.fillStyle = '#0f172a';
			const cx = r.x + r.w / 2;
			const cy = r.y + r.h / 2;
			const icon = tileIcon(t);
			const nameSize = fitFont(ctx, t.nameBn, 16, r.w - 8);
			const iconY = cy - nameSize / 2 - 16;
			if (icon) {
				ctx.font = '22px sans-serif';
				ctx.fillText(icon, cx, iconY);
			}
			ctx.font = `${nameSize}px ${FONT_FAMILY}`;
			ctx.fillText(t.nameBn, cx, cy + nameSize / 2 - 2, r.w - 6);
			if (t.price) {
				fitFont(ctx, `৳${t.price}`, 13, r.w - 8);
				ctx.fillStyle = '#475569';
				ctx.fillText(`৳${t.price}`, cx, cy + nameSize / 2 + 13);
			}
			// Houses 1–4: green pips; 5 (hotel): red block.
			if (t.houses > 0 && t.houses < 5) {
				const s = 7;
				const gap = 2;
				const total = t.houses * s + (t.houses - 1) * gap;
				let hx = cx - total / 2;
				const hy = r.y + r.h - 12;
				ctx.fillStyle = '#16a34a';
				for (let h = 0; h < t.houses; h++) {
					ctx.fillRect(hx, hy, s, s);
					hx += s + gap;
				}
			} else if (t.houses >= 5) {
				const hw = 22;
				const hy = r.y + r.h - 13;
				ctx.fillStyle = '#dc2626';
				ctx.fillRect(cx - hw / 2, hy, hw, 9);
				ctx.strokeStyle = '#fbbf24';
				ctx.lineWidth = 1.5;
				ctx.strokeRect(cx - hw / 2, hy, hw, 9);
			}
		}

		// Player tokens (Task 4 adds lerp animation; Task 1 draws statically).
		const players = gameStore.gameState?.players ?? [];
		players.forEach((p, i) => {
			const t = tiles[p.position];
			if (!t) return;
			const r = tileRect(p.position);
			const cx = r.x + r.w / 2 + ((i % 2) - 0.5) * 18;
			const cy = r.y + r.h / 2 + (Math.floor(i / 2) - 0.5) * 14 + 8;
			ctx.beginPath();
			ctx.arc(cx, cy, 8, 0, Math.PI * 2);
			ctx.fillStyle = p.tokenColor;
			ctx.fill();
			ctx.strokeStyle = '#fff';
			ctx.lineWidth = 2;
			ctx.stroke();
		});

		// Center artwork + whose turn it is.
		const gs = gameStore.gameState;
		const roller = gs?.players.find((p) => p.id === gs.currentTurnPlayerId);
		const winner =
			gs?.status === 'FINISHED'
				? gs.players.find((p) => p.id === gs.winnerId)
				: undefined;
		const centerX = BOARD_SIZE / 2;
		const centerY = BOARD_SIZE / 2;
		ctx.textAlign = 'center';
		ctx.fillStyle = '#0f172a';
		ctx.font = `bold 40px ${FONT_FAMILY}`;
		ctx.fillText('মহাজনি', centerX, centerY - 72);
		if (winner) {
			ctx.font = `bold 52px ${FONT_FAMILY}`;
			ctx.fillStyle = winner.tokenColor;
			ctx.fillText(winner.name, centerX, centerY - 8, 440);
			ctx.font = `20px ${FONT_FAMILY}`;
			ctx.fillStyle = '#64748b';
			ctx.fillText('🏆 বিজয়ী!', centerX, centerY + 28);
		} else if (roller && gs?.status === 'IN_GAME') {
			ctx.font = `bold 52px ${FONT_FAMILY}`;
			ctx.fillStyle = roller.tokenColor;
			ctx.fillText(roller.name, centerX, centerY - 8, 440);
			ctx.font = `20px ${FONT_FAMILY}`;
			ctx.fillStyle = '#64748b';
			const [d1, d2] = gs.dice;
			ctx.fillText(
				`এর চাল চলছে · ${diceFace(d1)}${diceFace(d2)}`,
				centerX,
				centerY + 28
			);
		} else {
			ctx.font = `20px ${FONT_FAMILY}`;
			ctx.fillStyle = '#64748b';
			ctx.fillText('খেলার অপেক্ষায়…', centerX, centerY + 28);
		}
		// Recent events, one per line, so the game is easy to follow.
		const recent = (gs?.logs ?? []).slice(-3);
			recent.forEach((line, i) => {
				fitFont(ctx, line, 20, 440);
				ctx.fillStyle = i === recent.length - 1 ? '#334155' : '#94a3b8';
				ctx.fillText(line, centerX, centerY + 58 + i * 28);
			});
	}

	onMount(() => {
		// Wait for Bangla font before first render (§16).
		const render = () => draw();
		if (document.fonts?.ready) {
			document.fonts.ready.then(render).catch(render);
		} else {
			render();
		}
	});

	$effect(() => {
		// Re-draw whenever authoritative state changes.
		void gameStore.gameState;
		if (canvas) draw();
	});

	function handleClick(ev: MouseEvent) {
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		const x = (ev.clientX - rect.left) * (BOARD_SIZE / rect.width);
		const y = (ev.clientY - rect.top) * (BOARD_SIZE / rect.height);
		for (let id = 0; id < 40; id++) {
			const r = tileRect(id);
			if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
				onselect?.(id);
				break;
			}
		}
	}
</script>

<canvas
	bind:this={canvas}
	style="width: 100%; max-width: 800px; aspect-ratio: 1;"
	class="mx-auto cursor-pointer rounded-2xl shadow-lg"
	onclick={handleClick}
></canvas>
