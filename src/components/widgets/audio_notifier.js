// Web Audio API Synthesizer for Zero-Asset Chimes and Sound Alerts
class NexusAudioNotifier {
    constructor() {
        this.ctx = null;
    }

    _initCtx() {
        if (!this.ctx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
                this.ctx = new AudioContextClass();
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {});
        }
    }

    playChime() {
        try {
            this._initCtx();
            if (!this.ctx) return;

            const now = this.ctx.currentTime;
            
            // Pleasant dual-frequency melodic chime (E5 -> B5)
            const osc1 = this.ctx.createOscillator();
            const osc2 = this.ctx.createOscillator();
            const gainNode = this.ctx.createGain();

            osc1.type = 'sine';
            osc2.type = 'sine';

            osc1.frequency.setValueAtTime(659.25, now); // E5
            osc1.frequency.exponentialRampToValueAtTime(987.77, now + 0.15); // B5

            osc2.frequency.setValueAtTime(1318.51, now + 0.1); // E6

            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(0.2, now + 0.05);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

            osc1.connect(gainNode);
            osc2.connect(gainNode);
            gainNode.connect(this.ctx.destination);

            osc1.start(now);
            osc2.start(now + 0.1);
            osc1.stop(now + 1.2);
            osc2.stop(now + 1.2);
        } catch (e) {
            console.warn('[NexusAudioNotifier] Failed to play chime:', e);
        }
    }
}

export const audioNotifier = new NexusAudioNotifier();
