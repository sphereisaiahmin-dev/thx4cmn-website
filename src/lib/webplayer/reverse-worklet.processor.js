class ReverseTransportProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.channels = [];
    this.channelCount = 0;
    this.length = 0;
    this.trackSampleRate = sampleRate;
    this.playheadFrame = 0;
    this.direction = 1;
    this.rate = 1;
    this.playing = false;
    this.loopStartFrame = null;
    this.loopEndFrame = null;
    this.loopEnabled = false;
    this.telemetryCounter = 0;

    this.port.onmessage = (event) => {
      const message = event.data || {};
      switch (message.type) {
        case 'LOAD_TRACK_BUFFER':
          this.channels = Array.isArray(message.channels) ? message.channels : [];
          this.channelCount = Number(message.channelCount) || this.channels.length || 0;
          this.length = Number(message.length) || 0;
          this.trackSampleRate = Number(message.sampleRate) || sampleRate;
          this.playheadFrame = clampFrame(Number(message.initialFrame) || 0, this.length);
          this.playing = false;
          break;
        case 'SET_PLAYHEAD':
          this.playheadFrame = clampFrame(Number(message.frame) || 0, this.length);
          break;
        case 'SET_DIRECTION':
          this.direction = message.direction === -1 ? -1 : 1;
          break;
        case 'SET_RATE':
          this.rate = Number.isFinite(message.rate) && message.rate > 0 ? message.rate : 1;
          break;
        case 'SET_PLAYING':
          this.playing = Boolean(message.playing);
          break;
        case 'SET_LOOP':
          this.loopStartFrame =
            Number.isFinite(message.startFrame) && message.startFrame !== null
              ? clampFrame(Number(message.startFrame), this.length)
              : null;
          this.loopEndFrame =
            Number.isFinite(message.endFrame) && message.endFrame !== null
              ? clampFrame(Number(message.endFrame), this.length)
              : null;
          this.loopEnabled =
            Boolean(message.enabled) &&
            this.loopStartFrame !== null &&
            this.loopEndFrame !== null &&
            this.loopEndFrame > this.loopStartFrame;
          if (this.loopEnabled) {
            if (this.playheadFrame < this.loopStartFrame) {
              this.playheadFrame = this.loopStartFrame;
            } else if (this.playheadFrame > this.loopEndFrame) {
              this.playheadFrame = this.loopEndFrame;
            }
          }
          break;
        default:
          break;
      }
    };
  }

  process(_, outputs) {
    const output = outputs[0];
    if (!output) return true;

    const frameCount = output[0] ? output[0].length : 128;
    const hasTrack = this.length > 0 && this.channels.length > 0;
    const sampleRateRatio = this.trackSampleRate / sampleRate;
    const frameStep = this.direction * this.rate * sampleRateRatio;

    const loopActive =
      this.loopEnabled &&
      this.loopStartFrame !== null &&
      this.loopEndFrame !== null &&
      this.loopEndFrame > this.loopStartFrame;

    for (let i = 0; i < frameCount; i += 1) {
      if (loopActive) {
        if (this.direction === -1 && this.playheadFrame <= this.loopStartFrame) {
          this.playheadFrame = this.loopEndFrame;
          this.port.postMessage({ type: 'LOOPED', frame: this.playheadFrame });
        } else if (this.direction === 1 && this.playheadFrame >= this.loopEndFrame) {
          this.playheadFrame = this.loopStartFrame;
          this.port.postMessage({ type: 'LOOPED', frame: this.playheadFrame });
        }
      }

      const atBoundary = loopActive
        ? false
        : this.direction === -1
        ? this.playheadFrame <= 0
        : this.playheadFrame >= this.length - 1;

      if (!hasTrack || !this.playing || atBoundary) {
        for (let outCh = 0; outCh < output.length; outCh += 1) {
          output[outCh][i] = 0;
        }
        if (hasTrack && this.playing && atBoundary) {
          this.playheadFrame = clampFrame(this.playheadFrame, this.length);
          this.playing = false;
          this.port.postMessage({
            type: 'BOUNDARY_REACHED',
            frame: this.playheadFrame,
          });
        }
        continue;
      }

      const distanceToEdge = Math.min(this.playheadFrame, this.length - 1 - this.playheadFrame);
      const edgeGain = Math.min(1, distanceToEdge / 48);

      for (let outCh = 0; outCh < output.length; outCh += 1) {
        const channelSource = this.channels[outCh] || this.channels[0];
        output[outCh][i] = readSample(channelSource, this.playheadFrame) * edgeGain;
      }

      this.playheadFrame += frameStep;
    }

    this.telemetryCounter += frameCount;
    if (this.telemetryCounter >= 2048) {
      this.telemetryCounter = 0;
      this.port.postMessage({ type: 'CURRENT_FRAME', frame: this.playheadFrame, playing: this.playing });
    }

    return true;
  }
}

function clampFrame(frame, length) {
  if (!length || !Number.isFinite(frame)) return 0;
  return Math.min(Math.max(frame, 0), length - 1);
}

function readSample(channelData, frame) {
  if (!channelData || !channelData.length) return 0;
  const base = Math.floor(frame);
  const next = Math.min(base + 1, channelData.length - 1);
  const frac = frame - base;
  return channelData[base] + (channelData[next] - channelData[base]) * frac;
}

registerProcessor('reverse-transport-processor', ReverseTransportProcessor);
