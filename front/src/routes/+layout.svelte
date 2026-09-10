<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>ধনী হওয়ার মজার খেলা</title>
</svelte:head>
{@render children()}

<style>
	:global(body) {
		font-family: 'Hind Siliguri', 'Kalpurush', system-ui, sans-serif;
	}
</style>
