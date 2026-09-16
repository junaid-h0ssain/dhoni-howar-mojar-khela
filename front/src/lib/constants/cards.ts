// Chance ("ভাগ্য পরীক্ষা") and Community Chest ("সুযোগ গ্রহণ") card
// definitions — single source of truth. The server engine imports these for
// gameplay; the client imports them to display the readable card lists.

export type CardKind =
	| 'cash' | 'moveTo' | 'goToJail' | 'moveBack' | 'getOutOfJail'
	| 'nearestRailroad' | 'nearestUtility' | 'repairs' | 'payEachPlayer' | 'collectEachPlayer';

export interface Card { text: string; kind: CardKind; amount?: number; amount2?: number }

export const CHANCE_CARDS: Card[] = [
	{ text: 'যাত্রা শুরুর ঘরে এগিয়ে যান। +৳200', kind: 'collectEachPlayer', amount: 0 },
	{ text: 'দেওয়ানহাট যান। GO পার হলে +৳200', kind: 'moveTo', amount: 24 },
	{ text: 'পাঁচলাইশ যান।', kind: 'moveTo', amount: 39 },
	{ text: 'রাউজান যান। GO পার হলে +৳200', kind: 'moveTo', amount: 11 },
	{ text: 'নিকটতম স্টেশনে যান। কেনা না হলে কিনতে পারবেন, নইলে দ্বিগুণ ভাড়া।', kind: 'nearestRailroad' },
	{ text: 'নিকটতম স্টেশনে যান। কেনা না হলে কিনতে পারবেন, নইলে দ্বিগুণ ভাড়া।', kind: 'nearestRailroad' },
	{ text: 'নিকটতম ইউটিলিটিতে যান। মালিক থাকলে পাশা ফেলে ১০ গুণ ভাড়া দিন।', kind: 'nearestUtility' },
	{ text: 'ব্যাংক লভ্যাংশ দিল: +৳50', kind: 'cash', amount: 50 },
	{ text: 'জেল থেকে মুক্তির কার্ড পেলেন! জেলে গেলে ব্যবহার করুন।', kind: 'getOutOfJail' },
	{ text: '৩ ঘর পিছিয়ে যান।', kind: 'moveBack', amount: 3 },
	{ text: 'জেলে যান। GO পার হবেন না, ৳200 পাবেন না।', kind: 'goToJail' },
	{ text: 'সাধারণ মেরামত: প্রতি বাড়ি ৳25, প্রতি হোটেল ৳100।', kind: 'repairs', amount: 25, amount2: 100 },
	{ text: 'দ্রুত চালানোর জরিমানা: -৳15', kind: 'cash', amount: -15 },
	{ text: 'পাহাড়তলী স্টেশনে ভ্রমণ করুন। GO পার হলে +৳200', kind: 'moveTo', amount: 5 },
	{ text: 'বোর্ডের চেয়ারম্যান হলেন! প্রত্যেক খেলোয়াড়কে ৳50 দিন।', kind: 'payEachPlayer', amount: 50 },
	{ text: 'বিল্ডিং লোন পরিপক্ক হয়েছে। +৳150', kind: 'cash', amount: 150 }
];

export const CHEST_CARDS: Card[] = [
	{ text: 'যাত্রা শুরুর ঘরে এগিয়ে যান। +৳200', kind: 'collectEachPlayer', amount: 0 },
	{ text: 'ব্যাংকের ভুলে +৳200 পেলেন।', kind: 'cash', amount: 200 },
	{ text: 'ডাক্তারের ফি -৳50।', kind: 'cash', amount: -50 },
	{ text: 'শেয়ার বিক্রি করে +৳50 পেলেন।', kind: 'cash', amount: 50 },
	{ text: 'জেল থেকে মুক্তির কার্ড পেলেন! জেলে গেলে ব্যবহার করুন।', kind: 'getOutOfJail' },
	{ text: 'জেলে যান। GO পার হবেন না, ৳200 পাবেন না।', kind: 'goToJail' },
	{ text: 'ছুটির তহবিল +৳100।', kind: 'cash', amount: 100 },
	{ text: 'আয়কর ফেরত +৳20।', kind: 'cash', amount: 20 },
	{ text: 'আপনার জন্মদিন! প্রত্যেক খেলোয়াড়ের কাছ থেকে ৳10 নিন।', kind: 'collectEachPlayer', amount: 10 },
	{ text: 'জীবনবিমা পরিপক্ক +৳100।', kind: 'cash', amount: 100 },
	{ text: 'হাসপাতালের বিল -৳100।', kind: 'cash', amount: -100 },
	{ text: 'স্কুল ফি -৳50।', kind: 'cash', amount: -50 },
	{ text: 'পরামর্শ ফি +৳25 পেলেন।', kind: 'cash', amount: 25 },
	{ text: 'রাস্তা মেরামত: প্রতি বাড়ি ৳40, প্রতি হোটেল ৳115।', kind: 'repairs', amount: 40, amount2: 115 },
	{ text: 'সুন্দরী প্রতিযোগিতায় দ্বিতীয় পুরস্কার +৳10।', kind: 'cash', amount: 10 },
	{ text: 'উত্তরাধিকার সূত্রে +৳100 পেলেন।', kind: 'cash', amount: 100 }
];

/** Green for rewards, red for payments/punishments, slate otherwise. */
export function cardTone(c: Card): 'good' | 'bad' | 'neutral' {
	switch (c.kind) {
    case 'collectEachPlayer':
      return 'good';
		case 'getOutOfJail':
			return 'good';
    case 'payEachPlayer':
      return 'bad';
    case 'repairs':
      return 'bad';
		case 'goToJail':
			return 'bad';
		case 'cash':
			return (c.amount ?? 0) > 0 ? 'good' : (c.amount ?? 0) < 0 ? 'bad' : 'neutral';
		default:
			return 'neutral';
	}
}
