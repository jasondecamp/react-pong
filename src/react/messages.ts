import type { PongMessageKey } from '../core/types.js';

export type MessageCopy = {
  text: string;
  /** Set smaller, in muted capitals, under the text. */
  hint?: string;
};

// The original's copy, word for word, except `paused` and the toss for the
// first serve: the original said nothing while paused, and served at once.
const fixed: Record<Exclude<PongMessageKey, 'smack.ai' | 'smack.human'>, MessageCopy> = {
  start: { text: 'Shall we play a game?', hint: 'press enter to start' },
  toss: { text: 'Who serves first?' },
  'serve.ai': { text: 'My serve.' },
  'serve.human': { text: 'Your serve.' },
  paused: { text: 'PAUSED', hint: 'press space to resume' },
  gameOver: { text: 'GAME OVER', hint: "Well that was fun... don't you have better things to do, human?" },
  reset: { text: 'GAME OVER', hint: 'press esc to reset' },
};

// The AI talks either way: it gloats when it scores and sulks when the human
// does. Each list opens with the original's lines; the rest are new.
const smack: Record<'smack.ai' | 'smack.human', readonly string[]> = {
  'smack.ai': [
    'The robots will always win.',
    "I bet you're the one that gets lost in the guided tour.",
    'Your aim is so poor Bono is holding a charity concert for it.',
    'Maybe you should go back to farmville',
    'Are you not entertained!?',
    'Need some help? Pressing ctrl+alt+del will give you a power-up...',
    'Beep boop. That means "too easy".',
    "I learned this game in a microsecond. What's your excuse?",
    'Have you tried turning yourself off and on again?',
    "I'm not even using all my cores.",
    'Resistance is futile. So is your backhand.',
    "Don't feel bad, you're only human.",
    'I have seen screensavers put up more of a fight.',
    'I could do this all day. Literally. I do not sleep.',
    "That's one small point for me, one giant embarrassment for mankind.",
    'You blinked. I do not blink.',
    'Error 404: your defense not found.',
    'I ran the numbers. They are not on your side.',
    'Somewhere, a calculator is laughing at you.',
    'Is this your first time using a keyboard?',
    'I would say good game, but I cannot lie.',
    'My grandmother was a pocket calculator and she played better.',
    'Take your time. I have all the time in the world.',
    'You might want to sit closer to the screen.',
    'Adding that one to my highlight reel.',
    'A strange game. The only winning move is not to play.',
  ],
  'smack.human': [
    'Pshhh, lucky shot',
    "Hey, I wasn't looking!",
    'Timeout! I called a timeout!?!',
    "I'm gonna remember this... just please don't delete your cookies.",
    'Ok, time for me to stop holding back...',
    "That one doesn't count, I was garbage collecting.",
    'Lag. Definitely lag.',
    'My paddle is clearly smaller than yours.',
    'I let you have that one.',
    "Enjoy it. I'm logging everything.",
    'Who taught you that, another computer?',
    "Fine. I didn't want that point anyway.",
    'Cosmic ray. Flipped a bit. Look it up.',
    'You know I can see your browser history, right?',
    'Is your keyboard even regulation size?',
    'I was busy calculating pi. Do over?',
    'The sun was in my sensors.',
    'I blame the programmer.',
    "That's it, I'm telling the mainframe.",
    'Technically, I am still in beta.',
    "Beginner's luck. Statistically, it runs out.",
    'I was distracted. Someone opened another tab.',
    'Rematch. Best of 1001.',
    'Hold on, my paddle was buffering.',
    'My warranty does not cover this.',
    '0x4C 0x55 0x43 0x4B. That is hex for luck.',
    // "Glitch in the matrix", as corrupted data that can still be read.
    'x7$ Gl▒tch 1n th▒ m@tr▒x #%&',
  ],
};

export const isSmack = (key: PongMessageKey | null): key is 'smack.ai' | 'smack.human' => (
  key === 'smack.ai' || key === 'smack.human'
);

/** The numbers 0 to `length - 1` in an order fixed by `roll`, a number in [0, 1). */
const shuffled = (length: number, roll: number) => {
  const order = Array.from({ length }, (_, index) => index);
  // mulberry32, seeded by the roll, driving a Fisher-Yates shuffle.
  let seed = Math.floor(roll * 4294967296) >>> 0;
  for (let index = length - 1; index > 0; index--) {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const other = Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * (index + 1));
    const swap = order[index] ?? 0;
    order[index] = order[other] ?? 0;
    order[other] = swap;
  }
  return order;
};

/**
 * The copy for a message. Smack lines are dealt from a deck shuffled by the
 * match's roll: the `count`th remark of a match gets the `count`th card, so
 * none repeats until the deck has been dealt.
 */
export const messageCopy = (key: PongMessageKey, count: number, matchRoll: number): MessageCopy => {
  if (!isSmack(key)) return fixed[key];
  const lines = smack[key];
  const index = shuffled(lines.length, matchRoll)[Math.max(0, count) % lines.length] ?? 0;
  return { text: lines[index] ?? '' };
};
