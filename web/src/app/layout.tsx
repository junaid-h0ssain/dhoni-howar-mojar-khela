import type { Metadata } from 'next';
import { Noto_Sans_Bengali } from 'next/font/google';
import './globals.css';

const bengali = Noto_Sans_Bengali({
	subsets: ['bengali', 'latin'],
	weight: ['400', '500', '600', '700'],
	display: 'swap'
});

export const metadata: Metadata = {
	title: 'ধনী হওয়ার মজার খেলা',
	icons: { icon: '/icon.svg' }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="bn" className={bengali.className}>
			<body>{children}</body>
		</html>
	);
}
