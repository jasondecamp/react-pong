# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

react-pong is Jason DeCamp's embeddable Pong: a framework-free TypeScript engine that runs the game and drives a DOM playfield, plus a composite React component (`<Pong>`) that drops a playfield into any React app. It is a ground-up rewrite of [jasondecamp/angular-pong](https://github.com/jasondecamp/angular-pong) (2016, AngularJS) with the same design and gameplay; no code is carried over. Consumers install it from GitHub release tags, not npm. The full design, every settled decision, and phase status live in [`docs/PLAN.md`](docs/PLAN.md); read it before starting work, and update it when a decision changes.

Conventions are ported from Jason's react-snow (which adapted fourfightingfoxes and moved-react to TypeScript), so style and organization stay consistent across projects.

## Commands

```bash
pnpm install          # Node 24, pnpm 12
pnpm dev              # demo playground (Vite) at http://localhost:5318, imports from src/
pnpm dev:server       # the two-player server, run locally by Wrangler at http://localhost:8787
pnpm smoke:server     # with dev:server running: play a lobby through over real WebSockets
pnpm build            # tsc -> dist/ (ESM .js + .d.ts), plus styles.css
pnpm build:demo       # playground -> demo/dist/ (release.yml deploys it to Pages)
pnpm lint             # ESLint 10 flat config
pnpm typecheck        # tsc --noEmit, for the project and then for server/worker.ts
pnpm test             # Vitest
```

## Architecture

### Layers

- **`src/core/`** has no framework dependency. It contains the simulation, the AI, sound, and `createPong`, exported as `react-pong/core`.
  - The **simulation** is pure: court, ball, paddles, scores, and phase, advanced by `step(dt, input)`. It never touches `window`, `document`, or the DOM, takes its random source as an input so tests are deterministic, and returns the events of each step (`wall`, `paddle`, `point`, `gameOver`).
  - The **AI** is a pure function of the simulation state and difficulty that produces paddle input, so attract mode is just the AI driving both paddles.
  - **Sound** synthesizes the blips with Web Audio. No audio files.
  - **`createPong(elements, options)`** wires them together with `requestAnimationFrame`, `ResizeObserver`, `IntersectionObserver`, and key, focus, and visibility listeners. It writes the ball and paddle transforms directly and never inserts DOM. Every resource it acquires is released by `destroy()`.
- **`src/react/`** contains `<Pong>` and its subcomponents and `usePongGame`, exported as `react-pong`. It may import from core, but core never imports from React.
  - `<Pong>` provides a store (`pongStore.ts`) through context. The store creates the engine in an effect, once `Pong.Court` has handed over its elements, and diffs the options key by key into `update()`. Game state reaches React through `subscribe`/`getState` with `useSyncExternalStore`, which changes only on score, phase, message, difficulty, winning score, help, or key map changes. **Per-frame positions never go through React state.**
- **`server/`** is the two-player server (from 0.3.0), which isn't part of the package. `room.ts` is everything a lobby decides, in plain TypeScript with no knowledge of sockets or of its host: it is given a `RoomHost` (a clock, `send`, `close`, a timer, and somewhere to save its state) and is tested in Node. `worker.ts` is the Cloudflare end: a Worker that checks the origin and routes `/lobby/new` and `/lobby/<code>`, a `Lobby` Durable Object that gives one room its WebSockets, alarm, and storage, and a `Directory` Durable Object that hands out codes and caps the lobbies open. It is type-checked by `server/tsconfig.json` against the Workers runtime's types, which clash with the DOM's. The messages are defined once, in `src/core/protocol.ts` (game and server) and `src/core/messages.ts` (game to game), which import nothing with DOM types so the server can read them. The server never decides anything about the ball or the paddles: each game decides what happens at its own paddle (`src/core/net.ts`).
- **Embedding rules are part of the API:** keyboard input only while the court has focus, handled keys `preventDefault`, everything else passes through; no listeners on `document` or `window` except visibility; any number of instances.

### Distribution

- Source is TypeScript, compiled by plain `tsc` (no bundler) to per-file ESM in `dist/`. Relative imports in `src/` use `.js` extensions so the output is valid Node ESM. TypeScript is pinned to 6.0 because typescript-eslint doesn't support 7 yet; revisit when it does. `dist/` is git-ignored on `main`.
- `src/styles.css` is plain CSS (no Sass in the package) and the build copies it to `dist/`.
- `package.json` `exports` map `.` to the React entry, `./core` to the core entry, and `./styles.css` to the stylesheet. `react` (>= 19) is a peer dependency, optional for core-only consumers. `sideEffects` lists only the CSS.
- **Releases:** bump `version` in a PR. When it merges, `.github/workflows/release.yml` sees a version with no matching tag, then lints, tests, builds, commits `dist/` in a release-only commit, tags `v<version>`, and creates a GitHub Release. A second job deploys the playground to GitHub Pages at the custom domain `https://pong.fourfightingfoxes.com/`. Merges without a bump don't release; running the workflow by hand (`gh workflow run release.yml`) redeploys the playground without one.
- Consumers install `github:jasondecamp/react-pong#v<version>` or `#semver:^<range>`. `#main` installs don't work, because `main` has no `dist/`.

### Directory structure

```
src/
  core/                       # simulation, ai, sound, createPong, options, types, index.ts
  react/                      # Pong.tsx, Court.tsx, Score.tsx, Message.tsx, Help.tsx, usePongGame.ts, pongStore.ts, index.ts
  styles.css                  # the package stylesheet, --pong-* custom properties
  test/                       # test helpers (seeded random, browser stubs); not built
server/                       # the two-player server, not published: room.ts, codes.ts, worker.ts, wrangler.jsonc, smoke.mjs
demo/                         # Vite playground, not published; imports 'react-pong' aliased to src/
  components/<Name>/          # <Name>.tsx + <Name>.module.scss
docs/PLAN.md
.github/workflows/            # ci.yml, release.yml
```

## Code style

- TypeScript `strict`. No `any`; use `unknown` and narrow. Use `import type` for type-only imports. Prefer `type` aliases to `interface`, and string-literal unions to `enum`. Avoid non-null assertions (`!`); handle the null.
- Export the public option, instance, state, and prop types from each entry point. They are the consumer's documentation: every option gets a TSDoc comment stating its unit, range, and default.
- Single quotes. Arrow functions for components and callbacks. Destructure props.
- **Named exports only** in `src/` and `demo/`. Config files are exempt.
- One component per file. Name variables in camelCase.
- Semantic HTML. Always provide `alt` text on images and `aria-label` on interactive elements without visible text. The court is focusable with an `aria-label`; the ball and paddles are `aria-hidden`; the score and message are text.
- Plain string `className`s use quotes, never braces: `className='intro'`, not `className={'intro'}`. Use braces only for computed values. Prefer `classNames` over template-literal class interpolation.
- Use `!= null` instead of `!!` for boolean coercion.
- Event handlers: `onClick={() => fn()}` and `onClick={fn}` are not equivalent (React passes the event as the first argument). Check the callee's signature before "simplifying" a wrapper; when in doubt, leave it.
- UI labels are sentence case, never Title Case Per Word. The original's game copy keeps its wording.
- Keep edits scoped to the task. No unrelated refactors or "cleanups" in the same change.
- Generated or scripted code reads like hand-written code: no needless wrappers, and indentation exactly one level per nesting.

## Component design: composition over configuration

`<Pong>` is one composite component with attached subcomponents, composed as **children** and never configured through prop arrays or slot props:

```jsx
<Pong difficulty='hard' smack>
  <Pong.Court />
  <Pong.Score />
  <Pong.Message />
  <Pong.Help />
</Pong>
```

- Structural parts become subcomponents attached to the root. A bare `<Pong />` renders the default arrangement.
- Shared state flows through context, with a safe default so subcomponents can render standalone.
- The consumer owns the arrangement; custom parts read state and controls through `usePongGame()`.

## Styling

- **The package ships one plain stylesheet**, `react-pong/styles.css`. Its classes are prefixed `pong-` (no CSS modules in the package, since consumers' bundlers vary). Every color, size, and the font is a `--pong-*` custom property with a default (most are the original's values; the ball, the AI's paddle, and the message size have since changed); add a property rather than a hard-coded value. The defaults are the light palette; the dark palette's block, which appears twice (under `prefers-color-scheme: dark`, and for `.pong-dark`), redefines the few that differ, so change both copies together.
- The engine's per-frame `transform` writes are the one sanctioned inline style. Never put CSS variables in inline styles.
- Transitions are disabled under `prefers-reduced-motion`.
- **The demo** uses Sass with CSS modules, as in fourfightingfoxes:
  - Every component imports **only** its co-named `<Name>.module.scss`. Shared styles are explicit Sass partials that modules `@use`/`@forward`.
  - camelCase class names in modules (`.pageTitle`).
  - Use tokens from a variables-only `_tokens.scss`; avoid one-off values.
  - Space and position siblings with flex/grid `gap`, not child margins, wherever a flex or grid container fits.
  - New transitions default to `0.2s`.
  - `border-radius: 50%` only on square elements.
  - Write CSS animations as longhands (`animation-duration`, `animation-timing-function`, …) when the name comes from another class. The production minifier rewrites an `animation` shorthand without a name to `animation: none`, silently dropping the duration (dev doesn't minify, so it only breaks in the build).
  - When emitting base and responsive variants of utility classes, output all base classes first and all responsive variants after (media queries add no specificity, so source order decides).
  - Do not invent classes that don't exist.

## Performance rules

- No allocation in the per-frame path: mutate the simulation state in place and reuse event buffers.
- All motion is delta-time based (px per second), never per frame. Clamp large `dt` so the ball doesn't teleport, and sweep collisions so it can't tunnel through a paddle.
- The loop idles (no `requestAnimationFrame` scheduled) whenever nothing moves: between points without attract mode, paused, game over, or offscreen.
- React re-renders only on score, phase, message, difficulty, winning score, help, or key map changes.

## Testing and validation

- **Vitest** (`pnpm test`): co-locate tests with the code they cover (`name.test.ts` next to `name.ts`).
  - Simulation and AI tests run in the `node` environment (`// @vitest-environment node`) with an injected random source.
  - Engine, sound, and component tests run in jsdom with stubbed `requestAnimationFrame`, observers, and `AudioContext`. Use Testing Library and `@testing-library/user-event` for interaction.
  - Server tests (`server/*.test.ts`) run in Node against `room.ts` with a host the test controls. The Cloudflare adapter has no unit tests: check it by running `pnpm dev:server` and `pnpm smoke:server`.
  - Cover StrictMode (mount, unmount, mount): no leaked loops, observers, listeners, or audio contexts. Cover two instances on one page not hearing each other's keys.
- Validate before shipping: run lint, typecheck, tests, and the build before calling anything done. Gameplay feel is checked by Jason in the demo playground on his own `pnpm dev`; don't start a second dev server on the same port.
- Skip re-running the test suite for style-only changes.

## Git and releases

- **Never commit or push without Jason's explicit approval.** Pushing a branch, opening a PR, and merging each need his go-ahead too.
- Commit email for this repo is `jason@fourfightingfoxes.com` (repo-local git config).
- Explain and confirm before any destructive git operation.
- Work happens on feature branches off an up-to-date `main` (`git switch -c <descriptive-branch>`) and lands through GitHub pull requests. CI (`.github/workflows/ci.yml`) runs lint, typecheck, test, and build on every PR.
- A PR that bumps `version` releases on merge, so treat merging a version bump as a release that needs Jason's explicit go-ahead.
- Approval like "looks good, ship it" means commit and push the feature branch for its PR, not merge.
- **Merging** (only on Jason's explicit go-ahead): squash and merge (`gh pr merge <n> --squash`), so `main` keeps one commit per PR. Then delete the branch locally and on GitHub: a squash merge shares no ancestry with the branch, so confirm `git diff <branch> origin/main` is empty before `git branch -D`. Finally switch to `main` and fast-forward it to `origin/main`.
