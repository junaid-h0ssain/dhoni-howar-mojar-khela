Next.js App Router port of the `front/` SvelteKit board game (ধনী হওয়ার মজার খেলা).
See `../migration.md` for the porting guide. The SvelteKit app stays untouched;
this `web/` app is developed side-by-side on the `next-try` branch.

## Room storage (Upstash or in-memory)

Copy `.env.example` to `.env.local`. With both `UPSTASH_REDIS_REST_URL` and
`UPSTASH_REDIS_REST_TOKEN` empty, rooms live in server memory (local dev only).
Set both — locally and in Vercel project env vars — so rooms survive deploys
and are shared across serverless instances.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
