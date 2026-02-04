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

  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'metadata';
    this.audio.crossOrigin = 'anonymous';
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
    this.audio.src = url;
    this.audio.load();
    await new Promise<void>((resolve, reject) => {
      const handleLoaded = () => {
        cleanup();
        resolve();
      };
      const handleError = () => {
        cleanup();
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

  destroy() {
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.source?.disconnect();
    this.masterGain?.disconnect();
    this.effects.forEach((effect) => effect.node.disconnect());
    if (this.context && this.context.state !== 'closed') {
      void this.context.close();
    }
  }
}

export type { EffectNode };
