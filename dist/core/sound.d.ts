export type SoundName = 'wall' | 'paddle' | 'out';
export type Sound = {
    /** Create the audio context, or wake a suspended one. Browsers only allow this during a user gesture. */
    unlock: () => void;
    /** Play a blip. Silent until `unlock` has succeeded. */
    play: (name: SoundName) => void;
    /** Close the audio context for good. */
    close: () => void;
};
/** Synthesized blips on a lazily created `AudioContext`. No audio files. */
export declare const createSound: (view: (Window & typeof globalThis) | null) => Sound;
//# sourceMappingURL=sound.d.ts.map