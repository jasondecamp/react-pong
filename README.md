# <img src="demo/public/favicon.svg" alt="" width="28" height="28"> react-pong

[![CI](https://github.com/jasondecamp/react-pong/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/jasondecamp/react-pong/actions/workflows/ci.yml)

Retro Pong you can embed: a framework-free Pong engine, plus a composite React component (`<Pong>`) that drops a playfield into any React app.

Play it in the [playground](https://pong.fourfightingfoxes.com/).

- You play the right paddle against an AI on the left, at four difficulties, the last of them with no handicap at all. First to 11 wins. A toss decides the first serve, and after that whoever scores serves next.
- A good guest on the host page: keys are heard only while the court has focus, nothing is global, any number of games can share a page, and unmounting releases everything.
- Delta-time physics: the same speed at 60Hz and 120Hz, and a fast ball can't tunnel through a paddle.
- A ball with a speed and an angle: serves leave at a steady pace, each paddle hit adds 5% and takes some of the slant off the ball's path, a moving paddle drags the ball its own way, and the corners of a paddle send it off steeply, even when the paddle catches the ball with its end after the ball has slipped past its face.
- Attract mode: until you serve, the start screen plays itself, AI against AI, like an arcade cabinet waiting for a coin.
- Rings ripple out from the spot where the ball meets a paddle, the ball takes its color from where it is on the court and leaves a fading trail, and a paddle one point from winning glows, all in plain CSS.
- Light and dark palettes, following the system setting unless you choose one.
- 8-bit blips synthesized with Web Audio. No asset files.
- The loop idles whenever nothing moves: between points, paused, game over, offscreen, or on a start screen without attract mode.

## Install

Releases are git tags with the built files, installed straight from GitHub:

```bash
pnpm add github:jasondecamp/react-pong#semver:^0.2.0
# or pin one release: github:jasondecamp/react-pong#v0.2.0
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

It paints its own background and follows the visitor's system setting for light or dark. On a page that doesn't follow the system setting, say which the page is: `<Pong theme='light' />` or `<Pong theme='dark' />`.

### Controls

Click the court (or tab to it) to give it the keyboard. Keys the game handles don't scroll the page; every other key passes through.

| Key | |
| --- | --- |
| Up, Down | Move your paddle. It speeds up the longer you hold. |
| Enter | Serve. On the start screen this ends attract mode, in which the AI plays both paddles and your keys do nothing. The first serve of a match is tossed for: the ball bounces between the paddles and settles on the side that won, which is announced with a 3-2-1 countdown before the ball leaves. You can move your paddle while it counts. |
| Space | Pause and resume. |
| Esc | After game over, reset. |
| ? | Show the keys, pausing a rally first. ? or Esc closes them, and the rally stays paused until you resume it with Space. |
| 2 | With a two-player server set, open the two-player panel from the start screen. See [Two-player](#two-player). |
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
| `<Pong>` | every [option](#options), `theme`, `className`, `children` | Creates the game and provides it to its parts. Options are live: change a prop and only that option updates. `theme` is `'system'` (the default: follow the system's light or dark setting), `'light'`, or `'dark'`. |
| `<Pong.Court>` | `className`, `aria-label`, `autoFocus` | The focusable playfield with the ball and paddles. `autoFocus` focuses it on mount, for pages the game owns. A paddle whose side is one point from winning glows. |
| `<Pong.Score>` | `className` | The two scores, AI on the left. The winner's scales up. |
| `<Pong.Message>` | `className` | The start, toss, countdown, pause, game over, and smack-talk copy. Smack talk fades after 5 seconds, and no line repeats within a match. For your own copy, replace it with a part of your own. |
| `<Pong.Help>` | `className` (on the overlay) | Just above the score, the "press ? for help" hint and, between games, the current difficulty above it, color-coded. Also the overlay the help key opens: every key in the current key map with what it does, including the difficulty key and the note that it doesn't work during a game, headed by the score to play to ("First to 11 wins") and followed by an advanced section ("Momentum" and "Corners") on how a moving paddle and a paddle's corners change the ball's path. A key you leave out of `keys` gets no hint and no row. |
| `<Pong.Lobby>` | `className` (on the panel) | Two-player: the "press 2 for two player" hint on the start screen, and the panel that key opens, for creating a lobby or joining one by its code. It renders nothing without the `server` option. |

`usePongGame()` returns the state below plus `serve()`, `pause()`, `resume()`, `reset()`, `openHelp()`, `closeHelp()`, and for two-player `openLobby()`, `closeLobby()`, `createLobby()`, `joinLobby(code)`, `setReady(ready)`, and `leaveLobby()`. It re-renders only when something in the state changes, never per frame.

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
| `lobby` | Two-player, or `null` without the `server` option: `open` (the panel), `status` (`'idle'`, `'connecting'`, `'waiting'` in a lobby, `'playing'`), `code`, `link`, `invitation` (a code this game was handed to join with), `error`, `notice`, `ready`, `opponent` (`{ ready, connected }` or `null`), `winningScore`, and `pause` (`{ by, reason }` while a match is paused). In a match, `message` can also be `'serve.opponent'`, `'toServe.you'`, `'toServe.opponent'`, `'paused.opponent'`, `'away.opponent'`, `'disconnected.opponent'`, `'reconnecting'`, `'resuming'`, `'won'`, or `'lost'`. |
| `matchRoll` | A random number in [0, 1) drawn at the start of each match. With `messageCount`, it lets your own copy be dealt from a deck shuffled once per match. |

`<Pong>` renders the start screen on the server and starts the game in an effect.

## Core (no framework)

```js
import { createPong } from 'react-pong/core';
import 'react-pong/styles.css';

const pong = createPong({
  court: document.querySelector('.pong-court'),
  ball: document.querySelector('.pong-court > .pong-ball'),
  ballColor: document.querySelector('.pong-court > .pong-ball > .pong-ball-color'),
  leftPaddle: document.querySelector('.pong-paddle-left'),
  rightPaddle: document.querySelector('.pong-paddle-right'),
  leftRipple: document.querySelector('.pong-ripple-left'),
  rightRipple: document.querySelector('.pong-ripple-right'),
  trail: document.querySelector('.pong-trail'),
}, { difficulty: 'hard' });

pong.subscribe(() => console.log(pong.getState().scores));
```

`createPong(elements, options)` drives elements you provide and never adds any to the DOM. With the stylesheet, the markup is:

```html
<div class="pong">
  <div class="pong-court" tabindex="0" role="application" aria-label="Pong court">
    <div class="pong-ripple pong-ripple-left" aria-hidden="true"></div>
    <div class="pong-ripple pong-ripple-right" aria-hidden="true"></div>
    <div class="pong-trail" aria-hidden="true">
      <!-- ten of these -->
      <div class="pong-ball"><div class="pong-ball-color"></div></div>
    </div>
    <div class="pong-ball" aria-hidden="true">
      <div class="pong-ball-color"></div>
    </div>
    <div class="pong-paddle pong-paddle-left" aria-hidden="true"></div>
    <div class="pong-paddle pong-paddle-right" aria-hidden="true"></div>
  </div>
</div>
```

The two ripple elements are optional: leave them out and the game plays without the rings. The trail is optional too: its children are ghosts of the ball, built like the ball, that the `trail` option leaves behind it in turn, one every 0.05 seconds. Each is used again once the rest have been, so ten cover the default 0.5 second fade; give it more if you lengthen `--pong-trail-duration`. The ghosts share the ball's class, so select the ball itself as a child of the court. So is the ball's color element: without it the ball is one flat color (`--pong-ball-color`, or `--pong-color`).

The engine adds no classes for looks that follow from the state, so these are yours to add, as `<Pong.Court>` does:

- `pong-paddle-pulsing` on the left paddle while `getState().difficulty` is `'impossible'`.
- `pong-paddle-game-point` on a paddle while its side's score is `winningScore - 1` and the phase is neither `'start'` nor `'gameOver'`.
- `pong-light` or `pong-dark` on the root to fix the palette; with neither it follows the system setting.
- `pong-court-standard` on the court while `getState().lobby?.status` is `'waiting'` or `'playing'`, which tints the box around the standard court.

For two-player, also give the engine a `frame` element (`<div class="pong-frame" aria-hidden="true"></div>`, the court's first child), which it sizes to the standard court, and build the lobby's controls on `openLobby()`, `createLobby()`, `joinLobby(code)`, `setReady(ready)`, and `leaveLobby()`.

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
| `attract` | `true` | Attract mode: on the start screen the AI plays both paddles at the current difficulty, rally after rally. Nothing scores, it makes no sound, and your paddle keys do nothing until you serve, which clears the court for the real game. It plays whether or not the court has focus, rests while the help is open or the court is offscreen, and comes back after a reset. Off under `prefers-reduced-motion`. |
| `smack` | `true` | Smack talk after about half the points, in the AI paddle's color. No line is repeated within a match. |
| `sound` | `true` | The wall, paddle, and point blips. Browsers allow audio only after a key press, so the first one starts it. |
| `ripple` | `true` | Rings that ripple out from the spot where the ball meets a paddle. Off under `prefers-reduced-motion`. |
| `trail` | `true` | A fading trail behind the ball: every 0.05 seconds it leaves a ghost of itself where it is, which stays put and fades away, so the ghosts sit further apart as the ball speeds up. Off under `prefers-reduced-motion`. |
| `toss` | `true` | Open each match with a toss for the first serve and a 3-2-1 countdown, about 3.6 seconds in all. Under `prefers-reduced-motion` the bouncing is skipped and only the announcement and countdown remain. `false` serves at once. Losing focus, hiding the tab, scrolling offscreen, or opening the help during it returns to the start screen. |
| `keys` | arrows, Enter, Space, Esc, ?, d | `KeyboardEvent.key` values mapped to `'up'`, `'down'`, `'serve'`, `'pause'`, `'reset'`, `'help'`, or `'difficulty'`. Replaces the whole map, so list every key you want: `{ w: 'up', s: 'down', Enter: 'serve', ' ': 'pause', Escape: 'reset', '?': 'help' }` has no difficulty key. |
| `paddleSpeed` | `1.2` | Starting paddle speed, in court heights per second, so it feels the same on any court. A paddle eases in to this speed over its first 0.08s rather than jumping to it, and a held one goes on speeding up to three times this over two seconds, and the faster it is moving when it meets the ball, the more it bends the ball's path. |
| `server` | none | The two-player server's address, such as `wss://your-server.example.workers.dev`. Without it there is no two-player. See [Two-player](#two-player). |
| `lobbyLink` | this page's address with `?pong=<code>` | A function from a lobby's code to the link that brings another player to it, for a page that routes its own links. |
| `lobbyCode` | the page's `pong` parameter | A lobby code to offer to join: the panel opens with it in its field. |
| `onPoint` | | Called with `{ scorer, scores }` after every point. |
| `onGameOver` | | Called with `{ winner, scores }` when a side wins. |
| `onDifficultyChange` | | Called with the new difficulty when the difficulty key changes it. If you pass `difficulty` from your own state, set it here so the two agree. |

## Theme

There are two palettes, light and dark. With `theme='system'`, the default, the dark one applies when the visitor's system is set to dark (`prefers-color-scheme`); `theme='light'` and `theme='dark'` fix it, by adding `pong-light` or `pong-dark` to the root. The dark palette changes only the properties marked below.

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
| `--pong-background` | `#fff`; dark `#111` | What the court is painted with. `transparent` shows the page through. |
| `--pong-paddle-left-color`, `--pong-paddle-right-color` | `#a61c28` (dark `#c42b38`), `--pong-color` | The AI's paddle, a dark maroon, and yours. |
| `--pong-ball-left-color`, `--pong-ball-right-color` | the right paddle's color, the left paddle's | The ball's color against the left wall and against the right one. In between it is a mix of the two, so a ball coming at you wears your opponent's color. |
| `--pong-ball-color` | none | Set it to make the ball this one color wherever it is. |
| `--pong-paddle-left-glow-color`, `--pong-paddle-right-glow-color` | none: that paddle's color | The glow of a paddle whose side is one point from winning. It follows the paddle's color unless you set this. Off under `prefers-reduced-motion`. |
| `--pong-paddle-pulse-color` | none: a hotter shade of the paddle's color | On the impossible difficulty the AI's paddle glows like a watching eye, swelling steadily to this color and back without ever going out. Left unset, it is worked out from the paddle's color (lighter and more vivid, in the same hue), so a custom paddle color gets a matching glow; browsers without relative colors use the paddle's color itself. Off under `prefers-reduced-motion`. |
| `--pong-paddle-pulse-duration` | `1.4s` | How long a glow takes one way, in or out. It times the game-point glow too. |
| `--pong-paddle-pulse-game-point-color` | `#000`; dark `#fff` | What that eye swells to instead once the AI is one point from winning. |
| `--pong-smack-color` | `--pong-paddle-left-color` | Smack talk, which is the AI speaking. |
| `--pong-trail-opacity` | `0.5` | How strong each ghost in the ball's trail is when the ball leaves it. The ghosts take the ball's size, shape, and colors. |
| `--pong-trail-duration` | `0.5s` | How long a ghost takes to fade away. `Pong.Court` has ghosts enough for `0.5s`; a longer fade cuts the oldest short. |
| `--pong-ripple-left-color`, `--pong-ripple-right-color` | that paddle's color | The rings where the ball meets each paddle. |
| `--pong-ripple-size`, `--pong-ripple-width`, `--pong-ripple-duration` | `240px`, `2px`, `0.6s` | How wide the rings grow, how thick they are, and how long each takes. |
| `--pong-muted` | `#ccc`; dark `#555` | Score and hint text. |
| `--pong-message-color` | `--pong-color` at 50% | Message text. |
| `--pong-focus-color` | `--pong-muted` | The court's keyboard focus outline. |
| `--pong-font` | `inherit` | The library loads no font. The original used Roboto. |
| `--pong-font-weight`, `--pong-font-weight-bold` | `100`, `700` | Text, and the divider between the scores. |
| `--pong-ball-size` | `15px` | |
| `--pong-ball-radius` | `0` | How round the ball's corners are: `0` is the square ball, `50%` a round one. Only its look changes; it still meets the walls and paddles as a square. |
| `--pong-paddle-width` | `15px` | |
| `--pong-paddle-height` | `15%` | A length, or a percentage of the court height. |
| `--pong-score-size` | `50px` | |
| `--pong-message-size`, `--pong-hint-size` | `52px`, `12px` | |
| `--pong-difficulty-easy-color`, `--pong-difficulty-normal-color`, `--pong-difficulty-hard-color`, `--pong-difficulty-impossible-color` | `#2a9d5c`, `#d9900a`, `#e0452c`, `#7a2bbf` (dark `#a05ce6`) | The difficulty shown above the score between games. |
| `--pong-help-background` | `--pong-background` | What the help covers the court with. |
| `--pong-bar-color` | `--pong-muted` at 30%, see-through | In a two-player match, what tints the box around the standard court where the two differ in shape. Keep it see-through: the score or a hint that lands in a bar shows through it. |
| `--pong-help-color`, `--pong-help-size`, `--pong-help-font-weight` | `--pong-color` at 80%, `18px`, `400` | The help's text. It is heavier than the game's so that small type stays readable; if you load your own font, load this weight too. |

The message fade, the help's fade, and the winner's scale-up are disabled under `prefers-reduced-motion`.

## Two-player

Two people in two browsers can play each other. One creates a lobby and shares its four-letter code, or the link that carries it; the other opens the link, or types the code in. When both say they are ready, the first serve is tossed for and the match begins.

It needs a server, which this repository contains (`server/`, a Cloudflare Worker) but which each site runs for itself. Give `<Pong>` its address and the rest is built in:

```jsx
<Pong server='wss://your-server.example.workers.dev' />
```

- Both players see themselves on the right.
- A match is played on one standard court, 16 by 9, scaled to fit each player's box, so both see exactly the same game whatever the shape of their page. The ball's and paddles' sizes and the paddle speed are the standard court's; colors, fonts, the palette, sound, ripples, the trail, and keys stay each player's own.
- It is played to the lobby creator's `winningScore`. There is no AI, so no difficulty and no smack talk.
- After the toss, each point is served by whoever scored the last one, with the serve key.
- Space pauses for both players, and only the player who paused can resume, after a 3-2-1 countdown. Losing focus, hiding the tab, or opening the help pauses too. A dropped connection has 30 seconds to come back by itself before the match is abandoned.
- After a match both players are back in the lobby, where being ready again starts another. Esc leaves, outside a rally.
- The game is played with a keyboard: a touch-only device can join a lobby but not move a paddle.

## Development

```bash
pnpm install    # Node 24, pnpm 12
pnpm dev        # playground with a control for every option, at http://localhost:5318
pnpm dev:server # the two-player server, run locally at http://localhost:8787; the playground in dev uses it
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
