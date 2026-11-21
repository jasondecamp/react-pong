import { difficulties, initialState, resolveOptions } from './options.js';
import { createSimulation } from './simulation.js';
import type { Direction } from './simulation.js';
import { createSound } from './sound.js';
import type {
  PongElements,
  PongInstance,
  PongKeys,
  PongMessageKey,
  PongOptions,
  PongState,
  ResolvedPongOptions,
} from './types.js';

const round = (value: number) => Math.round(value * 100) / 100;

// With smack talk on, the chance that a point draws a remark.
const smackChance = 0.5;

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
  const { court, ball, leftPaddle, rightPaddle, leftRipple, rightRipple } = elements;
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
  let state: PongState = {
    ...initialState,
    matchRoll,
    difficulty: options.difficulty,
    winningScore: options.winningScore,
    keys: options.keys,
  };
  const listeners = new Set<() => void>();

  const simulation = createSimulation(Math.random);
  simulation.setOptions(options);
  const sound = createSound(view);

  /** Replace the snapshot from the simulation and tell the subscribers. */
  const publish = (message: PongMessageKey | null, messageCount = 0) => {
    const { phase, scores, winner, countdown } = simulation.state;
    const { difficulty, winningScore, keys } = options;
    state = {
      phase,
      scores: { ...scores },
      winner,
      message,
      messageCount,
      matchRoll,
      countdown: countdown > 0 ? countdown : null,
      difficulty,
      winningScore,
      help,
      keys,
    };
    listeners.forEach((listener) => listener());
  };

  const inputDirection = (): Direction => {
    if (upHeld && downHeld) return latest;
    if (upHeld) return -1;
    return downHeld ? 1 : 0;
  };

  const render = () => {
    const { ball: ballState, left, right } = simulation.state;
    ball.style.transform = `translate(${round(ballState.x)}px, ${round(ballState.y)}px)`;
    leftPaddle.style.transform = `translateY(${round(left.y - leftRest)}px)`;
    rightPaddle.style.transform = `translateY(${round(right.y - rightRest)}px)`;
  };

  /** Move the struck paddle's ripple to where the ball touched it, and start its rings again. */
  const ripple = () => {
    const { side, x, y } = simulation.state.contact;
    const element = side === 'left' ? leftRipple : rightRipple;
    if (element == null) return;
    element.style.transform = `translate(${round(x)}px, ${round(y)}px)`;
    // A CSS animation starts over only once the browser has seen the element without it.
    element.classList.remove(rippleClass);
    element.getBoundingClientRect();
    element.classList.add(rippleClass);
  };

  // The loop runs during a rally and the toss before it, and otherwise only
  // while a paddle key is held: the paddle moves between points too, as in the original.
  const shouldRun = () => {
    const { phase, width, height } = simulation.state;
    if (destroyed || !visible || width <= 0 || height <= 0) return false;
    return phase === 'rally' || phase === 'toss' || (phase !== 'paused' && inputDirection() !== 0);
  };

  const tick = (time: number) => {
    frame = null;
    const dt = lastTime == null ? 0 : (time - lastTime) / 1000;
    lastTime = time;
    const events = simulation.step(dt, inputDirection());
    for (let index = 0; index < events.length; index++) {
      const event = events[index];
      if (event === 'wall' || event === 'paddle') {
        if (options.sound) sound.play(event);
        if (event === 'paddle' && options.ripple) ripple();
      } else if (event === 'point') {
        scored();
      } else if (event === 'toss' || event === 'count') {
        // The toss has settled on a server, or the countdown has moved on a number.
        if (options.sound) sound.play('wall');
        publish(simulation.state.server === 'left' ? 'serve.ai' : 'serve.human');
      } else if (event === 'serve') {
        publish(null);
      }
    }
    render();
    if (shouldRun()) frame = view?.requestAnimationFrame(tick) ?? null;
  };

  const scored = () => {
    const { scorer, winner } = simulation.state;
    if (scorer == null) return;
    if (options.sound) sound.play('out');
    if (winner != null) publish('gameOver');
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

  const reducedMotion = () => view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

  const serve = () => {
    if (destroyed) return;
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
    if (destroyed || simulation.state.phase !== 'rally') return;
    simulation.pause();
    stopLoop();
    publish('paused');
  };

  const resume = () => {
    if (destroyed || simulation.state.phase !== 'paused') return;
    simulation.resume();
    help = false;
    publish(null);
    wake();
  };

  const reset = () => {
    if (destroyed) return;
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
    rawOptions = { ...rawOptions, ...nextOptions };
    options = resolveOptions(rawOptions);
    simulation.setOptions(options);
    // The snapshot carries the keys, the difficulty, and the winning score, so it changes only when they do.
    const keysChanged = !sameKeys(previousKeys, options.keys);
    if (!keysChanged) options.keys = previousKeys;
    if (keysChanged || options.difficulty !== state.difficulty || options.winningScore !== state.winningScore) {
      publish(state.message, state.messageCount);
    }
  };

  // The difficulty is the player's to change between games, never during one.
  const stepDifficulty = () => {
    const { phase } = simulation.state;
    if (phase !== 'start' && phase !== 'gameOver') return;
    const index = difficulties.indexOf(options.difficulty);
    const difficulty = difficulties[(index + 1) % difficulties.length] ?? options.difficulty;
    update({ difficulty });
    options.onDifficultyChange?.(difficulty);
  };

  /** Stop play for a court that can't be played on: freeze a rally, and call off a toss. */
  const standDown = () => {
    if (simulation.state.phase === 'toss') reset();
    else pause();
  };

  const openHelp = () => {
    if (destroyed || help) return;
    releaseKeys();
    // A toss is called off; a rally is paused under the help.
    if (simulation.state.phase === 'toss') reset();
    help = true;
    if (simulation.state.phase === 'rally') pause();
    else publish(state.message, state.messageCount);
  };

  const closeHelp = () => {
    if (destroyed || !help) return;
    help = false;
    publish(state.message, state.messageCount);
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
    simulation.setBounds(
      court.clientWidth,
      court.clientHeight,
      ball.clientWidth,
      ball.clientHeight,
      leftPaddle.clientWidth,
      leftPaddle.clientHeight,
    );
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

  measure();

  return {
    serve,
    pause,
    resume,
    reset,
    openHelp,
    closeHelp,
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
      leftPaddle.style.transform = '';
      rightPaddle.style.transform = '';
      for (const element of [leftRipple, rightRipple]) {
        if (element == null) continue;
        element.style.transform = '';
        element.classList.remove(rippleClass);
      }
    },
  };
};
