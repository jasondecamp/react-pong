# <img src="demo/public/favicon.svg" alt="" width="28" height="28"> react-pong

[![CI](https://github.com/jasondecamp/react-pong/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/jasondecamp/react-pong/actions/workflows/ci.yml)

Retro Pong you can embed: a framework-free Pong engine, plus a composite React component (`<Pong>`) that drops a playfield into any React app.

Play it in the [playground](https://jasondecamp.github.io/react-pong/).

- You play the right paddle against an AI on the left, at four difficulties, the last of them with no handicap at all. First to 11 wins. A toss decides the first serve, and after that whoever scores serves next.
- A good guest on the host page: keys are heard only while the court has focus, nothing is global, any number of games can share a page, and unmounting releases everything.
- Delta-time physics: the same speed at 60Hz and 120Hz, and a fast ball can't tunnel through a paddle.
- A ball with a speed and an angle: serves leave at a steady pace, each paddle hit adds 5% and takes some of the slant off the ball's path, a moving paddle drags the ball its own way, and the corners of a paddle send it off steeply, even when the paddle catches the ball with its end after the ball has slipped past its face.
- Rings ripple out from the spot where the ball meets a paddle, in plain CSS.
- 8-bit blips synthesized with Web Audio. No asset files.
- The loop idles whenever nothing moves: between points, paused, game over, or offscreen.

## Install

Releases are git tags with the built files, installed straight from GitHub:

```bash
pnpm add github:jasondecamp/react-pong#semver:^0.1.0
# or pin one release: github:jasondecamp/react-pong#v0.1.0
```

`#main` and commit installs don't work: only release tags contain `dist/`. React (>= 19) is an optional peer dependency, needed only for the React entry point.

## React

```jsx
import { Pong } from 'react-pong';
import 'react-pong/styles.css';

<div className='arcade'>  {/* give it a size */}
  <Pong />
</div>
```

`<Pong>` fills its parent, so size the parent. Import the stylesheet once, anywhere.

### Controls

Click the court (or tab to it) to give it the keyboard. Keys the game handles don't scroll the page; every other key passes through.

| Key | |
| --- | --- |
| Up, Down | Move your paddle. It speeds up the longer you hold. |
| Enter | Serve. The first serve of a match is tossed for: the ball bounces between the paddles and settles on the side that won, which is announced with a 3-2-1 countdown before the ball leaves. You can move your paddle while it counts. |
| Space | Pause and resume. |
| Esc | After game over, reset. |
| ? | Show the keys, pausing a rally first. ? or Esc closes them, and the rally stays paused until you resume it with Space. |
| D | Step the difficulty: easy, normal, hard, impossible. Between games only: on the start screen and after game over. |

Just above the score, a small hint points to the help. Between games the current difficulty is shown above it, in its own color.

A rally pauses by itself when the court loses focus, the tab is hidden, or the court scrolls offscreen.

### Composition

`<Pong>` is a composite: its parts are subcomponents you arrange as children. A bare `<Pong />` is this arrangement:

```jsx
<Pong>
  <Pong.Court />
  <Pong.Score />
  <Pong.Message />
  <Pong.Help />
</Pong>
```

Leave a part out, reorder them, or add your own. Custom parts read the game through `usePongGame()`:

```jsx
import { Pong, usePongGame } from 'react-pong';

const ServeButton = () => {
  const { phase, serve } = usePongGame();
  if (phase !== 'start' && phase !== 'between') return null;
  return <button type='button' onClick={() => serve()}>Serve</button>;
};

<Pong>
  <Pong.Court />
  <Pong.Score />
  <ServeButton />
</Pong>
```

| Part | Props | |
| --- | --- | --- |
| `<Pong>` | every [option](#options), `className`, `children` | Creates the game and provides it to its parts. Options are live: change a prop and only that option updates. |
| `<Pong.Court>` | `className`, `aria-label`, `autoFocus` | The focusable playfield with the ball and paddles. `autoFocus` focuses it on mount, for pages the game owns. |
| `<Pong.Score>` | `className` | The two scores, AI on the left. The winner's scales up. |
| `<Pong.Message>` | `className` | The start, toss, countdown, pause, game over, and smack-talk copy. Smack talk fades after 5 seconds, and no line repeats within a match. For your own copy, replace it with a part of your own. |
| `<Pong.Help>` | `className` (on the overlay) | Just above the score, the "press ? for help" hint and, between games, the current difficulty above it, color-coded. Also the overlay the help key opens: every key in the current key map with what it does, including the difficulty key and the note that it doesn't work during a game, headed by the score to play to ("First to 11 wins") and followed by an advanced section ("Momentum" and "Corners") on how a moving paddle and a paddle's corners change the ball's path. A key you leave out of `keys` gets no hint and no row. |

`usePongGame()` returns the state below plus `serve()`, `pause()`, `resume()`, `reset()`, `openHelp()`, and `closeHelp()`. It re-renders only when something in the state changes, never per frame.

| State | |
| --- | --- |
| `phase` | `'start'`, `'toss'` (the first serve is being tossed for and counted down to), `'rally'`, `'paused'`, `'between'` (a point was scored; waiting for a serve), or `'gameOver'`. |
| `scores` | `{ left, right }`. |
| `winner` | `'left'`, `'right'`, or `null` until the game is over. |
| `message` | A key, not text: `'start'`, `'toss'`, `'serve.ai'` and `'serve.human'` (who won the toss, while `countdown` runs), `'smack.ai'` (the AI scored), `'smack.human'`, `'paused'`, `'gameOver'`, `'reset'` (Enter was pressed after game over), or `null`. |
| `countdown` | The number the countdown to the first serve is on, 3 to 1, or `null`. |
| `messageCount` | How many messages with this key came earlier in this match. |
| `difficulty` | The AI's difficulty right now: the `difficulty` option, until the difficulty key changes it. |
| `winningScore` | Points needed to win: the `winningScore` option with its default filled in. |
| `help` | Whether the help is open. Never during a rally. |
| `keys` | The key map in use: the `keys` option with its default filled in. |
| `matchRoll` | A random number in [0, 1) drawn at the start of each match. With `messageCount`, it lets your own copy be dealt from a deck shuffled once per match. |

`<Pong>` renders the start screen on the server and starts the game in an effect.

## Core (no framework)

```js
import { createPong } from 'react-pong/core';
import 'react-pong/styles.css';

const pong = createPong({
  court: document.querySelector('.pong-court'),
  ball: document.querySelector('.pong-ball'),
  leftPaddle: document.querySelector('.pong-paddle-left'),
  rightPaddle: document.querySelector('.pong-paddle-right'),
  leftRipple: document.querySelector('.pong-ripple-left'),
  rightRipple: document.querySelector('.pong-ripple-right'),
}, { difficulty: 'hard' });

pong.subscribe(() => console.log(pong.getState().scores));
```

`createPong(elements, options)` drives elements you provide and never adds any to the DOM. With the stylesheet, the markup is:

```html
<div class="pong">
  <div class="pong-court" tabindex="0" role="application" aria-label="Pong court">
    <div class="pong-ripple pong-ripple-left" aria-hidden="true"></div>
    <div class="pong-ripple pong-ripple-right" aria-hidden="true"></div>
    <div class="pong-ball" aria-hidden="true"></div>
    <div class="pong-paddle pong-paddle-left" aria-hidden="true"></div>
    <div class="pong-paddle pong-paddle-right" aria-hidden="true"></div>
  </div>
</div>
```

The two ripple elements are optional: leave them out and the game plays without the rings. To pulse the AI's paddle on the impossible difficulty, as `<Pong.Court>` does, add the class `pong-paddle-pulsing` to the left paddle while `getState().difficulty` is `'impossible'`.

The score, message, and help are yours to render from `getState()`: the engine handles the help and difficulty keys and reports `help`, `difficulty`, `winningScore`, and `keys` in the state.

| Method | |
| --- | --- |
| `serve()` | Serve, from the start screen or between points. With `toss`, the first serve of a match follows the toss and countdown. |
| `pause()` / `resume()` | Freeze and continue a rally. |
| `reset()` | Back to the start screen with the scores cleared. |
| `openHelp()` / `closeHelp()` | Open the help, pausing a rally first, and close it. While it is open, only the help and reset keys do anything, and both close it. Serving, resuming, or resetting from code closes it too. |
| `update(options)` | Merge new options; `undefined` restores a default. |
| `getState()` | The current state. The same object until something in it changes. |
| `subscribe(listener)` | Called when the state changes: the score, phase, message, difficulty, winning score, help, or keys. Returns the unsubscribe function. Shaped for `useSyncExternalStore`. |
| `destroy()` | Stop the loop and release every listener, observer, and the audio context. |

## Options

| Option | Default | |
| --- | --- | --- |
| `winningScore` | `11` | Points needed to win. No win-by-two. |
| `difficulty` | `'normal'` | How early the AI reacts to a ball coming at it, where it waits after sending the ball away, and how well it aims (it is off by up to 17.5% of a paddle on `'easy'`, 10% on `'normal'`, 4% on `'hard'`). `'easy'`: the third of the court nearest its paddle; waits level with where its shot will reach you. `'normal'`: its own half; waits somewhere at random. `'hard'`: the two thirds nearest its paddle; waits where a plain return will come back to. `'impossible'` has no handicap: it decides at every step, never hesitates, aims exactly, and works out where the ball will arrive the moment it is hit and goes straight there; only the speed of its paddle, the same as yours, can beat it, and its paddle glows like a watching eye the whole time, swelling and ebbing. The difficulty key steps through all four between games. At the other three levels it reacts ten times a second, moves under the same paddle speed limits as you, often swings through the ball to bend its path (against a steep ball, to flatten it), and now and then goes for a corner. |
| `smack` | `true` | Smack talk after about half the points, in the AI paddle's color. No line is repeated within a match. |
| `sound` | `true` | The wall, paddle, and point blips. Browsers allow audio only after a key press, so the first one starts it. |
| `ripple` | `true` | Rings that ripple out from the spot where the ball meets a paddle. Off under `prefers-reduced-motion`. |
| `toss` | `true` | Open each match with a toss for the first serve and a 3-2-1 countdown, about 3.6 seconds in all. Under `prefers-reduced-motion` the bouncing is skipped and only the announcement and countdown remain. `false` serves at once. Losing focus, hiding the tab, scrolling offscreen, or opening the help during it returns to the start screen. |
| `keys` | arrows, Enter, Space, Esc, ?, d | `KeyboardEvent.key` values mapped to `'up'`, `'down'`, `'serve'`, `'pause'`, `'reset'`, `'help'`, or `'difficulty'`. Replaces the whole map, so list every key you want: `{ w: 'up', s: 'down', Enter: 'serve', ' ': 'pause', Escape: 'reset', '?': 'help' }` has no difficulty key. |
| `paddleSpeed` | `1.2` | Starting paddle speed, in court heights per second, so it feels the same on any court. A paddle eases in to this speed over its first 0.08s rather than jumping to it, and a held one goes on speeding up to three times this over two seconds, and the faster it is moving when it meets the ball, the more it bends the ball's path. |
| `onPoint` | | Called with `{ scorer, scores }` after every point. |
| `onGameOver` | | Called with `{ winner, scores }` when a side wins. |
| `onDifficultyChange` | | Called with the new difficulty when the difficulty key changes it. If you pass `difficulty` from your own state, set it here so the two agree. |

## Theme

Every color and size is a custom property. Set them on the root, through `<Pong>`'s `className`:

```css
.night {
  --pong-color: #7cf;
  --pong-muted: #456;
  --pong-paddle-height: 20%;
}
```

| Property | Default | |
| --- | --- | --- |
| `--pong-color` | `#007ee5` | Your paddle, the winning score, and the base of the message and help colors. |
| `--pong-ball-color` | `#000` | The ball. |
| `--pong-paddle-left-color`, `--pong-paddle-right-color` | `#a61c28`, `--pong-color` | The AI's paddle, a dark maroon, and yours. |
| `--pong-paddle-pulse-color`, `--pong-paddle-pulse-duration` | `#ff2a1a`, `1.4s` | On the impossible difficulty the AI's paddle glows like a watching eye, swelling steadily to this hotter color and back without ever going out. The duration is one way, in or out. Off under `prefers-reduced-motion`. |
| `--pong-smack-color` | `--pong-paddle-left-color` | Smack talk, which is the AI speaking. |
| `--pong-ripple-left-color`, `--pong-ripple-right-color` | that paddle's color | The rings where the ball meets each paddle. |
| `--pong-ripple-size`, `--pong-ripple-width`, `--pong-ripple-duration` | `240px`, `2px`, `0.6s` | How wide the rings grow, how thick they are, and how long each takes. |
| `--pong-muted` | `#ccc` | Score and hint text. |
| `--pong-message-color` | `--pong-color` at 50% | Message text. |
| `--pong-focus-color` | `--pong-muted` | The court's keyboard focus outline. |
| `--pong-font` | `inherit` | The library loads no font. The original used Roboto. |
| `--pong-font-weight`, `--pong-font-weight-bold` | `100`, `700` | Text, and the divider between the scores. |
| `--pong-ball-size` | `15px` | |
| `--pong-paddle-width` | `15px` | |
| `--pong-paddle-height` | `15%` | A length, or a percentage of the court height. |
| `--pong-score-size` | `50px` | |
| `--pong-message-size`, `--pong-hint-size` | `52px`, `12px` | |
| `--pong-difficulty-easy-color`, `--pong-difficulty-normal-color`, `--pong-difficulty-hard-color`, `--pong-difficulty-impossible-color` | `#2a9d5c`, `#d9900a`, `#e0452c`, `#7a2bbf` | The difficulty shown above the score between games. |
| `--pong-help-background` | `#fff` | What the help covers the court with. Set the background to match a page that isn't white. |
| `--pong-help-color`, `--pong-help-size`, `--pong-help-font-weight` | `--pong-color` at 80%, `18px`, `400` | The help's text. It is heavier than the game's so that small type stays readable; if you load your own font, load this weight too. |

The message fade, the help's fade, and the winner's scale-up are disabled under `prefers-reduced-motion`.

## Development

```bash
pnpm install    # Node 24, pnpm 12
pnpm dev        # playground with a control for every option, at http://localhost:5318
pnpm lint
pnpm typecheck
pnpm test
pnpm build      # tsc -> dist/, plus styles.css
pnpm build:demo # playground -> demo/dist/
```

Releases: bump `version` in a pull request. Merging it to `main` builds, tags `v<version>`, creates a GitHub Release, and deploys the playground to GitHub Pages. See [`docs/PLAN.md`](docs/PLAN.md) for the design.

## Credits

A ground-up rewrite of [jasondecamp/angular-pong](https://github.com/jasondecamp/angular-pong) (2016), which was based on [strawbserve/angular-pong](https://github.com/strawbserve/angular-pong). react-pong keeps the design and the game and contains none of their code.

## License

[MIT](LICENSE)
