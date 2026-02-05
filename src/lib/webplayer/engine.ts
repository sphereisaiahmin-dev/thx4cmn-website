type EffectNode = {
  id: string;
  node: AudioNode;
};

type CachedTrackBuffers = {
  forward: AudioBuffer;
  reversed: AudioBuffer;
  duration: number;
};

const FADE_SECONDS = 0.01;
const START_EPSILON_SECONDS = 0.0001;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export class WebPlayerEngine {
  private context: AudioContext | null = null;
  private entryGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private effects: EffectNode[] = [];
  private source: AudioBufferSourceNode | null = null;
  private sourceGain: GainNode | null = null;
  private buffersByUrl = new Map<string, CachedTrackBuffers>();
  private currentUrl: string | null = null;
  private currentBuffers: CachedTrackBuffers | null = null;
  private isPlaying = false;
  private isReversed = false;
  private playbackRate = 1;
  private playStartCtxTime = 0;
  // Forward timeline offset (seconds) at the moment the current segment started.
  // We keep this in forward time even when reversed, then map to buffer offset as duration - t.
  private playStartOffsetSec = 0;

  private async ensureContext(resumeIfSuspended = false) {
    if (!this.context) {
      this.context = new AudioContext();
      this.entryGain = this.context.createGain();
      this.masterGain = this.context.createGain();
      this.rebuildGraph();
    }
    if (resumeIfSuspended && this.context.state !== 'running') {
      await this.context.resume();
    }
    return this.context;
  }

  setEffectChain(nodes: EffectNode[]) {
    this.effects = nodes;
    this.rebuildGraph();
    if (this.source && this.entryGain && this.sourceGain) {
      this.source.disconnect();
      this.sourceGain.disconnect();
      this.source.connect(this.sourceGain);
      this.sourceGain.connect(this.entryGain);
    }
  }

  private rebuildGraph() {
    if (!this.context || !this.entryGain || !this.masterGain) return;
    this.entryGain.disconnect();
    this.masterGain.disconnect();
    this.effects.forEach((effect) => effect.node.disconnect());

    const chain: AudioNode[] = [this.entryGain, ...this.effects.map((effect) => effect.node), this.masterGain];
    chain.forEach((node, index) => {
      if (index < chain.length - 1) {
        node.connect(chain[index + 1]);
      }
    });
    this.masterGain.connect(this.context.destination);
  }

  async load(url: string) {
    await this.ensureContext();
    this.stopSourceNow();
    this.currentUrl = url;
    this.currentBuffers = await this.getOrCreateBuffers(url);
    this.isReversed = false;
    this.isPlaying = false;
    this.playStartOffsetSec = 0;
    this.playStartCtxTime = this.context?.currentTime ?? 0;
  }

  async play() {
    const context = await this.ensureContext(true);
    if (context.state !== 'running') return;
    if (!this.currentBuffers || this.isPlaying) return;
    this.startSourceAt(this.playStartOffsetSec, false);
  }

  pause() {
    if (!this.currentBuffers) return;
    this.playStartOffsetSec = this.getCurrentTime();
    this.stopSourceNow();
    this.isPlaying = false;
  }

  seek(time: number) {
    if (!this.currentBuffers) return;
    const nextTime = clamp(time, 0, this.currentBuffers.duration);
    if (this.isPlaying && this.context?.state === 'running') {
      this.startSourceAt(nextTime, true);
      return;
    }
    if (this.isPlaying) {
      this.stopSourceNow();
      this.isPlaying = false;
    }
    this.playStartOffsetSec = nextTime;
  }

  setPlaybackRate(rate: number) {
    const nextRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
    const currentTime = this.getCurrentTime();
    this.playbackRate = nextRate;
    if (this.source) {
      this.source.playbackRate.setValueAtTime(nextRate, this.context?.currentTime ?? 0);
      this.playStartOffsetSec = currentTime;
      this.playStartCtxTime = this.context?.currentTime ?? 0;
    }
  }

  async setReversed(shouldReverse: boolean) {
    if (!this.currentBuffers || shouldReverse === this.isReversed) return;
    const currentTime = this.getCurrentTime();
    this.isReversed = shouldReverse;
    if (this.isPlaying && this.context?.state === 'running') {
      this.startSourceAt(currentTime, true);
      return;
    }
    if (this.isPlaying) {
      this.stopSourceNow();
      this.isPlaying = false;
    }
    this.playStartOffsetSec = currentTime;
  }

  getCurrentTime() {
    if (!this.currentBuffers) return 0;
    const duration = this.currentBuffers.duration;
    if (!this.isPlaying || !this.context) {
      return clamp(this.playStartOffsetSec, 0, duration);
    }

    const elapsed = (this.context.currentTime - this.playStartCtxTime) * this.playbackRate;
    const direction = this.isReversed ? -1 : 1;
    return clamp(this.playStartOffsetSec + elapsed * direction, 0, duration);
  }

  getDuration() {
    return this.currentBuffers?.duration ?? 0;
  }

  getIsPlaying() {
    return this.isPlaying;
  }

  getIsReversed() {
    return this.isReversed;
  }

  private stopSourceNow() {
    if (this.source) {
      this.source.onended = null;
      this.source.stop();
      this.source.disconnect();
      this.source = null;
    }
    if (this.sourceGain) {
      this.sourceGain.disconnect();
      this.sourceGain = null;
    }
  }

  private startSourceAt(forwardTimelineTime: number, withMicroFade: boolean) {
    if (!this.context || !this.entryGain || !this.currentBuffers || this.context.state !== 'running') return;

    const { duration } = this.currentBuffers;
    const safeForwardTime = clamp(forwardTimelineTime, 0, duration);
    const nextBuffer = this.isReversed ? this.currentBuffers.reversed : this.currentBuffers.forward;
    // For reversed playback we map from forward timeline time t to reversed buffer offset duration - t.
    const rawOffset = this.isReversed ? duration - safeForwardTime : safeForwardTime;
    const maxOffset = Math.max(duration - START_EPSILON_SECONDS, 0);
    const safeOffset = clamp(rawOffset, 0, maxOffset);

    const nextSource = this.context.createBufferSource();
    nextSource.buffer = nextBuffer;
    nextSource.playbackRate.setValueAtTime(this.playbackRate, this.context.currentTime);

    const nextGain = this.context.createGain();
    const now = this.context.currentTime;
    const fadeDuration = withMicroFade ? FADE_SECONDS : 0;

    if (withMicroFade) {
      nextGain.gain.setValueAtTime(0, now);
      nextGain.gain.linearRampToValueAtTime(1, now + fadeDuration);
    } else {
      nextGain.gain.setValueAtTime(1, now);
    }

    nextSource.connect(nextGain);
    nextGain.connect(this.entryGain);

    const prevSource = this.source;
    const prevGain = this.sourceGain;
    if (prevSource && prevGain && withMicroFade) {
      prevGain.gain.cancelScheduledValues(now);
      prevGain.gain.setValueAtTime(prevGain.gain.value, now);
      prevGain.gain.linearRampToValueAtTime(0, now + fadeDuration);
      prevSource.stop(now + fadeDuration);
    } else if (prevSource) {
      prevSource.stop();
    }

    this.source = nextSource;
    this.sourceGain = nextGain;
    this.playStartOffsetSec = safeForwardTime;
    this.playStartCtxTime = now;
    this.isPlaying = true;

    nextSource.onended = () => {
      if (this.source !== nextSource) return;
      this.isPlaying = false;
      this.source = null;
      this.sourceGain = null;
      this.playStartOffsetSec = this.isReversed ? 0 : duration;
    };

    nextSource.start(now, safeOffset);
  }

  private async getOrCreateBuffers(url: string) {
    const cached = this.buffersByUrl.get(url);
    if (cached) {
      return cached;
    }

    const context = await this.ensureContext();
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Unable to fetch audio source (${response.status}).`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const forwardBuffer = await context.decodeAudioData(arrayBuffer.slice(0));
    const reversedBuffer = context.createBuffer(
      forwardBuffer.numberOfChannels,
      forwardBuffer.length,
      forwardBuffer.sampleRate,
    );

    for (let channel = 0; channel < forwardBuffer.numberOfChannels; channel += 1) {
      const sourceData = forwardBuffer.getChannelData(channel);
      const targetData = reversedBuffer.getChannelData(channel);
      for (let index = 0, last = sourceData.length - 1; index < sourceData.length; index += 1) {
        targetData[index] = sourceData[last - index];
      }
    }

    const value: CachedTrackBuffers = {
      forward: forwardBuffer,
      reversed: reversedBuffer,
      duration: forwardBuffer.duration,
    };
    this.buffersByUrl.set(url, value);
    return value;
  }

  destroy() {
    this.pause();
    this.entryGain?.disconnect();
    this.masterGain?.disconnect();
    this.effects.forEach((effect) => effect.node.disconnect());
    this.buffersByUrl.clear();
    if (this.context && this.context.state !== 'closed') {
      void this.context.close();
    }
  }
}

export type { EffectNode };
