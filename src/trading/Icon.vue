<script setup lang="ts">
defineProps<{name: string; size?: number}>();
const paths: Record<string, string> = {
  pnl: 'M3 18l6-6 4 3 8-11 M16 4h5v5 M3 22h18',
  diary:
    'M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4z M13 7a3 3 0 0 1 3-3h4v15h-3a4 4 0 0 0-4 2 M7 8h2 M7 12h2',
  overview: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  journal: 'M5 3h14v18H5z M9 7h6 M9 11h6 M9 15h4',
  positions: 'M4 20V10h4v10 M10 20V4h4v16 M16 20v-7h4v7',
  timeline: 'M5 3v18 M5 7h5 M5 17h5 M13 5h7v4h-7z M13 15h7v4h-7z',
  settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  up: 'M6 16l12-12 M6 4h12v12',
  download: 'M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5',
  plus: 'M12 5v14 M5 12h14',
  search: 'M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15 M16 16l5 5',
  link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2',
  chevron: 'M9 5l7 7-7 7',
  close: 'M5 5l14 14 M19 5L5 19',
  check: 'M5 12l4 4L19 6',
  globe:
    'M3 12h18 M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 3c5 5 5 13 0 18-5-5-5-13 0-18',
  wallet: 'M20 7H4V4h14v3 M4 7v13h16V7 M16 11h5v5h-5z',
  layers: 'M12 3l10 6-10 6L2 9z M2 13l10 6 10-6 M2 17l10 6 10-6',
  menu: 'M3 6h18 M3 12h18 M3 18h18',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12 M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  reset: 'M3 4v6h6 M3 10a9 9 0 1 1 0 5',
  info: 'M12 8v1 M12 12v5 M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18',
};
</script>
<template>
  <svg
    :width="size || 18"
    :height="size || 18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[name] || paths.arrow" />
  </svg>
</template>
