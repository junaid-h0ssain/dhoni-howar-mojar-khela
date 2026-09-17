'use client';

import { useEffect, useRef } from 'react';
import { useGameStore } from '@/lib/stores/gameStore';
import { TILE_MAP } from '@/lib/constants/tiles';
import { GROUP_COLORS } from '@/lib/constants/boardData';
import { BOARD_SIZE, tileRect } from '@/lib/utils/canvasRenderer';
import { tileIcon } from '@/lib/utils/tileIcons';
import { diceFace } from '@/lib/utils/dice';
import { send } from '@/lib/utils/polling';

const FONT_FAMILY = '"Noto Sans Bengali", sans-serif';

// ——— Token hop animation ———
// When a token changes tiles it hops forward tile-by-tile (one bounce per
// tile) instead of teleporting. Positions animate toward the authoritative
// state; a fresh update mid-hop retargets from the current tile.
const STEP_MS = 160;
const HOP_PX = 18;
interface Hop {
	from: number;
	to: number;
	start: number;
}

const TOKEN_SHAPES = [
	'circle',
	'square',
	'triangle',
	'diamond',
	'star',
	'hexagon',
	'pentagon',
	'plus',
	'ring',
	'shield'
];

function tokenShape(index: number): string {
	return TOKEN_SHAPES[index % TOKEN_SHAPES.length];
}

function tileCenter(id: number): { x: number; y: number } {
	const r = tileRect(((id % 40) + 40) % 40);
	return { x: r.x + r.w / 2, y: r.y + r.h / 2 + 8 };
}

/** Tile the hop has reached at `now` (whole steps only). */
function hopTile(h: Hop, now: number): number {
	const steps = (h.to - h.from + 40) % 40;
	const f = Math.min(Math.max((now - h.start) / STEP_MS, 0), steps);
	return (h.from + Math.floor(f)) % 40;
}

/** Interpolated pixel position with a parabolic bounce per tile. */
function hopXY(h: Hop, now: number): { x: number; y: number } {
	const steps = (h.to - h.from + 40) % 40;
	const f = Math.min(Math.max((now - h.start) / STEP_MS, 0), steps);
	const prev = (h.from + Math.floor(f)) % 40;
	const t = f - Math.floor(f);
	const a = tileCenter(prev);
	const b = tileCenter((prev + 1) % 40);
	return {
		x: a.x + (b.x - a.x) * t,
		y: a.y + (b.y - a.y) * t - Math.sin(Math.PI * t) * HOP_PX
	};
}

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

function drawToken(
	ctx: CanvasRenderingContext2D,
	shape: string,
	cx: number,
	cy: number,
	size: number
) {
	ctx.beginPath();
	if (shape === 'circle' || shape === 'ring') {
		ctx.arc(cx, cy, size, 0, Math.PI * 2);
	} else if (shape === 'square') {
		ctx.rect(cx - size, cy - size, size * 2, size * 2);
	} else if (
		shape === 'triangle' ||
		shape === 'diamond' ||
		shape === 'pentagon' ||
		shape === 'hexagon' ||
		shape === 'star' ||
		shape === 'shield'
	) {
		const points =
			shape === 'triangle'
				? 3
				: shape === 'diamond'
					? 4
					: shape === 'pentagon'
						? 5
						: shape === 'hexagon'
							? 6
							: shape === 'shield'
								? 6
								: 10;
		const rotation = shape === 'diamond' ? Math.PI / 4 : -Math.PI / 2;
		for (let j = 0; j < points; j++) {
			const radius = shape === 'star' && j % 2 === 1 ? size * 0.45 : size;
			const angle = rotation + (j * Math.PI * 2) / points;
			const x = cx + Math.cos(angle) * radius;
			const y = cy + Math.sin(angle) * radius;
			j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
		}
		ctx.closePath();
	} else {
		ctx.moveTo(cx - size, cy - size / 3);
		ctx.lineTo(cx - size / 3, cy - size / 3);
		ctx.lineTo(cx - size / 3, cy - size);
		ctx.lineTo(cx + size / 3, cy - size);
		ctx.lineTo(cx + size / 3, cy - size / 3);
		ctx.lineTo(cx + size, cy - size / 3);
		ctx.lineTo(cx + size, cy + size / 3);
		ctx.lineTo(cx + size / 3, cy + size / 3);
		ctx.lineTo(cx + size / 3, cy + size);
		ctx.lineTo(cx - size / 3, cy + size);
		ctx.lineTo(cx - size / 3, cy + size / 3);
		ctx.lineTo(cx - size, cy + size / 3);
		ctx.closePath();
	}
	if (shape !== 'ring') ctx.fill();
	ctx.stroke();
}

export default function BoardCanvas({ onselect }: { onselect?: (id: number) => void }) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const shownPos = useRef<Record<string, number>>({});
	const hops = useRef<Record<string, Hop>>({});
	const raf = useRef(0);

	const canRoll = useGameStore((s) => {
		const gs = s.gameState;
		return (
			!!gs && !!s.playerId && gs.currentTurnPlayerId === s.playerId && gs.status === 'IN_GAME' && gs.turnPhase === 'ROLL'
		);
	});
	const meInJail = useGameStore((s) => s.gameState?.players.find((p) => p.id === s.playerId)?.inJail ?? false);

	function draw(now: number = performance.now()) {
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext('2d');
		if (!ctx || !canvas) return;
		const dpr = window.devicePixelRatio || 1;
		canvas.width = BOARD_SIZE * dpr;
		canvas.height = BOARD_SIZE * dpr;
		ctx.scale(dpr, dpr);

		ctx.fillStyle = '#f8fafc';
		ctx.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);

		const gs = useGameStore.getState().gameState;
		const tiles = gs?.tiles ?? TILE_MAP;
		const ownerColor = new Map((gs?.players ?? []).map((p) => [p.id, p.tokenColor]));
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
		}

		// Houses/hotels: dots OUTSIDE the tile on the board-center side, so
		// tile text stays readable. 1–4 green dots = houses, 1 red dot = hotel.
		for (let id = 0; id < 40; id++) {
			const t = tiles[id];
			if (!t || t.houses <= 0) continue;
			const r = tileRect(id);
			const cx = r.x + r.w / 2;
			const cy = r.y + r.h / 2;
			const OFF = 10;
			// Anchor + axis: bottom row → above tile, top row → below tile,
			// left column → right of tile, right column → left of tile.
			let ax = cx;
			let ay = cy;
			let horizontal = true;
			if (id >= 1 && id <= 9) {
				ax = cx;
				ay = r.y - OFF;
				horizontal = true;
			} else if (id >= 11 && id <= 19) {
				ax = r.x + r.w + OFF;
				ay = cy;
				horizontal = false;
			} else if (id >= 21 && id <= 29) {
				ax = cx;
				ay = r.y + r.h + OFF;
				horizontal = true;
			} else if (id >= 31 && id <= 39) {
				ax = r.x - OFF;
				ay = cy;
				horizontal = false;
			} else {
				// Corners never hold houses, but keep a sane inward fallback.
				ax = cx + (cx < BOARD_SIZE / 2 ? OFF : -OFF);
				ay = cy + (cy < BOARD_SIZE / 2 ? OFF : -OFF);
			}
			if (t.houses < 5) {
				const s = 4.5;
				const gap = 3;
				const total = t.houses * (s * 2) + (t.houses - 1) * gap;
				let d = -total / 2 + s;
				ctx.fillStyle = '#16a34a';
				ctx.strokeStyle = '#ffffff';
				ctx.lineWidth = 1.5;
				for (let h = 0; h < t.houses; h++) {
					ctx.beginPath();
					if (horizontal) ctx.arc(ax + d, ay, s, 0, Math.PI * 2);
					else ctx.arc(ax, ay + d, s, 0, Math.PI * 2);
					ctx.fill();
					ctx.stroke();
					d += s * 2 + gap;
				}
			} else {
				ctx.fillStyle = '#dc2626';
				ctx.strokeStyle = '#ffffff';
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				ctx.arc(ax, ay, 6.5, 0, Math.PI * 2);
				ctx.fill();
				ctx.stroke();
			}
		}

		// Player tokens, grouped per tile so shared tiles lay out in a grid
		// instead of overlapping. Tokens are drawn large (r=13) to stay
		// visible on mobile, shrinking only when a tile gets crowded.
		// A hopping token is drawn at its flight position (on top) instead.
		const players = gs?.players ?? [];
		const hopping = new Set(Object.keys(hops.current));
		const byTile = new Map<number, number[]>();
		players.forEach((p, i) => {
			if (hopping.has(p.id)) return; // drawn at flight position below
			const tile = shownPos.current[p.id] ?? p.position;
			if (!tiles[tile]) return;
			const list = byTile.get(tile) ?? [];
			list.push(i);
			byTile.set(tile, list);
		});
		byTile.forEach((indices, pos) => {
			const r = tileRect(pos);
			const n = indices.length;
			const isCorner = pos % 10 === 0;
			const size = n > 6 ? 9 : n > 4 ? 11 : 13;
			const cols = Math.min(n, isCorner ? 3 : 2);
			const rows = Math.ceil(n / cols);
			const gapX = size * 2 + 3;
			const gapY = size * 2 + 3;
			const cx = r.x + r.w / 2;
			const cy = r.y + r.h / 2 + 8;
			indices.forEach((pi, k) => {
				const p = players[pi];
				const col = k % cols;
				const row = Math.floor(k / cols);
				const ox = (col - (cols - 1) / 2) * gapX;
				const oy = (row - (rows - 1) / 2) * gapY;
				ctx.fillStyle = p.tokenColor;
				ctx.strokeStyle = '#fff';
				ctx.lineWidth = 3;
				drawToken(ctx, tokenShape(pi), cx + ox, cy + oy, size);
			});
		});
		// Hopping tokens fly above the grid, one bounce per tile.
		players.forEach((p, i) => {
			if (!hopping.has(p.id)) return;
			const { x, y } = hopXY(hops.current[p.id], now);
			ctx.fillStyle = p.tokenColor;
			ctx.strokeStyle = '#fff';
			ctx.lineWidth = 3;
			drawToken(ctx, tokenShape(i), x, y, 13);
		});

		// Center artwork + whose turn it is.
		const roller = gs?.players.find((p) => p.id === gs.currentTurnPlayerId);
		const winner =
			gs?.status === 'FINISHED' ? gs.players.find((p) => p.id === gs.winnerId) : undefined;
		const centerX = BOARD_SIZE / 2;
		const centerY = BOARD_SIZE / 2;
		ctx.textAlign = 'center';
		// Title overrides: a jailed turn player replaces the default title
		// with bright-red "JAIL!!!" until the turn passes; a freshly drawn
		// Chance/Community card replaces it with the deck name + card text,
		// colored green for rewards and red for payments/punishments.
		const turnPlayer =
			gs?.status === 'IN_GAME'
				? gs.players.find((p) => p.id === gs.currentTurnPlayerId)
				: undefined;
		const jailed = !!turnPlayer?.inJail;
		const lastCard = gs?.lastCard;
		// Shown until the next player action clears it server-side — even
		// if the turn auto-passed in the meantime.
		const showCard = !jailed && !!lastCard && gs?.status === 'IN_GAME';
		const toneColor =
			lastCard?.tone === 'good' ? '#16a34a' : lastCard?.tone === 'bad' ? '#dc2626' : '#0f172a';
		const cardTitle = lastCard?.deck === 'CHANCE' ? 'ভাগ্য পরীক্ষা' : 'সুযোগ গ্রহণ';
		ctx.fillStyle = jailed ? '#dc2626' : showCard ? toneColor : '#0f172a';
		ctx.font = `bold 40px ${FONT_FAMILY}`;
		ctx.fillText(jailed ? 'JAIL!!!' : showCard ? cardTitle : 'ধনী হওয়ার মজার খেলা', centerX, centerY - 72);
		if (winner) {
			ctx.font = `bold 52px ${FONT_FAMILY}`;
			ctx.fillStyle = winner.tokenColor;
			ctx.fillText(winner.name, centerX, centerY - 8, 440);
			ctx.font = `20px ${FONT_FAMILY}`;
			ctx.fillStyle = '#64748b';
			ctx.fillText('🏆 বিজয়ী!', centerX, centerY + 28);
		} else if (showCard && lastCard) {
			const cardSize = fitFont(ctx, lastCard.text, 26, 440, 'bold');
			ctx.font = `bold ${cardSize}px ${FONT_FAMILY}`;
			ctx.fillStyle = toneColor;
			ctx.fillText(lastCard.text, centerX, centerY - 8, 440);
			ctx.font = `20px ${FONT_FAMILY}`;
			ctx.fillStyle = '#64748b';
			const [d1, d2] = gs.dice;
			ctx.fillText(
				`${turnPlayer?.name ?? ''} এর চাল চলছে · ${diceFace(d1)}${diceFace(d2)}`,
				centerX,
				centerY + 28
			);
		} else if (roller && gs?.status === 'IN_GAME') {
			ctx.font = `bold 52px ${FONT_FAMILY}`;
			ctx.fillStyle = roller.tokenColor;
			ctx.fillText(roller.name, centerX, centerY - 8, 440);
			ctx.font = `20px ${FONT_FAMILY}`;
			ctx.fillStyle = '#64748b';
			const [d1, d2] = gs.dice;
			ctx.fillText(`এর চাল চলছে · ${diceFace(d1)}${diceFace(d2)}`, centerX, centerY + 28);
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

	function tickHopLoop() {
		if (raf.current) return;
		const tick = () => {
			const now = performance.now();
			for (const [id, h] of Object.entries(hops.current)) {
				if (now - h.start >= ((h.to - h.from + 40) % 40) * STEP_MS) {
					shownPos.current[id] = h.to;
					delete hops.current[id];
				}
			}
			draw(now);
			raf.current = Object.keys(hops.current).length > 0 ? requestAnimationFrame(tick) : 0;
		};
		raf.current = requestAnimationFrame(tick);
	}

	useEffect(() => {
		// Wait for Bangla font before first render.
		const render = () => draw();
		if (document.fonts?.ready) {
			document.fonts.ready.then(render).catch(render);
		} else {
			render();
		}
		return () => {
			if (raf.current) cancelAnimationFrame(raf.current);
			raf.current = 0;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Track authoritative positions: new seats snap, movers hop.
	useEffect(
		() =>
			useGameStore.subscribe((s) => {
				const ps = s.gameState?.players ?? [];
				const now = performance.now();
				const reducedMotion =
					typeof window !== 'undefined' &&
					window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
				for (const p of ps) {
					if (shownPos.current[p.id] === undefined) {
						shownPos.current[p.id] = p.position;
						continue;
					}
					const inFlight = hops.current[p.id];
					if (inFlight && inFlight.to === p.position) continue;
					const from = inFlight ? hopTile(inFlight, now) : shownPos.current[p.id];
					if (from === p.position) {
						if (inFlight) delete hops.current[p.id];
						else shownPos.current[p.id] = p.position;
						continue;
					}
					if (reducedMotion) {
						delete hops.current[p.id];
						shownPos.current[p.id] = p.position;
						continue;
					}
					hops.current[p.id] = { from, to: p.position, start: now };
					tickHopLoop();
				}
				for (const id of Object.keys(shownPos.current)) {
					if (!ps.some((p) => p.id === id)) {
						delete shownPos.current[id];
						delete hops.current[id];
					}
				}
				draw(now);
			}),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[]
	);

	function handleClick(ev: React.MouseEvent) {
		const canvas = canvasRef.current;
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

	return (
		<div className="relative mx-auto" style={{ maxWidth: 800 }}>
			<canvas
				ref={canvasRef}
				style={{ width: '100%', aspectRatio: '1' }}
				className="cursor-pointer rounded-2xl shadow-lg"
				onClick={handleClick}
			></canvas>
			{canRoll && (
				<div className="pointer-events-none absolute inset-0">
					<button
						className="anim-turn-pulse pointer-events-auto absolute left-1/2 top-[68%] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-emerald-600 px-8 py-4 text-2xl font-bold text-white shadow-xl transition hover:bg-emerald-500 active:scale-95"
						onClick={() => send('ROLL_DICE', {})}
					>
						{meInJail ? '🎲 জোড়ার চেষ্টা!' : '🎲 দান চালুন!'}
					</button>
				</div>
			)}
		</div>
	);
}
