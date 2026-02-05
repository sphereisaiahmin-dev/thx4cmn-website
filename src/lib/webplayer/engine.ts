type EffectNode = {
  id: string;
  node: AudioNode;
};

type CachedTrackData = {
  duration: number;
  length: number;
  sampleRate: number;
  numberOfChannels: number;
  channels: Float32Array[];
};

type TransportMessage =
  | {
      type: 'LOAD_TRACK_BUFFER';
      channels: Float32Array[];
      channelCount: number;
      length: number;
      sampleRate: number;
      initialFrame: number;
    }
  | { type: 'SET_PLAYHEAD'; frame: number }
  | { type: 'SET_DIRECTION'; direction: 1 | -1 }
  | { type: 'SET_RATE'; rate: number }
  | { type: 'SET_PLAYING'; playing: boolean };

const WORKLET_NAME = 'reverse-transport-processor';
const WORKLET_MODULE_URL = new URL('./reverse-worklet.processor.js', import.meta.url);
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export class WebPlayerEngine {
  private context: AudioContext | null = null;
  private entryGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private effects: EffectNode[] = [];
  private transportNode: AudioWorkletNode | null = null;
  private buffersByUrl = new Map<string, CachedTrackData>();
  private currentUrl: string | null = null;
  private currentTrack: CachedTrackData | null = null;
  private isPlaying = false;
  private isReversed = false;
  private playbackRate = 1;
  private timelineAnchorSec = 0;
  private timelineAnchorCtxTime = 0;
  private pendingBoundaryFrame: number | null = null;

  private async ensureContext(resumeIfSuspended = false) {
    if (!this.context) {
      this.context = new AudioContext();
      this.entryGain = this.context.createGain();
      this.masterGain = this.context.createGain();
      this.rebuildGraph();
      await this.ensureTransportNode();
    }
    if (resumeIfSuspended && this.context.state !== 'running') {
      await this.context.resume();
    }
    return this.context;
  }

  private async ensureTransportNode() {
    if (!this.context || !this.entryGain || this.transportNode) return;
    await this.context.audioWorklet.addModule(WORKLET_MODULE_URL);
    this.transportNode = new AudioWorkletNode(this.context, WORKLET_NAME, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    this.transportNode.port.onmessage = (event) => this.handleTransportMessage(event.data);
    this.transportNode.connect(this.entryGain);
  }

  private handleTransportMessage(message: { type?: string; frame?: number; playing?: boolean }) {
    if (!this.currentTrack) return;

    if (message.type === 'CURRENT_FRAME' && typeof message.frame === 'number') {
      // Processor reports frame in forward-frame space. We keep this as the authoritative
      // timeline anchor so direction toggles can start from the exact rendered moment.
      this.timelineAnchorSec = clamp(message.frame / this.currentTrack.sampleRate, 0, this.currentTrack.duration);
      this.timelineAnchorCtxTime = this.context?.currentTime ?? 0;
      if (typeof message.playing === 'boolean') {
        this.isPlaying = message.playing;
      }
    }

    if (message.type === 'BOUNDARY_REACHED' && typeof message.frame === 'number') {
      this.pendingBoundaryFrame = message.frame;
      this.timelineAnchorSec = clamp(message.frame / this.currentTrack.sampleRate, 0, this.currentTrack.duration);
      this.timelineAnchorCtxTime = this.context?.currentTime ?? 0;
      this.isPlaying = false;
    }
  }

  setEffectChain(nodes: EffectNode[]) {
    this.effects = nodes;
    this.rebuildGraph();
    if (this.transportNode && this.entryGain) {
      this.transportNode.disconnect();
      this.transportNode.connect(this.entryGain);
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
    this.currentUrl = url;
    this.currentTrack = await this.getOrCreateTrackData(url);
    this.isPlaying = false;
    this.timelineAnchorSec = 0;
    this.timelineAnchorCtxTime = this.context?.currentTime ?? 0;
    this.pendingBoundaryFrame = null;

    this.postTransportMessage({
      type: 'LOAD_TRACK_BUFFER',
      channels: this.currentTrack.channels,
      channelCount: this.currentTrack.numberOfChannels,
      length: this.currentTrack.length,
      sampleRate: this.currentTrack.sampleRate,
      initialFrame: 0,
    });
    this.postTransportMessage({ type: 'SET_DIRECTION', direction: this.isReversed ? -1 : 1 });
    this.postTransportMessage({ type: 'SET_RATE', rate: this.playbackRate });
    this.postTransportMessage({ type: 'SET_PLAYING', playing: false });
  }

  async play() {
    const context = await this.ensureContext(true);
    if (context.state !== 'running' || !this.currentTrack || this.isPlaying) return;

    const anchor = this.getCurrentTime();
    this.timelineAnchorSec = anchor;
    this.timelineAnchorCtxTime = context.currentTime;
    this.pendingBoundaryFrame = null;

    this.postTransportMessage({ type: 'SET_PLAYHEAD', frame: this.secondsToFrame(anchor) });
    this.postTransportMessage({ type: 'SET_PLAYING', playing: true });
    this.isPlaying = true;
  }

  pause() {
    if (!this.currentTrack) return;
    this.timelineAnchorSec = this.getCurrentTime();
    this.timelineAnchorCtxTime = this.context?.currentTime ?? 0;
    this.isPlaying = false;
    this.postTransportMessage({ type: 'SET_PLAYING', playing: false });
  }

  async seek(time: number) {
    if (!this.currentTrack) return;
    await this.ensureContext(true);
    const nextTime = clamp(time, 0, this.currentTrack.duration);
    this.timelineAnchorSec = nextTime;
    this.timelineAnchorCtxTime = this.context?.currentTime ?? 0;
    this.pendingBoundaryFrame = null;
    this.postTransportMessage({ type: 'SET_PLAYHEAD', frame: this.secondsToFrame(nextTime) });
  }

  setPlaybackRate(rate: number) {
    const nextRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
    const currentTime = this.getCurrentTime();
    this.playbackRate = nextRate;
    this.timelineAnchorSec = currentTime;
    this.timelineAnchorCtxTime = this.context?.currentTime ?? 0;
    this.postTransportMessage({ type: 'SET_RATE', rate: nextRate });
  }

  async setReversed(shouldReverse: boolean) {
    if (!this.currentTrack || shouldReverse === this.isReversed) return;
    await this.ensureContext(true);

    const currentTime = this.getCurrentTime();
    this.timelineAnchorSec = currentTime;
    this.timelineAnchorCtxTime = this.context?.currentTime ?? 0;
    this.isReversed = shouldReverse;

    // Timeline is always forward-time seconds. We set the playhead first, then switch direction,
    // so reverse starts exactly from the same logical song moment without reloads or node rebuilds.
    this.postTransportMessage({ type: 'SET_PLAYHEAD', frame: this.secondsToFrame(currentTime) });
    this.postTransportMessage({ type: 'SET_DIRECTION', direction: shouldReverse ? -1 : 1 });
  }

  getCurrentTime() {
    if (!this.currentTrack) return 0;
    const duration = this.currentTrack.duration;

    if (!this.isPlaying || !this.context || this.context.state !== 'running') {
      return clamp(this.timelineAnchorSec, 0, duration);
    }

    if (this.pendingBoundaryFrame !== null) {
      const boundaryTime = clamp(this.pendingBoundaryFrame / this.currentTrack.sampleRate, 0, duration);
      this.timelineAnchorSec = boundaryTime;
      this.pendingBoundaryFrame = null;
      return boundaryTime;
    }

    const elapsed = (this.context.currentTime - this.timelineAnchorCtxTime) * this.playbackRate;
    const direction = this.isReversed ? -1 : 1;
    return clamp(this.timelineAnchorSec + elapsed * direction, 0, duration);
  }

  getDuration() {
    return this.currentTrack?.duration ?? 0;
  }

  getIsPlaying() {
    return this.isPlaying;
  }

  getIsReversed() {
    return this.isReversed;
  }

  private secondsToFrame(seconds: number) {
    if (!this.currentTrack) return 0;
    return clamp(seconds * this.currentTrack.sampleRate, 0, this.currentTrack.length - 1);
  }

  private postTransportMessage(message: TransportMessage) {
    this.transportNode?.port.postMessage(message);
  }

  private async getOrCreateTrackData(url: string) {
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
    const decoded = await context.decodeAudioData(arrayBuffer.slice(0));
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, channel) => {
      const source = decoded.getChannelData(channel);
      const copy = new Float32Array(source.length);
      copy.set(source);
      return copy;
    });

    const value: CachedTrackData = {
      duration: decoded.duration,
      length: decoded.length,
      sampleRate: decoded.sampleRate,
      numberOfChannels: decoded.numberOfChannels,
      channels,
    };

    this.buffersByUrl.set(url, value);
    return value;
  }

  destroy() {
    this.pause();
    this.transportNode?.disconnect();
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
