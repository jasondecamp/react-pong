import { initialState, resolveOptions } from './options.js';
import { createSimulation } from './simulation.js';
import type { Direction } from './simulation.js';
import { createSound } from './sound.js';
import type {
  PongElements,
  PongInstance,
  PongMessageKey,
  PongOptions,
  PongState,
  ResolvedPongOptions,
} from './types.js';

const round = (value: number) => Math.round(value * 100) / 100;

// With smack talk on, the chance that a point draws a remark.
const smackChance = 0.5;

/**
 * Run a game of Pong on existing elements. The court is measured with a
 * ResizeObserver, so size it with CSS. Keys are heard only while the court has
 * focus. The game opens on the start screen and waits for a serve.
 */
export const createPong = (elements: PongElements, initialOptions: PongOptions = {}): PongInstance => {
  const { court, ball, leftPaddle, rightPaddle } = elements;
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
  let state: PongState = { ...initialState, matchRoll };
  const listeners = new Set<() => void>();

  const simulation = createSimulation(Math.random);
  simulation.setOptions(options);
  const sound = createSound(view);

  /** Replace the snapshot from the simulation and tell the subscribers. */
  const publish = (message: PongMessageKey | null, messageCount = 0) => {
    const { phase, scores, winner } = simulation.state;
    state = { phase, scores: { ...scores }, winner, message, messageCount, matchRoll };
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

  // The loop runs during a rally, and otherwise only while a paddle key is
  // held: the paddle moves between points too, as in the original.
  const shouldRun = () => {
    const { phase, width, height } = simulation.state;
    if (destroyed || !visible || width <= 0 || height <= 0) return false;
    return phase === 'rally' || (phase !== 'paused' && inputDirection() !== 0);
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
      } else if (event === 'point') {
        scored();
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

  const serve = () => {
    if (destroyed) return;
    simulation.serve();
    if (simulation.state.phase !== 'rally' || state.phase === 'rally') return;
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
    publish(null);
    wake();
  };

  const reset = () => {
    if (destroyed) return;
    simulation.reset();
    matchRoll = Math.random();
    aiRemarks = 0;
    humanRemarks = 0;
    publish('start');
    render();
    wake();
  };

  const releaseKeys = () => {
    upHeld = false;
    downHeld = false;
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
    if (action === 'up') {
      upHeld = true;
      latest = -1;
    } else if (action === 'down') {
      downHeld = true;
      latest = 1;
    } else if (event.repeat) {
      return;
    } else if (action === 'serve') {
      // After the game has ended, serving only says how to start another.
      if (simulation.state.phase === 'gameOver') publish('reset');
      else serve();
    } else if (simulation.state.phase === 'gameOver') {
      reset();
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
    pause();
  };

  const onVisibilityChange = () => {
    if (court.ownerDocument.hidden) {
      releaseKeys();
      pause();
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
        pause();
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
    update: (nextOptions) => {
      if (destroyed) return;
      rawOptions = { ...rawOptions, ...nextOptions };
      options = resolveOptions(rawOptions);
      simulation.setOptions(options);
    },
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
    },
  };
};
