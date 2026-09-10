# Zhiyu Liu · Personal Portfolio

Personal portfolio website for Zhiyu Liu, built with Vue 3, TypeScript, Vite, and Three.js. Includes an interactive geometry scene, personal introduction, ten projects with detailed notes, education, and contact links.

## Development

```bash
npm install
npm run dev
```

Open the local address printed by the development server.

## Production build

```bash
npm run build
```

The build runs TypeScript checks and generates static production files in `dist/`. `netlify.toml` configures Netlify to run `npm run build`, publish `dist`, and use Node.js 22. When this repository's `main` branch is connected as the Netlify production branch and automatic publishing is enabled, pushes trigger a build and deployment. Use a Node.js version supported by the installed Vite version (currently Node 20.19+ or 22.12+).

## Content updates

Portfolio text, education dates, project links, and social links live in `src/data/portfolio.ts`. This content was restored from the original portfolio; education dates and external links retain their original values and should be reviewed when updating your résumé. Images are stored in `src/assets/`.

- Page sections and project / WeChat dialogs: `src/App.vue`
- Project cards: `src/components/ProjectCard.vue`
- 3D card stack and navigation: `src/components/ProjectDeck.vue`, `src/styles/project-deck.css`
- Three.js dimensions, profiles, and geometry functions: `src/components/GeometryScene.vue`
- Shared design and responsive styles: `src/styles/main.css`

Run `npm run test:deck` for the project stack's component-state regression checks (navigation, gestures, filters, details events, and reduced motion). These checks do not replace visual testing in a browser.

Projects appear in a perspective card stack. Drag horizontally, use the previous / next controls, or select a project by name. Focus the stack to use Left / Right, Home / End, and Enter to open details. Clicking a rear card brings it forward; clicking the front card opens the original project details. Vertical touch scrolling remains available, and reduced-motion preferences disable tilt and animated depth. Project filters and dialogs work locally without a backend. Live demos, source repositories, papers, and the résumé open external websites. The previous `#banner`, `#blog`, and `#experience` bookmarks redirect to the corresponding new sections.

## License

This project includes code derived from the Vuesume template. Its MIT license is retained in [LICENSE](LICENSE).

Typography uses self-hosted JetBrains Mono throughout: Regular (400) for body copy and Medium (500) for headings and controls. The WOFF2 files come from the font archive already included in the project. Shared font, size, and weight tokens are defined in `src/styles/main.css`; the SIL Open Font License is included in `public/fonts/OFL-JetBrainsMono.txt`. The previously tested Manrope asset is retained but is no longer loaded; its license remains alongside it.

## NIO Vehicle Lab

Play at https://www.zhiyuliu.com/niogame/ (the existing domain configuration may redirect to https://zhiyuliu.com/niogame/). The standalone game is committed at `public/niogame/index.html`; Vite copies it to `dist/niogame/index.html`. Netlify serves this existing static directory automatically, so no additional DNS, site, or redirect configuration is required. The portfolio entry is in `src/data/portfolio.ts`.

To update the game, rebuild the game project and replace `public/niogame/index.html` with its latest standalone HTML, retaining the deployed home link to `/`. Commit and push to the connected production branch to trigger Netlify. Changes in the separate local game folder do not automatically sync to this repository.

Upstream: https://github.com/Ayi1337/gpt6-astra-one-shot-games. The game is an independent remaster, not an official NIO product. Vehicle imagery and trademarks remain with their owners; source URLs are recorded in `public/niogame/asset-sources.json`.

### Game update: 2026-09-09

Nine official vehicle levels now lead to a tenth, AI-generated William Li cartoon portrait: ES9 + ES9 → William Li. Car height is increased by 25%, with floor friction 0.85 and vehicle friction 0.65. Merges require 0.4 seconds of low-speed continuous contact; new bodies become eligible at 0.45 seconds. Generation provenance is recorded with the asset sources.

### Game update: 2026-09-10

Restored vehicle height to its original ratio (1.0). Expanded the logical chamber from 640×720 to 688×774 and desktop frame maximum from 760px to 820px. Extended the overflow limit from 3 seconds to 8 seconds. Final portrait, friction, and 0.4-second merge delay are retained.
