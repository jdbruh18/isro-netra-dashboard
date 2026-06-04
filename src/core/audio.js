/**
 * Web Audio API Sound Synthesizer for Cyber HUD UI feedback.
 * Synthesizes sounds dynamically (prevents pathing & latency issues of MP3/WAV files).
 */

class HudAudioSystem {
  constructor() {
    this.ctx = null;
    this.humNode = null;
    this.humGain = null;
    this.alarmInterval = null;
    this.muted = false;
  }

  // Initialize Audio Context on user interaction (browser security policy)
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn("Web Audio API not supported on this browser.");
    }
  }

  // Play a brief cybernetic tick (button hover)
  playHover() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1500, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, this.ctx.currentTime + 0.03);

    gain.gain.setValueAtTime(0.005, this.ctx.currentTime); // very quiet
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.03);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.03);
  }

  // Play a click confirmation (button click)
  playClick() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, this.ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.08);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.08);
  }

  // Play double chime (command success/uplink established)
  playSuccess() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const playTone = (freq, delay, dur) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime + delay);
      
      gain.gain.setValueAtTime(0.05, this.ctx.currentTime + delay);
      gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + delay + dur);

      osc.start(this.ctx.currentTime + delay);
      osc.stop(this.ctx.currentTime + delay + dur);
    };

    playTone(880, 0, 0.12);
    playTone(1320, 0.08, 0.18);
  }

  // Toggle looping cabin ambient spaceship sound (55Hz drone)
  startHum() {
    this.init();
    if (!this.ctx || this.humNode) return;

    // Create primary low oscillator
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    this.humGain = this.ctx.createGain();
    const lowpass = this.ctx.createBiquadFilter();

    osc1.connect(lowpass);
    osc2.connect(lowpass);
    lowpass.connect(this.humGain);
    this.humGain.connect(this.ctx.destination);

    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(55, this.ctx.currentTime); // A1 note
    
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(110.5, this.ctx.currentTime); // detuned octave

    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(80, this.ctx.currentTime);

    this.humGain.gain.setValueAtTime(this.muted ? 0 : 0.03, this.ctx.currentTime);

    osc1.start();
    osc2.start();

    this.humNode = [osc1, osc2];
  }

  stopHum() {
    if (this.humNode) {
      this.humNode.forEach(n => {
        try { n.stop(); } catch (e) {}
      });
      this.humNode = null;
    }
  }

  // Rhythmic alarm sweep (Red Alert / Conjunction Danger)
  startAlarm() {
    if (this.muted) return;
    this.init();
    if (!this.ctx || this.alarmInterval) return;

    const playSiren = () => {
      if (this.muted || !this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, this.ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(660, this.ctx.currentTime + 0.35);
      osc.frequency.linearRampToValueAtTime(440, this.ctx.currentTime + 0.7);

      gain.gain.setValueAtTime(0.03, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.7);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.7);
    };

    playSiren();
    this.alarmInterval = setInterval(playSiren, 1000);
  }

  stopAlarm() {
    if (this.alarmInterval) {
      clearInterval(this.alarmInterval);
      this.alarmInterval = null;
    }
  }

  setMute(isMuted) {
    this.muted = isMuted;
    if (this.humGain) {
      this.humGain.gain.setValueAtTime(isMuted ? 0 : 0.03, this.ctx ? this.ctx.currentTime : 0);
    }
    if (isMuted) {
      this.stopAlarm();
    }
  }
}

export const audio = new HudAudioSystem();
export default audio;
