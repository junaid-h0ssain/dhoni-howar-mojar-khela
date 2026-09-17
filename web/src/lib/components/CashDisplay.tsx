'use client';

import { useEffect, useRef, useState } from 'react';

export default function CashDisplay({ cash }: { cash: number }) {
	const [prev, setPrev] = useState(cash);
	const [delta, setDelta] = useState<number | null>(null);
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	useEffect(() => {
		if (cash === prev) return;
		setDelta(cash - prev);
		setPrev(cash);
		clearTimeout(timer.current);
		timer.current = setTimeout(() => setDelta(null), 2400);
		return () => clearTimeout(timer.current);
	}, [cash, prev]);

	const fmt = (n: number) => n.toLocaleString('en-US');
	const gain = delta !== null && delta > 0;
	const loss = delta !== null && delta < 0;

	return (
		<span className="inline-flex items-center gap-1.5 font-mono">
			<span
				className={`font-semibold transition-colors ${
					gain ? 'text-green-700' : loss ? 'text-red-700' : 'text-slate-800'
				}`}
			>
				৳{fmt(cash)}
			</span>
			{delta !== null && delta !== 0 && (
				<span
					className={`anim-log-in rounded-full px-1.5 text-xs font-bold ${
						gain ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
					}`}
				>
					{gain ? `+${fmt(delta)}` : fmt(delta)}
				</span>
			)}
		</span>
	);
}
