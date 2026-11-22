// The original's three 8-bit wavs, measured: square waves at these pitches
// (Hz) for these lengths (seconds).
const blips = {
    wall: { frequency: 226, duration: 0.016 },
    paddle: { frequency: 459, duration: 0.096 },
    out: { frequency: 490, duration: 0.257 },
};
// The wavs peaked at about 18% of full scale.
const volume = 0.18;
/** Synthesized blips on a lazily created `AudioContext`. No audio files. */
export const createSound = (view) => {
    let context = null;
    let closed = false;
    return {
        unlock: () => {
            if (closed)
                return;
            if (context == null) {
                if (view == null || typeof view.AudioContext === 'undefined')
                    return;
                context = new view.AudioContext();
            }
            // A rejected resume leaves the game silent, which is all there is to do.
            if (context.state === 'suspended')
                context.resume().catch(() => { });
        },
        play: (name) => {
            if (context == null)
                return;
            const { frequency, duration } = blips[name];
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.type = 'square';
            oscillator.frequency.value = frequency;
            gain.gain.value = volume;
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.start();
            oscillator.stop(context.currentTime + duration);
        },
        close: () => {
            closed = true;
            // Closing can only fail on a context that is already closed.
            context?.close().catch(() => { });
            context = null;
        },
    };
};
//# sourceMappingURL=sound.js.map