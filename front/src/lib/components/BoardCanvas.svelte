<script lang="ts">
	import { onMount } from 'svelte';
	import { gameStore } from '$lib/stores/gameStore.svelte';
	import { TILE_MAP } from '$lib/constants/tiles';
	import { GROUP_COLORS } from '$lib/constants/boardData';
	import { BOARD_SIZE, tileRect } from '$lib/utils/canvasRenderer';

	let canvas: HTMLCanvasElement;

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
				ctx.fillRect(r.x, r.y, r.w, Math.min(12, r.h / 4));
			}
			ctx.fillStyle = '#0f172a';
			ctx.font = '12px "Hind Siliguri", sans-serif';
			const cx = r.x + r.w / 2;
			ctx.fillText(t.nameBn, cx, r.y + r.h / 2, r.w - 6);
			if (t.price) {
				ctx.font = '10px "Hind Siliguri", sans-serif';
				ctx.fillStyle = '#475569';
				ctx.fillText(`৳${t.price}`, cx, r.y + r.h / 2 + 16);
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

		// Center artwork.
		ctx.fillStyle = '#0f172a';
		ctx.font = 'bold 48px "Hind Siliguri", sans-serif';
		ctx.fillText('মহাজনি', BOARD_SIZE / 2, BOARD_SIZE / 2 - 8);
		ctx.font = '16px "Hind Siliguri", sans-serif';
		ctx.fillStyle = '#64748b';
		ctx.fillText('MAHAJONI', BOARD_SIZE / 2, BOARD_SIZE / 2 + 24);
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
</script>

<canvas
	bind:this={canvas}
	style="width: 100%; max-width: 800px; aspect-ratio: 1;"
	class="mx-auto rounded-2xl shadow-lg"
></canvas>
