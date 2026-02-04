type EffectNode = {
  id: string;
  node: AudioNode;
};

export class WebPlayerEngine {
  private audio: HTMLAudioElement;
  private context: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private masterGain: GainNode | null = null;
  private effects: EffectNode[] = [];
  private currentUrl: string | null = null;
  private reversedUrl: string | null = null;
  private isReversed = false;

  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'metadata';
    this.audio.crossOrigin = 'anonymous';
    this.setPreservesPitch(false);
  }

  getAudioElement() {
    return this.audio;
  }

  async ensureContext() {
    if (!this.context) {
      this.context = new AudioContext();
      this.source = this.context.createMediaElementSource(this.audio);
      this.masterGain = this.context.createGain();
      this.rebuildGraph();
    }
    if (this.context.state !== 'running') {
      await this.context.resume();
    }
    return this.context;
  }

  setEffectChain(nodes: EffectNode[]) {
    this.effects = nodes;
    this.rebuildGraph();
  }

  private rebuildGraph() {
    if (!this.context || !this.source || !this.masterGain) return;
    this.source.disconnect();
    this.masterGain.disconnect();
    this.effects.forEach((effect) => effect.node.disconnect());

    const chain: AudioNode[] = [this.source, ...this.effects.map((effect) => effect.node), this.masterGain];
    chain.forEach((node, index) => {
      if (index < chain.length - 1) {
        node.connect(chain[index + 1]);
      }
    });
    this.masterGain.connect(this.context.destination);
  }

  async load(url: string) {
    if (this.reversedUrl) {
      URL.revokeObjectURL(this.reversedUrl);
      this.reversedUrl = null;
    }
    this.currentUrl = url;
    this.isReversed = false;
    await this.loadUrl(url);
  }

  async play() {
    await this.ensureContext();
    await this.audio.play();
  }

  pause() {
    this.audio.pause();
  }

  seek(time: number) {
    this.audio.currentTime = time;
  }

  setPlaybackRate(rate: number) {
    const nextRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
    this.audio.playbackRate = nextRate;
    this.setPreservesPitch(false);
  }

  async setReversed(shouldReverse: boolean) {
    if (!this.currentUrl || shouldReverse === this.isReversed) return;
    const wasPlaying = !this.audio.paused;
    const currentTime = this.audio.currentTime;
    const duration = Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
    const nextTime = duration ? Math.max(duration - currentTime, 0) : 0;
    const playbackRate = this.audio.playbackRate;
    if (shouldReverse) {
      if (!this.reversedUrl) {
        this.reversedUrl = await this.createReversedUrl(this.currentUrl);
      }
      await this.loadUrl(this.reversedUrl);
      this.isReversed = true;
    } else {
      await this.loadUrl(this.currentUrl);
      this.isReversed = false;
    }

    this.audio.playbackRate = playbackRate;
    if (Number.isFinite(nextTime)) {
      this.audio.currentTime = Math.min(nextTime, this.audio.duration || nextTime);
    }
    if (wasPlaying) {
      await this.play();
    }
  }

  private async loadUrl(url: string) {
    this.audio.src = url;
    this.audio.load();
    await new Promise<void>((resolve, reject) => {
      const handleLoaded = () => {
        cleanup();
        resolve();
      };
      const handleError = () => {
        cleanup();
        console.error('[WebPlayer] Audio element reported a load error.');
        reject(new Error('Unable to load audio source.'));
      };
      const cleanup = () => {
        this.audio.removeEventListener('loadedmetadata', handleLoaded);
        this.audio.removeEventListener('error', handleError);
      };
      this.audio.addEventListener('loadedmetadata', handleLoaded);
      this.audio.addEventListener('error', handleError);
    });
  }

  private async createReversedUrl(url: string) {
    const context = await this.ensureContext();
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Unable to fetch audio source (${response.status}).`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await context.decodeAudioData(arrayBuffer.slice(0));
    const reversedBuffer = context.createBuffer(
      audioBuffer.numberOfChannels,
      audioBuffer.length,
      audioBuffer.sampleRate,
    );

    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
      const sourceData = audioBuffer.getChannelData(channel);
      const targetData = reversedBuffer.getChannelData(channel);
      for (let index = 0, last = sourceData.length - 1; index < sourceData.length; index += 1) {
        targetData[index] = sourceData[last - index];
      }
    }

    const wavBuffer = encodeWav(reversedBuffer);
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  }

  private setPreservesPitch(shouldPreserve: boolean) {
    const audio = this.audio as HTMLAudioElement & {
      webkitPreservesPitch?: boolean;
      mozPreservesPitch?: boolean;
      preservesPitch?: boolean;
    };
    if (typeof audio.preservesPitch === 'boolean') {
      audio.preservesPitch = shouldPreserve;
    }
    if (typeof audio.webkitPreservesPitch === 'boolean') {
      audio.webkitPreservesPitch = shouldPreserve;
    }
    if (typeof audio.mozPreservesPitch === 'boolean') {
      audio.mozPreservesPitch = shouldPreserve;
    }
  }

  destroy() {
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.source?.disconnect();
    this.masterGain?.disconnect();
    this.effects.forEach((effect) => effect.node.disconnect());
    if (this.reversedUrl) {
      URL.revokeObjectURL(this.reversedUrl);
      this.reversedUrl = null;
    }
    if (this.context && this.context.state !== 'closed') {
      void this.context.close();
    }
  }
}

export type { EffectNode };

const encodeWav = (buffer: AudioBuffer) => {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length * numChannels * 2;
  const arrayBuffer = new ArrayBuffer(44 + length);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  let offset = 0;
  writeString(offset, 'RIFF');
  offset += 4;
  view.setUint32(offset, 36 + length, true);
  offset += 4;
  writeString(offset, 'WAVE');
  offset += 4;
  writeString(offset, 'fmt ');
  offset += 4;
  view.setUint32(offset, 16, true);
  offset += 4;
  view.setUint16(offset, 1, true);
  offset += 2;
  view.setUint16(offset, numChannels, true);
  offset += 2;
  view.setUint32(offset, sampleRate, true);
  offset += 4;
  view.setUint32(offset, sampleRate * numChannels * 2, true);
  offset += 4;
  view.setUint16(offset, numChannels * 2, true);
  offset += 2;
  view.setUint16(offset, 16, true);
  offset += 2;
  writeString(offset, 'data');
  offset += 4;
  view.setUint32(offset, length, true);
  offset += 4;

  const channels = Array.from({ length: numChannels }, (_, index) => buffer.getChannelData(index));
  let sampleIndex = 0;
  while (sampleIndex < buffer.length) {
    for (let channel = 0; channel < numChannels; channel += 1) {
      let sample = channels[channel][sampleIndex] ?? 0;
      sample = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
    sampleIndex += 1;
  }

  return arrayBuffer;
};
