/**
 * Browser audio helpers for the voice-feedback Live session (Phase 5).
 *
 * Two small classes, both framework-agnostic so the React component stays thin:
 *
 *  - MicCapture: getUserMedia -> AudioWorklet that streams 16 kHz mono PCM16
 *    chunks (base64) to a callback. Gemini Live expects 16 kHz signed-16 input.
 *    The worklet does streaming linear resampling from the device rate (usually
 *    48 kHz, and on iOS Safari you cannot force 16 kHz) down to 16 kHz.
 *
 *  - PcmPlayer: schedules 24 kHz PCM16 chunks the model sends back into a single
 *    AudioContext timeline (gapless), and can flush the queue on barge-in
 *    (server "interrupted" signal).
 *
 * The AudioWorklet processor is shipped as an inline Blob URL so we don't have
 * to wire a separate static asset through Next's build — this is the most
 * portable path for iOS Safari + Android Chrome.
 *
 * See: docs/plans/2026-05-28-voice-feedback-plan.md (Phase 5)
 */

const TARGET_INPUT_RATE = 16000;
const MODEL_OUTPUT_RATE = 24000;

// Streaming linear-resampler worklet: device rate -> 16 kHz, emits Int16 buffers.
const WORKLET_SOURCE = `
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.outRate = ${TARGET_INPUT_RATE};
    this.step = sampleRate / this.outRate; // input samples per output sample
    this.readPos = 0;        // absolute source position of next output sample
    this.inputIndex = 0;     // absolute index of first sample in current block
    this.prevSample = 0;     // last sample of previous block (for interp at -1)
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0 || !input[0]) return true;
    const ch = input[0];
    const n = ch.length;
    const out = [];
    while (this.readPos < this.inputIndex + n - 1) {
      const p = this.readPos;
      const i0 = Math.floor(p);
      const frac = p - i0;
      const s0 = i0 < this.inputIndex ? this.prevSample : ch[i0 - this.inputIndex];
      const s1 = ch[i0 + 1 - this.inputIndex];
      out.push(s0 + (s1 - s0) * frac);
      this.readPos += this.step;
    }
    this.inputIndex += n;
    this.prevSample = ch[n - 1];
    if (out.length) {
      const pcm = new Int16Array(out.length);
      for (let i = 0; i < out.length; i++) {
        let s = out[i];
        s = s < -1 ? -1 : s > 1 ? 1 : s;
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this.port.postMessage(pcm.buffer, [pcm.buffer]);
    }
    return true;
  }
}
registerProcessor('capture-processor', CaptureProcessor);
`;

function int16ToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToInt16(b64: string): Int16Array {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

/** Captures the mic and streams base64 PCM16 @ 16 kHz to `onChunk`. */
export class MicCapture {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private blobUrl: string | null = null;

  constructor(private onChunk: (base64Pcm: string) => void) {}

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    // Some browsers (iOS Safari) ignore a requested sampleRate, so we let the
    // context pick its native rate and resample inside the worklet.
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();
    if (this.ctx.state === "suspended") await this.ctx.resume();

    const blob = new Blob([WORKLET_SOURCE], { type: "application/javascript" });
    this.blobUrl = URL.createObjectURL(blob);
    await this.ctx.audioWorklet.addModule(this.blobUrl);

    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, "capture-processor");
    this.node.port.onmessage = (e: MessageEvent) => {
      this.onChunk(int16ToBase64(e.data as ArrayBuffer));
    };
    this.source.connect(this.node);
    // Worklet needs a destination connection to be pulled by the graph; route
    // through a muted gain so we never echo the mic to the speakers.
    const sink = this.ctx.createGain();
    sink.gain.value = 0;
    this.node.connect(sink);
    sink.connect(this.ctx.destination);
  }

  stop(): void {
    try {
      this.node?.port.close();
      this.node?.disconnect();
      this.source?.disconnect();
      this.stream?.getTracks().forEach((t) => t.stop());
      if (this.ctx && this.ctx.state !== "closed") void this.ctx.close();
      if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
    } catch {
      /* best-effort teardown */
    }
    this.node = null;
    this.source = null;
    this.stream = null;
    this.ctx = null;
    this.blobUrl = null;
  }
}

/** Gapless scheduler for 24 kHz PCM16 chunks streamed back by the model. */
export class PcmPlayer {
  private ctx: AudioContext;
  private nextTime = 0;
  private sources: AudioBufferSourceNode[] = [];

  constructor() {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();
  }

  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  /**
   * iOS unlock. MUST be called synchronously inside the user-gesture handler
   * (e.g. the button onClick), BEFORE any `await`. On WebKit/iOS an output
   * AudioContext only unlocks if `resume()` is invoked while the page still has
   * transient activation; doing it after an await leaves the context suspended
   * and `resume()` can hang, stranding the call on "Connecting…". We also play a
   * single silent frame, which is the long-standing trick to force the unlock.
   * Fire-and-forget: the act of calling resume() during the gesture is what
   * matters; we don't await it here.
   */
  unlock(): void {
    try {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      const buf = this.ctx.createBuffer(1, 1, MODEL_OUTPUT_RATE);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.ctx.destination);
      src.start(0);
    } catch {
      /* best-effort unlock */
    }
  }

  /** Returns true while audio is scheduled to keep playing in the near future. */
  get isPlaying(): boolean {
    return this.nextTime > this.ctx.currentTime + 0.02;
  }

  push(int16: Int16Array): void {
    if (int16.length === 0) return;
    const f32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) f32[i] = int16[i] / 0x8000;
    const buf = this.ctx.createBuffer(1, f32.length, MODEL_OUTPUT_RATE);
    buf.copyToChannel(f32, 0);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.ctx.destination);
    const now = this.ctx.currentTime;
    if (this.nextTime < now + 0.05) this.nextTime = now + 0.05;
    src.start(this.nextTime);
    this.nextTime += buf.duration;
    this.sources.push(src);
    src.onended = () => {
      this.sources = this.sources.filter((s) => s !== src);
    };
  }

  /** Barge-in: stop everything queued and reset the timeline. */
  flush(): void {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources = [];
    this.nextTime = 0;
  }

  close(): void {
    this.flush();
    if (this.ctx.state !== "closed") void this.ctx.close();
  }
}
