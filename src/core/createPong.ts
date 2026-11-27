import { createLobbyClient } from './lobby.js';
import type { LobbyClient } from './lobby.js';
import type { NetMessage } from './messages.js';
import { createNetLink, standardCourt } from './net.js';
import type { NetLink } from './net.js';
import { difficulties, initialState, resolveOptions } from './options.js';
import { createSimulation } from './simulation.js';
import type { Direction } from './simulation.js';
import { createSound } from './sound.js';
import type {
  PongElements,
  PongInstance,
  PongKeys,
  PongLobby,
  PongLobbyStatus,
  PongMessageKey,
  PongOptions,
  PongState,
  ResolvedPongOptions,
} from './types.js';

const round = (value: number) => Math.round(value * 100) / 100;

// With smack talk on, the chance that a point draws a remark.
const smackChance = 0.5;

/** An element the engine can move: one with inline styles, whichever window it belongs to. */
const styled = (element: Element | null): element is HTMLElement => element != null && 'style' in element;

// How often the ball leaves a ghost behind, in seconds.
const trailInterval = 0.05;
// On a ghost, the classes that fade it out. The two do the same; swapping one for the other starts the fade over.
const trailClass = 'pong-trail-fade';
const trailAgainClass = 'pong-trail-fade-again';

// The parameter of a page's address that carries a lobby's code.
const lobbyParameter = 'pong';
// After a pause, the countdown to play shows each number for this long, in ms.
const resumeCountInterval = 600;

// On a ripple element, the class that runs its rings.
const rippleClass = 'pong-ripple-active';

const sameKeys = (a: PongKeys, b: PongKeys) => {
  const names = Object.keys(a);
  return names.length === Object.keys(b).length && names.every((name) => a[name] === b[name]);
};

/**
 * Run a game of Pong on existing elements. The court is measured with a
 * ResizeObserver, so size it with CSS. Keys are heard only while the court has
 * focus. The game opens on the start screen and waits for a serve.
 */
export const createPong = (elements: PongElements, initialOptions: PongOptions = {}): PongInstance => {
  const { court, ball, ballColor, leftPaddle, rightPaddle, leftRipple, rightRipple, trail, frame: courtFrame } = elements;
  const view = court.ownerDocument.defaultView;
  let rawOptions: PongOptions = { ...initialOptions };
  let options: ResolvedPongOptions = resolveOptions(rawOptions);
  let destroyed = false;
  let visible = true;
  let frame: number | null = null;
  let lastTime: number | null = null;
  let upHeld = false;
  let downHeld = false;
  // The direction key pressed most recently, which wins while both are held.
  let latest: Direction = 0;
  // Where CSS rests each paddle, which the transforms are measured from.
  let leftRest = 0;
  let rightRest = 0;
  // Each match shuffles its copy afresh, and counts the remarks made for each side's points.
  let matchRoll = Math.random();
  let aiRemarks = 0;
  let humanRemarks = 0;
  // Whether the help is open. It never is during a rally.
  let help = false;
  // Two-player. The connection exists while the `server` option is set.
  let client: LobbyClient | null = null;
  let link: NetLink | null = null;
  // The two-player panel is open over the court.
  let lobbyOpen = false;
  // The court is the standard one and the left paddle another player's: from a lobby's first match until it is left.
  let twoPlayer = false;
  // A match is under way.
  let playing = false;
  // The match is paused, by either player, and nothing moves. `frozenAt` is when, on the server's clock.
  let frozen = false;
  let frozenAt = 0;
  // The number the countdown out of a pause is on, or 0.
  let resumeCount = 0;
  // After a pause, this game is the one to say where the ball is, at its next step.
  let syncDue = false;
  let matchTimer: number | null = null;
  // The server's time at the end of the step being taken, which is when everything it sends describes.
  let stepTime = 0;
  // What the other player's game has sent since the last step.
  const inbound: { message: NetMessage; time: number }[] = [];
  // Where the standard court sits in the box, and how much it is scaled to fit. Single-player is the box itself.
  // `right` is the bar on the right, which may differ from `x`, the bar on the
  // left, by a device pixel. `pixel` is how many device pixels a px is.
  const layout = { scale: 1, x: 0, y: 0, right: 0, pixel: 1 };
  /** To the nearest device pixel, so that pieces drawn side by side meet exactly. */
  const snap = (value: number) => Math.round(value * layout.pixel) / layout.pixel;
  // A code this game was handed to join with, by the page's address.
  let addressCode: string | null = null;
  try {
    addressCode = new URLSearchParams(view?.location.search ?? '').get(lobbyParameter);
  } catch {
    addressCode = null;
  }
  let state: PongState = {
    ...initialState,
    matchRoll,
    difficulty: options.difficulty,
    winningScore: options.winningScore,
    keys: options.keys,
  };
  const listeners = new Set<() => void>();

  // Asked for once and read each time: the trail checks it at every frame.
  const motionQuery = view?.matchMedia?.('(prefers-reduced-motion: reduce)');
  const reducedMotion = () => motionQuery?.matches === true;

  /**
   * Whether the start screen should be playing itself. Reduced motion turns
   * attract mode off, and it rests behind the two-player panel and for as
   * long as this game is in a lobby.
   */
  const attracting = () => options.attract && !reducedMotion() && !lobbyOpen && !twoPlayer;

  /** Points needed to win: the lobby's in two-player, and otherwise the option. */
  const winningScore = () => (twoPlayer ? client?.state.lobby?.winningScore : undefined) ?? options.winningScore;

  const simulation = createSimulation(Math.random);
  const applyOptions = () => simulation.setOptions({
    winningScore: winningScore(),
    difficulty: options.difficulty,
    // Two-player is played at the standard court's speed, whatever each player's own is set to.
    paddleSpeed: twoPlayer ? standardCourt.paddleSpeed : options.paddleSpeed,
    attract: attracting(),
  });
  applyOptions();
  const sound = createSound(view);

  /** Replace the snapshot from the simulation and tell the subscribers. */
  const publish = (message: PongMessageKey | null, messageCount = 0) => {
    const { phase, scores, winner, countdown } = simulation.state;
    const { difficulty, keys } = options;
    let count: number | null = countdown > 0 ? countdown : null;
    if (resumeCount > 0) count = resumeCount;
    state = {
      // A paused match is frozen whatever the ball was doing.
      phase: playing && frozen ? 'paused' : phase,
      scores: { ...scores },
      winner,
      message,
      messageCount,
      matchRoll,
      countdown: count,
      difficulty,
      winningScore: winningScore(),
      help,
      keys,
      lobby: lobbySnapshot(),
    };
    listeners.forEach((listener) => listener());
  };

  /** The link that brings another player to a lobby: the embedder's, or this page's address with the code added. */
  const lobbyLink = (code: string) => {
    if (options.lobbyLink != null) return options.lobbyLink(code);
    try {
      const address = new URL(view?.location.href ?? '');
      address.searchParams.set(lobbyParameter, code);
      return address.href;
    } catch {
      return null;
    }
  };

  const lobbySnapshot = (): PongLobby | null => {
    if (client == null) return null;
    const { status, lobby, error, notice } = client.state;
    let lobbyStatus: PongLobbyStatus = 'idle';
    if (status === 'connecting') lobbyStatus = 'connecting';
    else if (lobby != null) lobbyStatus = playing ? 'playing' : 'waiting';
    return {
      open: lobbyOpen,
      status: lobbyStatus,
      code: lobby?.code ?? null,
      link: lobby == null ? null : lobbyLink(lobby.code),
      invitation: options.lobbyCode ?? addressCode,
      error,
      notice,
      ready: lobby?.ready === true,
      opponent: lobby?.opponent ?? null,
      winningScore: lobby?.winningScore ?? options.winningScore,
      pause: lobby?.pause ?? null,
    };
  };

  /** What a two-player match has to say right now, worked out from where it stands. */
  const matchMessage = (): PongMessageKey | null => {
    if (lobbyOpen || client == null) return null;
    const { phase, server, winner } = simulation.state;
    if (client.state.status === 'reconnecting') return 'reconnecting';
    if (resumeCount > 0) return 'resuming';
    const pause = client.state.lobby?.pause;
    if (pause != null) {
      if (pause.by === 'you') return 'paused';
      if (pause.reason === 'disconnected') return 'disconnected.opponent';
      return pause.reason === 'away' ? 'away.opponent' : 'paused.opponent';
    }
    if (phase === 'gameOver') return winner === 'right' ? 'won' : 'lost';
    if (phase === 'between') return server === 'right' ? 'toServe.you' : 'toServe.opponent';
    if (phase === 'rally') return null;
    // The toss, and the countdown that follows once it has settled on a side.
    if (simulation.state.countdown > 0) return server === 'right' ? 'serve.human' : 'serve.opponent';
    return 'toss';
  };

  /** Publish again with the message that fits: a match's is worked out, and anything else keeps its own. */
  const refresh = () => {
    if (twoPlayer) publish(matchMessage());
    else publish(lobbyOpen ? null : state.message, state.messageCount);
  };

  const inputDirection = (): Direction => {
    if (upHeld && downHeld) return latest;
    if (upHeld) return -1;
    return downHeld ? 1 : 0;
  };

  // The trail: at a steady interval the ball leaves a ghost of itself where
  // it is, which stays put while the stylesheet fades it out. The ghosts are
  // used in turn, so the oldest is the next to be left behind.
  const ghosts: HTMLElement[] = [];
  const ghostColors: (HTMLElement | null)[] = [];
  for (const ghost of Array.from(trail?.children ?? [])) {
    if (!styled(ghost)) continue;
    const color = ghost.firstElementChild;
    ghosts.push(ghost);
    ghostColors.push(styled(color) ? color : null);
  }
  // The next ghost to leave, and which of the two fade classes this turn through the ghosts uses.
  let trailNext = 0;
  let trailAgain = false;
  // How long since the last ghost was left, on a clock that runs only while the ball is moving.
  let trailDue = 0;
  // Where the ball was before the latest step, if it has been moving since.
  let trailFromX = 0;
  let trailFromY = 0;
  let trailFrom = false;
  let trailShown = false;

  const trailing = () => options.trail && ghosts.length > 0 && !reducedMotion();

  const clearTrail = () => {
    for (let index = 0; index < ghosts.length; index++) {
      const ghost = ghosts[index];
      const color = ghostColors[index];
      if (ghost == null) continue;
      ghost.style.transform = '';
      ghost.classList.remove(trailClass, trailAgainClass);
      if (color != null) color.style.transform = '';
    }
    trailShown = false;
  };

  /**
   * Where a ball's color element goes for a ball `offset` px from the court's
   * left edge: stretched from the ball's width to the court's and slid
   * opposite the ball. It runs a ball's width past the court at each end,
   * because the edge of something magnified this much is soft, and at the
   * court's edge it would otherwise show inside the ball.
   */
  const colorTransform = (offset: number) => {
    const { width, ballWidth } = simulation.state;
    return `translateX(${round(-offset - ballWidth * layout.scale)}px) scaleX(${round(width / ballWidth + 2)})`;
  };

  /** Leave the next ghost at a spot on the court, colored for it, and start its fade. */
  const leaveGhost = (x: number, y: number) => {
    const { ballWidth } = simulation.state;
    const ghost = ghosts[trailNext];
    const color = ghostColors[trailNext];
    if (ghost == null) return;
    ghost.style.transform = `translate(${round(layout.x + x * layout.scale)}px, ${round(layout.y + y * layout.scale)}px)`;
    if (color != null && ballWidth > 0) {
      color.style.transform = colorTransform(x * layout.scale);
    }
    ghost.classList.remove(trailAgain ? trailClass : trailAgainClass);
    ghost.classList.add(trailAgain ? trailAgainClass : trailClass);
    trailNext = (trailNext + 1) % ghosts.length;
    if (trailNext === 0) trailAgain = !trailAgain;
    trailShown = true;
  };

  /**
   * Leave the ghosts that came due during a step of `dt` seconds, each where the ball was at its moment, so they
   * are evenly spaced at any frame rate.
   */
  const trackTrail = (dt: number) => {
    const { ball: ballState } = simulation.state;
    if (!trailing()) {
      if (trailShown) clearTrail();
      trailFrom = false;
      return;
    }
    // A ball at rest (parked, or stopped by a point) leaves nothing new; the ghosts it left fade where they are.
    if (ballState.speed === 0) {
      trailDue = 0;
      trailFrom = false;
      return;
    }
    trailDue += dt;
    while (trailDue >= trailInterval) {
      trailDue -= trailInterval;
      const back = trailFrom && dt > 0 ? Math.min(trailDue / dt, 1) : 0;
      leaveGhost(ballState.x - (ballState.x - trailFromX) * back, ballState.y - (ballState.y - trailFromY) * back);
    }
    trailFromX = ballState.x;
    trailFromY = ballState.y;
    trailFrom = true;
  };

  const render = () => {
    const { ball: ballState, left, right, ballWidth } = simulation.state;
    const { scale, x, y } = layout;
    // In a match everything sits on whole device pixels: a ball beside or behind a paddle then lines up with it.
    const ballX = twoPlayer ? snap(x + ballState.x * scale) : round(ballState.x);
    const ballY = twoPlayer ? snap(y + ballState.y * scale) : round(ballState.y);
    ball.style.transform = `translate(${ballX}px, ${ballY}px)`;
    // The ball is a window onto its color element, which spans the court and stays put while the ball moves.
    if (ballColor != null && ballWidth > 0) {
      ballColor.style.transform = colorTransform(ballX - x);
    }
    if (twoPlayer) {
      // The standard court sits inside the box, so its paddles come in from the box's edges to the court's.
      leftPaddle.style.transform = `translate(${round(x)}px, ${snap(y + (left.y + left.offset) * scale - leftRest)}px)`;
      rightPaddle.style.transform = `translate(${round(-layout.right)}px, ${snap(y + right.y * scale - rightRest)}px)`;
    } else {
      leftPaddle.style.transform = `translateY(${round(left.y + left.offset - leftRest)}px)`;
      rightPaddle.style.transform = `translateY(${round(right.y - rightRest)}px)`;
    }
  };

  /** Move the struck paddle's ripple to where the ball touched it, and start its rings again. */
  const ripple = () => {
    const { side, x, y } = simulation.state.contact;
    const element = side === 'left' ? leftRipple : rightRipple;
    if (element == null) return;
    element.style.transform = `translate(${round(layout.x + x * layout.scale)}px, ${round(layout.y + y * layout.scale)}px)`;
    // A CSS animation starts over only once the browser has seen the element without it.
    element.classList.remove(rippleClass);
    element.getBoundingClientRect();
    element.classList.add(rippleClass);
  };

  // The loop runs during a rally and the toss before it, on the start screen
  // in attract mode (unless the help covers it), and otherwise only while a
  // paddle key is held: the paddle moves between points too, as in the original.
  const shouldRun = () => {
    const { phase, width, height } = simulation.state;
    if (destroyed || !visible || width <= 0 || height <= 0) return false;
    // A match runs the whole time, so that the other player's news is taken in as it comes; a lobby between matches doesn't.
    if (twoPlayer) return playing && !frozen;
    if (phase === 'start' && attracting() && !help) return true;
    return phase === 'rally' || phase === 'toss' || (phase !== 'paused' && inputDirection() !== 0);
  };

  const tick = (time: number) => {
    frame = null;
    const dt = lastTime == null ? 0 : (time - lastTime) / 1000;
    lastTime = time;
    if (playing && client != null && link != null) {
      stepTime = client.serverNow();
      for (let index = 0; index < inbound.length; index++) {
        const report = inbound[index];
        if (report != null) link.receive(report.message, Math.max(0, stepTime - report.time) / 1000);
      }
      inbound.length = 0;
    }
    const events = simulation.step(dt, inputDirection());
    if (playing && link != null) {
      link.report(events, dt);
      if (syncDue) link.sync();
      syncDue = false;
    }
    // Attract rallies are silent.
    const audible = options.sound && !simulation.state.attract;
    for (let index = 0; index < events.length; index++) {
      const event = events[index];
      if (event === 'wall' || event === 'paddle') {
        if (audible) sound.play(event);
        if (event === 'paddle' && options.ripple) ripple();
      } else if (event === 'point') {
        scored();
      } else if (event === 'toss' || event === 'count') {
        // The toss has settled on a server, or the countdown has moved on a number.
        if (options.sound) sound.play('wall');
        if (twoPlayer) refresh();
        else publish(simulation.state.server === 'left' ? 'serve.ai' : 'serve.human');
      } else if (event === 'serve') {
        if (twoPlayer) refresh();
        else publish(null);
      }
    }
    trackTrail(dt);
    render();
    if (shouldRun()) frame = view?.requestAnimationFrame(tick) ?? null;
  };

  const scored = () => {
    const { scorer, winner } = simulation.state;
    if (scorer == null) return;
    if (options.sound) sound.play('out');
    // Smack talk is the AI's; a match between two people has none.
    if (twoPlayer) refresh();
    else if (winner != null) publish('gameOver');
    else if (!options.smack || Math.random() >= smackChance) publish(null);
    else if (scorer === 'left') publish('smack.ai', aiRemarks++);
    else publish('smack.human', humanRemarks++);
    options.onPoint?.({ scorer, scores: state.scores });
    if (winner != null) options.onGameOver?.({ winner, scores: state.scores });
  };

  const stopLoop = () => {
    if (frame != null) view?.cancelAnimationFrame(frame);
    frame = null;
  };

  /** Schedule the loop if it should be running and isn't. */
  const wake = () => {
    if (frame != null || !shouldRun()) return;
    lastTime = null;
    frame = view?.requestAnimationFrame(tick) ?? null;
  };

  const clearMatchTimer = () => {
    if (matchTimer != null) view?.clearTimeout(matchTimer);
    matchTimer = null;
  };

  /** Size and place the pieces for the standard court, scaled to fit the box, or hand their sizes back to the stylesheet. */
  const sizePieces = () => {
    const sized = [ball, leftPaddle, rightPaddle, ...ghosts];
    if (!twoPlayer) {
      for (const piece of sized) {
        piece.style.width = '';
        piece.style.height = '';
      }
      if (courtFrame != null) {
        courtFrame.style.width = '';
        courtFrame.style.height = '';
        courtFrame.style.transform = '';
      }
      return;
    }
    const { scale, x, y } = layout;
    // Drawn at their true size on screen, not magnified from a smaller one, so a large screen loses nothing.
    const ballSize = `${round(standardCourt.ballSize * scale)}px`;
    for (const piece of [ball, ...ghosts]) {
      piece.style.width = ballSize;
      piece.style.height = ballSize;
    }
    for (const paddle of [leftPaddle, rightPaddle]) {
      paddle.style.width = `${round(standardCourt.paddleWidth * scale)}px`;
      paddle.style.height = `${round(standardCourt.paddleHeight * scale)}px`;
    }
    if (courtFrame != null) {
      courtFrame.style.width = `${round(standardCourt.width * scale)}px`;
      courtFrame.style.height = `${round(standardCourt.height * scale)}px`;
      courtFrame.style.transform = `translate(${round(x)}px, ${round(y)}px)`;
    }
  };

  /** Stop everything in a match until the pause is over. News of the other player is still taken in, as of now. */
  const freeze = () => {
    if (frozen || client == null) return;
    frozen = true;
    frozenAt = client.serverNow();
    releaseKeys();
    stopLoop();
  };

  /** A pause is over: count down to `at`, on the server's clock, and carry on. */
  const thaw = (at: number) => {
    if (client == null || !playing) return;
    clearMatchTimer();
    const left = at - client.serverNow();
    if (left > 0) {
      resumeCount = Math.max(1, Math.ceil(left / resumeCountInterval));
      refresh();
      // Wake for the next number, or for the end of the count.
      matchTimer = view?.setTimeout(() => thaw(at), left - (resumeCount - 1) * resumeCountInterval) ?? null;
      return;
    }
    resumeCount = 0;
    frozen = false;
    const { ball: ballState, phase, awaiting } = simulation.state;
    // The two games stopped at different moments. The one the ball is coming
    // to says where it is, and the other takes its word. It says so at its
    // next step, since a step's end is the moment every report is of.
    syncDue = phase === 'rally' && ballState.heading === 1 && !awaiting;
    refresh();
    wake();
  };

  /** A match begins: the standard court, the other player on the left, and the toss at `at` on the server's clock. */
  const startMatch = (server: 'you' | 'opponent', at: number) => {
    if (client == null) return;
    const lobbyClient = client;
    clearMatchTimer();
    twoPlayer = true;
    playing = true;
    frozen = false;
    resumeCount = 0;
    lobbyOpen = false;
    help = false;
    inbound.length = 0;
    releaseKeys();
    simulation.reset();
    simulation.setRemote(true);
    applyOptions();
    link = createNetLink(simulation, (message) => lobbyClient.game(message, stepTime));
    matchRoll = Math.random();
    measure();
    // The keys are heard only while the court has focus, and the panel's button had it.
    court.focus({ preventScroll: true });
    matchTimer = view?.setTimeout(() => {
      matchTimer = null;
      simulation.toss(!reducedMotion(), server === 'you' ? 'right' : 'left');
      refresh();
      render();
      wake();
    }, Math.max(0, at - lobbyClient.serverNow())) ?? null;
    refresh();
    wake();
  };

  /** The match is over, won, abandoned, or left by the other player: back to the lobby, with the court as it stood. */
  const endMatch = () => {
    clearMatchTimer();
    // The news that ended the match may be waiting still: the other player's last miss. Take it in first.
    if (link != null && inbound.length > 0) {
      for (const report of inbound) link.receive(report.message, 0);
      const events = simulation.step(0.001, 0);
      if (events.includes('point')) scored();
    }
    playing = false;
    frozen = false;
    resumeCount = 0;
    syncDue = false;
    inbound.length = 0;
    releaseKeys();
    stopLoop();
    // A match that didn't reach its end leaves nothing worth showing.
    if (simulation.state.phase !== 'gameOver') simulation.reset();
    lobbyOpen = true;
    help = false;
    render();
  };

  /** Out of the lobby altogether: the court and the left paddle are this game's own again. */
  const leaveTwoPlayer = () => {
    clearMatchTimer();
    twoPlayer = false;
    playing = false;
    frozen = false;
    resumeCount = 0;
    link = null;
    inbound.length = 0;
    simulation.setRemote(false);
    simulation.reset();
    applyOptions();
    measure();
  };

  /** The connection's state changed: follow it. */
  const onLobbyChange = () => {
    if (client == null) return;
    const { status, lobby } = client.state;
    if (twoPlayer && (status === 'idle' || lobby == null)) {
      leaveTwoPlayer();
      publish(lobbyOpen ? null : 'start');
      wake();
      return;
    }
    if (playing && lobby != null) {
      if (lobby.phase === 'lobby') endMatch();
      else if (lobby.pause != null || status === 'reconnecting') freeze();
    }
    refresh();
  };

  const openLobby = () => {
    if (destroyed || client == null || lobbyOpen || playing) return;
    if (simulation.state.phase !== 'start' && !twoPlayer) return;
    releaseKeys();
    help = false;
    lobbyOpen = true;
    // Attract mode rests behind the panel.
    applyOptions();
    render();
    refresh();
  };

  const closeLobby = () => {
    // A lobby is left, not closed: the panel stays for as long as this game is in one.
    if (destroyed || client == null || !lobbyOpen || client.state.status !== 'idle') return;
    lobbyOpen = false;
    applyOptions();
    publish('start');
    wake();
  };

  const createLobby = () => {
    if (destroyed || client == null || client.state.status !== 'idle') return;
    client.create(options.winningScore);
  };

  const joinLobby = (code: string) => {
    if (destroyed || client == null || client.state.status !== 'idle') return;
    client.join(code);
  };

  const setReady = (ready: boolean) => {
    if (destroyed || playing) return;
    client?.ready(ready);
  };

  const leaveLobby = () => {
    if (destroyed || client == null) return;
    lobbyOpen = false;
    if (client.state.status === 'idle') {
      applyOptions();
      publish('start');
      wake();
      return;
    }
    // Leaving changes the connection's state, which is followed from there.
    client.leave();
    applyOptions();
    publish('start');
    wake();
  };

  /** Connect to the server the `server` option names, or to none. */
  const connectLobby = () => {
    client?.leave();
    client = null;
    if (options.server == null || view == null || typeof view.WebSocket !== 'function') return;
    client = createLobbyClient(options.server, view, {
      onChange: onLobbyChange,
      onStart: startMatch,
      onResume: thaw,
      onGame: (message, time) => {
        if (!playing) return;
        if (frozen) {
          // Sent before the other game heard of the pause: it counts, as of the moment this one stopped.
          link?.receive(message, Math.max(0, frozenAt - time) / 1000);
          return;
        }
        inbound.push({ message, time });
      },
    });
  };

  const serve = () => {
    if (destroyed) return;
    if (twoPlayer) {
      // In a match only this player's own serves are theirs to make, and none while it is paused.
      if (!playing || frozen || link?.serve() !== true) return;
      refresh();
      wake();
      return;
    }
    if (options.toss && simulation.state.phase === 'start') {
      // A match opens with a toss for the first serve; the ball follows by itself.
      // An unmeasured court has nowhere to toss the ball.
      if (simulation.state.width <= 0 || simulation.state.height <= 0) return;
      simulation.toss(!reducedMotion());
      help = false;
      publish('toss');
      render();
      wake();
      return;
    }
    simulation.serve();
    if (simulation.state.phase !== 'rally' || state.phase === 'rally') return;
    help = false;
    publish(null);
    render();
    wake();
  };

  const pause = () => {
    if (destroyed) return;
    if (twoPlayer) {
      // A match is paused for both players by the server, which says so in the lobby's state.
      if (playing && !frozen) client?.pause('manual');
      return;
    }
    if (simulation.state.phase !== 'rally') return;
    simulation.pause();
    stopLoop();
    publish('paused');
  };

  const resume = () => {
    if (destroyed) return;
    if (twoPlayer) {
      // Only the player whose pause it is can end it; the server sees to that.
      if (playing && frozen && resumeCount === 0) client?.resume();
      return;
    }
    if (simulation.state.phase !== 'paused') return;
    simulation.resume();
    help = false;
    publish(null);
    wake();
  };

  const reset = () => {
    if (destroyed) return;
    if (twoPlayer) {
      leaveLobby();
      return;
    }
    simulation.reset();
    matchRoll = Math.random();
    aiRemarks = 0;
    humanRemarks = 0;
    help = false;
    publish('start');
    render();
    wake();
  };

  const releaseKeys = () => {
    upHeld = false;
    downHeld = false;
  };

  const update = (nextOptions: PongOptions) => {
    if (destroyed) return;
    const previousKeys = options.keys;
    const previousServer = options.server;
    const previousCode = options.lobbyCode;
    const wasAttracting = simulation.state.attract;
    rawOptions = { ...rawOptions, ...nextOptions };
    options = resolveOptions(rawOptions);
    if (options.server !== previousServer) {
      const wasTwoPlayer = twoPlayer;
      lobbyOpen = false;
      connectLobby();
      if (wasTwoPlayer) leaveTwoPlayer();
    }
    applyOptions();
    // Attract mode starts and stops with its option: a rally it ended has left the court.
    if (wasAttracting !== (simulation.state.phase === 'start' && attracting())) {
      render();
      wake();
    }
    // The snapshot carries the keys, the difficulty, and the winning score, so it changes only when they do.
    const keysChanged = !sameKeys(previousKeys, options.keys);
    if (!keysChanged) options.keys = previousKeys;
    if (
      keysChanged
      || options.difficulty !== state.difficulty
      || winningScore() !== state.winningScore
      || options.server !== previousServer
      || options.lobbyCode !== previousCode
    ) {
      refresh();
    }
  };

  // The difficulty is the player's to change between games, never during one.
  const stepDifficulty = () => {
    const { phase } = simulation.state;
    if (twoPlayer || (phase !== 'start' && phase !== 'gameOver')) return;
    const index = difficulties.indexOf(options.difficulty);
    const difficulty = difficulties[(index + 1) % difficulties.length] ?? options.difficulty;
    update({ difficulty });
    options.onDifficultyChange?.(difficulty);
  };

  /** Stop play for a court that can't be played on: freeze a rally, and call off a toss. */
  const standDown = () => {
    if (twoPlayer) {
      // The other player is told this one is away, and the match waits.
      if (playing && !frozen) client?.pause('away');
    } else if (simulation.state.phase === 'toss') {
      reset();
    } else {
      pause();
    }
  };

  const openHelp = () => {
    if (destroyed || help) return;
    releaseKeys();
    if (twoPlayer) {
      // A match waits under the help, as it does for anything else that takes this player away.
      help = true;
      standDown();
      refresh();
      return;
    }
    // A toss is called off; a rally is paused under the help.
    if (simulation.state.phase === 'toss') reset();
    help = true;
    if (simulation.state.phase === 'rally') pause();
    else publish(state.message, state.messageCount);
  };

  const closeHelp = () => {
    if (destroyed || !help) return;
    help = false;
    refresh();
    wake();
  };

  // Keys with a modifier are the browser's or the host page's shortcuts.
  const actionFor = (event: KeyboardEvent) => (
    event.altKey || event.ctrlKey || event.metaKey ? undefined : options.keys[event.key]
  );

  const onKeyDown = (event: KeyboardEvent) => {
    const action = actionFor(event);
    if (action == null) return;
    event.preventDefault();
    // A key press is the gesture browsers require before any audio.
    if (options.sound) sound.unlock();
    if (help) {
      // Under the help, only the keys that close it do anything.
      if (!event.repeat && (action === 'help' || action === 'reset')) closeHelp();
      return;
    }
    if (lobbyOpen) {
      // Under the two-player panel: leave or close it, or say this player is ready.
      if (event.repeat) return;
      const waiting = client?.state.status === 'joined';
      if (action === 'reset') leaveLobby();
      else if (action === 'lobby' && !waiting) closeLobby();
      else if (action === 'serve' && waiting) setReady(client?.state.lobby?.ready !== true);
      return;
    }
    if (action === 'up') {
      upHeld = true;
      latest = -1;
    } else if (action === 'down') {
      downHeld = true;
      latest = 1;
    } else if (event.repeat) {
      return;
    } else if (action === 'help') {
      openHelp();
    } else if (twoPlayer) {
      // A match has no difficulty, and it is left, outside a rally, rather than reset.
      if (action === 'serve') serve();
      else if (action === 'reset' && (simulation.state.phase !== 'rally' || frozen)) leaveLobby();
      else if (action === 'pause' && frozen) resume();
      else if (action === 'pause') pause();
    } else if (action === 'lobby') {
      openLobby();
    } else if (action === 'difficulty') {
      stepDifficulty();
    } else if (action === 'serve') {
      // After the game has ended, serving only says how to start another.
      if (simulation.state.phase === 'gameOver') publish('reset');
      else serve();
    } else if (action === 'reset') {
      // Only a finished game can be reset from the keyboard, as in the original.
      if (simulation.state.phase === 'gameOver') reset();
    } else if (simulation.state.phase === 'paused') {
      resume();
    } else {
      pause();
    }
    wake();
  };

  const onKeyUp = (event: KeyboardEvent) => {
    const action = options.keys[event.key];
    if (action == null) return;
    if (action === 'up') upHeld = false;
    else if (action === 'down') downHeld = false;
  };

  // No keyup arrives once focus is gone, so let go of the paddle too.
  const onBlur = () => {
    releaseKeys();
    standDown();
  };

  const onVisibilityChange = () => {
    if (court.ownerDocument.hidden) {
      releaseKeys();
      standDown();
    }
  };

  const measure = () => {
    if (twoPlayer) {
      // The standard court, as large as fits in the box and centered in it.
      const { width, height, ballSize, paddleWidth, paddleHeight } = standardCourt;
      const fit = Math.min(court.clientWidth / width, court.clientHeight / height);
      // The largest court that fits whose ball is a whole number of device
      // pixels wide. The paddles are as wide as the ball and the court a
      // whole number of balls across, so every edge then falls on a pixel.
      layout.pixel = view?.devicePixelRatio || 1;
      const ballPixels = Math.floor(fit * ballSize * layout.pixel);
      layout.scale = ballPixels >= 1 ? ballPixels / (ballSize * layout.pixel) : fit;
      layout.x = snap((court.clientWidth - width * layout.scale) / 2);
      layout.y = snap((court.clientHeight - height * layout.scale) / 2);
      layout.right = court.clientWidth - layout.x - width * layout.scale;
      simulation.setBounds(width, height, ballSize, ballSize, paddleWidth, paddleHeight);
      sizePieces();
    } else {
      layout.scale = 1;
      layout.x = 0;
      layout.y = 0;
      layout.right = 0;
      layout.pixel = 1;
      sizePieces();
      simulation.setBounds(
        court.clientWidth,
        court.clientHeight,
        ball.clientWidth,
        ball.clientHeight,
        leftPaddle.clientWidth,
        leftPaddle.clientHeight,
      );
    }
    leftRest = leftPaddle.offsetTop;
    rightRest = rightPaddle.offsetTop;
    render();
    wake();
  };

  const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
  resizeObserver?.observe(court);

  const intersectionObserver = typeof IntersectionObserver === 'undefined'
    ? null
    : new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry == null) return;
      visible = entry.isIntersecting;
      if (visible) {
        wake();
      } else {
        standDown();
        stopLoop();
      }
    });
  intersectionObserver?.observe(court);

  court.addEventListener('keydown', onKeyDown);
  court.addEventListener('keyup', onKeyUp);
  court.addEventListener('blur', onBlur);
  court.ownerDocument.addEventListener('visibilitychange', onVisibilityChange);

  connectLobby();
  measure();
  // A page reached by a lobby's link opens on the panel, with the code waiting in its field.
  if (client != null && (options.lobbyCode ?? addressCode) != null) openLobby();
  else if (client != null) refresh();

  return {
    serve,
    pause,
    resume,
    reset,
    openHelp,
    closeHelp,
    openLobby,
    closeLobby,
    createLobby,
    joinLobby,
    setReady,
    leaveLobby,
    update,
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    destroy: () => {
      if (destroyed) return;
      clearMatchTimer();
      client?.leave();
      client = null;
      twoPlayer = false;
      sizePieces();
      destroyed = true;
      stopLoop();
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      court.removeEventListener('keydown', onKeyDown);
      court.removeEventListener('keyup', onKeyUp);
      court.removeEventListener('blur', onBlur);
      court.ownerDocument.removeEventListener('visibilitychange', onVisibilityChange);
      sound.close();
      listeners.clear();
      // Hand the pieces back to the stylesheet, which draws the start screen.
      ball.style.transform = '';
      if (ballColor != null) ballColor.style.transform = '';
      leftPaddle.style.transform = '';
      rightPaddle.style.transform = '';
      clearTrail();
      for (const element of [leftRipple, rightRipple]) {
        if (element == null) continue;
        element.style.transform = '';
        element.classList.remove(rippleClass);
      }
    },
  };
};
