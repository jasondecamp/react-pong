# react-pong plan

A ground-up rewrite of [jasondecamp/angular-pong](https://github.com/jasondecamp/angular-pong) (Jason's 2016 AngularJS directive, itself based on [strawbserve/angular-pong](https://github.com/strawbserve/angular-pong)) as a framework-free Pong engine with a React component that embeds a playfield in any React app, installable from GitHub. It has the same design and the same game; no code is carried over. Decisions below were settled on 2026-11-03.

## Goals

- A pure, framework-free core that runs a game of Pong and drives a DOM playfield.
- A composite React component, `<Pong>`, that drops a playfield into any React app and plays nicely with the host page: scoped keyboard input, no globals, several instances at once, full teardown.
- Installable as a dependency straight from GitHub (`github:jasondecamp/react-pong#semver:^0.1.0`).
- Look and play like the original: flat `#007ee5` ball and paddles, thin gray score at the bottom center, a fading centered message, 8-bit blips, first to 11.
- Follow the conventions of react-snow, adapted for a component with styles.

## What the original did, and what changes

The original is one AngularJS directive (`<pong-court>`), about 400 lines. You play the right paddle with the up and down arrows against an AI on the left. Enter serves; Esc pauses, resumes, and resets after game over. The first to 11 wins, and the winning score scales up in blue. Every point can post a smack-talk line (`smack`, default off) that fades after 5 seconds. Three `.wav` files play on wall hits, paddle hits, and points.

It doesn't survive being embedded: it listens for keys on `document` (so it would steal the host's arrow keys), keeps the court in an implicit global, reads the court size once, moves everything on 10 ms `$interval`s (speed depends on timer accuracy, and the ball loop's elapsed time is negated), loads sounds from a relative `assets/` path, and needs Angular, ngSanitize, ngAnimate, and Bootstrap on the page.

The rewrite keeps the look, the rules, the feel of the controls, the AI's character, and the copy, and rebuilds everything else.

## Decisions

| # | Topic | Decision |
| --- | --- | --- |
| 1 | Layers | A framework-free core (`react-pong/core`) and a React layer (`react-pong`), as in react-snow. The core never imports React. |
| 2 | Simulation | A pure module: court size, ball, paddles, scores, phase, and AI, advanced by `step(dt, input)` with delta-time physics (px per second, same speed at 60Hz and 120Hz, large `dt` clamped). It never touches the DOM and takes its random source as an input so tests are deterministic. It reports events (`wall`, `paddle`, `point`, `gameOver`) from each step for sound and messages. |
| 3 | Rendering | DOM and CSS. The ball and paddles are elements moved with `transform: translate(...)` written directly from the loop, never through React state. The score and message are real text rendered by React from the game state, so screen readers can read them. |
| 4 | Core API | `createPong({ court, ball, leftPaddle, rightPaddle }, options)` takes elements it doesn't create (it never inserts DOM). It sizes itself to the court with a `ResizeObserver`, listens for keys on the court element only, and runs a `requestAnimationFrame` loop that idles when nothing moves (between points, paused, game over, offscreen). Instance methods: `serve`, `pause`, `resume`, `reset`, `update(options)`, `getState`, `subscribe(listener)` (`useSyncExternalStore`-shaped, notified only when the score, phase, or message changes, never per frame), and `destroy` (stops the loop and releases every listener, observer, and the audio context). |
| 5 | React API | Composite, per the house pattern: `<Pong {...options}>` creates the engine and provides it through context; `Pong.Court` renders the focusable playfield with the ball and paddles; `Pong.Score` and `Pong.Message` render from state. A bare `<Pong />` renders the default arrangement (court, score, message). `usePongGame()` exposes state and controls (`serve`, `pause`, `resume`, `reset`) for custom subcomponents. Callbacks `onPoint` and `onGameOver`. SSR-safe: the server renders the static start screen and the engine starts in an effect. |
| 6 | Embedding | `<Pong>` fills its parent (the consumer sizes the parent). Keyboard input only reaches the game while the court has focus: the court has `tabIndex={0}`, an `aria-label`, and a visible focus style, and clicking it focuses it. Keys the game handles call `preventDefault` so arrows don't scroll the page; others pass through. Losing focus, hiding the tab, or scrolling offscreen during a rally pauses it. Any number of instances can run at once. |
| 7 | Controls | Same as the original: up and down arrows move the right paddle, Enter serves, Esc pauses or resumes and resets after game over. The paddle accelerates the longer the key is held, as before, converted to px/s. A `keys` option remaps them. Pointer and touch control and two-player mode are out of scope for 1.0. |
| 8 | Rules and physics | First to `winningScore` (default 11), no win-by-two. The first serve goes to a random side, then the side that lost the point serves from its own paddle. Serve speed scales with the court (about half the width per second across, as in the original), each paddle hit adds 5%, the paddle's motion adds spin to the vertical speed, and vertical speed is capped at twice the court height per second. Positions scale proportionally when the court resizes. Collision is swept, so a fast ball can't tunnel through a paddle. |
| 9 | AI | The left paddle. `difficulty: 'easy' \| 'normal' \| 'hard'`, default `'normal'`, which reproduces the original AI: it reacts mostly when the ball is coming at it and in its half, sometimes gives up, and stops when the ball is within its paddle. `easy` reacts later and misses more; `hard` reacts earlier and rarely misses. The presets are tuned in the playground. |
| 10 | Attract mode | `attract` (default `true`): on the start screen, before the first serve, both paddles are played by the AI behind the "Shall we play a game?" message, like an arcade cabinet. Attract rallies make no sound and score nothing. Enter resets the court and serves the real game. Reduced motion turns it off. |
| 11 | Sound | Synthesized with Web Audio: three short square-wave blips (wall, paddle, out) close to the original 8-bit wavs, with no asset files. The `AudioContext` is created lazily on the first key press (browsers block audio until a gesture) and closed on `destroy`. `sound` (default `true`) turns it off. |
| 12 | Messages | The core reports a message key (`start`, `smack.ai`, `smack.human`, `paused`, `gameOver`), not text. `Pong.Message` maps keys to the original copy, picks smack lines at random (each line equally likely; the original never picked the last one), and fades out after 5 seconds. `smack` (default `false`) turns on smack talk. Hint text ("press enter to start") is set in smaller uppercase gray, as before. Custom copy means replacing `Pong.Message` with your own subcomponent over `usePongGame()`. |
| 13 | Styles | The package ships a plain CSS file, `react-pong/styles.css`, that consumers import once. Class names are prefixed (`pong-`) to avoid collisions. Colors, sizes, and the font are `--pong-*` custom properties with the original's values as defaults (`--pong-color: #007ee5`, `--pong-muted: #ccc`, ball and paddle `15px`, paddle height 15% of the court). Transitions (message fade, winner scale-up) are disabled under `prefers-reduced-motion`. |
| 14 | Font | The library loads no font: `--pong-font` defaults to `inherit`, with weights 100 and 700 as in the original. The playground loads Roboto to recreate the original look. |
| 15 | Language and distribution | As react-snow: TypeScript (`strict`), compiled by plain `tsc` (TypeScript pinned to 6.0 until typescript-eslint supports 7) to per-file ESM `.js` + `.d.ts` in `dist/`, with `jsx: react-jsx`; the build copies `styles.css` alongside. `exports`: `.` (React), `./core`, and `./styles.css`. `react` (>= 19) is a peer dependency, optional for core-only use. `sideEffects` lists only the CSS. `dist/` is git-ignored on `main` and exists only on release tags. |
| 16 | Repo | `~/work/react-pong`, public GitHub repo `jasondecamp/react-pong`. Node 24, pnpm 12, ESLint 10 flat config with the react-snow rules, Vitest (simulation in `node` with injected random; engine, hook, and components in jsdom). Feature branches and PRs; CI runs lint, typecheck, test, and build on every PR. MIT license, crediting angular-pong and strawbserve/angular-pong (clean-room rewrite, no code copied). |
| 17 | Releases | As react-snow: bumping `version` in a PR and merging it releases (lint, test, build, commit `dist/` in a release-only commit, tag `v<version>`, GitHub Release). Merges without a bump don't release. `0.x` until the physics and AI are tuned. |
| 18 | Demo | A Vite playground in `demo/` (not in the package) importing from `src/`, full-window like the original's page, with Roboto loaded and a panel for every option and the theme variables. Deployed to GitHub Pages by `release.yml` at `https://jasondecamp.github.io/react-pong/` from 0.1.0. |

## Options (defaults to be tuned in the playground)

| Option | Default | Notes |
| --- | --- | --- |
| `winningScore` | `11` | |
| `difficulty` | `'normal'` | `'easy'`, `'normal'`, or `'hard'`. |
| `attract` | `true` | AI vs AI on the start screen. |
| `smack` | `false` | Smack talk after each point. |
| `sound` | `true` | Web Audio blips. |
| `keys` | arrows, Enter, Esc | Maps `KeyboardEvent.key` values to `up`, `down`, `serve`, `pause`. |
| `paddleSpeed` | about the original's | Starting paddle speed, px/s; accelerates while held. |

## Layout

```
src/
  core/        # simulation (pure), ai, sound, createPong, options, types, index.ts
  react/       # Pong.tsx (+ Court, Score, Message), usePongGame.ts, index.ts
  styles.css   # copied to dist/ by the build
demo/          # Vite playground (not published)
docs/PLAN.md
.github/workflows/  # ci.yml, release.yml
```

## Phases

1. **0.1.0:** the faithful game. Repo scaffolding, simulation, `normal` AI, Web Audio sound, `createPong`, the composite component, `styles.css`, tests, the playground and its Pages deploy, README, CI, release workflow.
2. **0.2.0:** `difficulty` presets and attract mode (decisions 9–10).
3. **1.0.0:** physics, AI presets, and sound tuned in the playground.

## Out of scope

- Pointer and touch control, two-player mode: later, if wanted.
- A fourfightingfoxes portfolio entry and blog post: angular-pong is already on the list of upcoming pieces; write it about react-pong once it's released, with the `new-portfolio-entry` skill, possibly embedding `<Pong>` live on the project page.
