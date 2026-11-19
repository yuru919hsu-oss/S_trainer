// Web Audio API Driving School Buzzer
// 駕訓班黑管壓線警報音效 (電子蜂鳴器)

class BuzzerSound {
    constructor() {
        this.ctx = null;
        this.oscillator = null;
        this.gainNode = null;
        this.isPlaying = false;
    }

    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.ctx = new AudioContext();
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    startAlarm() {
        this.init();
        if (!this.ctx || this.isPlaying) return;

        try {
            this.oscillator = this.ctx.createOscillator();
            this.gainNode = this.ctx.createGain();

            // 駕訓班黑管感應器經典嗶嗶叫 (方波/鋸齒波，1180Hz)
            this.oscillator.type = 'sawtooth';
            this.oscillator.frequency.setValueAtTime(1180, this.ctx.currentTime);

            this.gainNode.gain.setValueAtTime(0.3, this.ctx.currentTime);

            this.oscillator.connect(this.gainNode);
            this.gainNode.connect(this.ctx.destination);

            this.oscillator.start();
            this.isPlaying = true;
        } catch (e) {
            console.warn('Audio start failed:', e);
        }
    }

    stopAlarm() {
        if (!this.isPlaying) return;
        try {
            if (this.oscillator) {
                this.oscillator.stop();
                this.oscillator.disconnect();
                this.oscillator = null;
            }
            this.isPlaying = false;
        } catch (e) {
            console.warn('Audio stop failed:', e);
        }
    }
}

window.buzzer = new BuzzerSound();
