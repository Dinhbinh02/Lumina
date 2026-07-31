/**
 * Lumina Gemini Live AudioWorklet PCM Processor
 * Captures 16kHz audio stream on dedicated audio thread for low-latency transmission.
 */
class PCMWorkletProcessor extends AudioWorkletProcessor {
    process(inputs) {
        const input = inputs[0];
        if (input && input.length > 0) {
            this.port.postMessage(input[0]);
        }
        return true;
    }
}

registerProcessor('pcm-worklet-processor', PCMWorkletProcessor);
