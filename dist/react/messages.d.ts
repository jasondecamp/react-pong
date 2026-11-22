import type { PongMessageKey } from '../core/types.js';
export type MessageCopy = {
    text: string;
    /** Set smaller, in muted capitals, under the text. */
    hint?: string;
};
export declare const isSmack: (key: PongMessageKey | null) => key is "smack.ai" | "smack.human";
/**
 * The copy for a message. Smack lines are dealt from a deck shuffled by the
 * match's roll: the `count`th remark of a match gets the `count`th card, so
 * none repeats until the deck has been dealt.
 */
export declare const messageCopy: (key: PongMessageKey, count: number, matchRoll: number) => MessageCopy;
//# sourceMappingURL=messages.d.ts.map