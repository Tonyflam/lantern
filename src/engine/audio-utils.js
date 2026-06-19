/**
 * Audio utilities for Lantern.
 *
 * - WAV (de)serialization for 16-bit PCM.
 * - ffmpeg-based transcoding of arbitrary browser audio (webm/opus) into the
 *   16 kHz mono PCM WAV that Whisper expects.
 * - ffplay-based playback of TTS output (desktop voice loop).
 * - Microphone capture via ffmpeg (optional desktop voice loop).
 *
 * These helpers shell out to ffmpeg/ffplay, which the QVAC voice examples also
 * require. `npm run doctor` verifies they are installed.
 */
import { spawn, spawnSync } from "node:child_process";

/**
 * Build a 44-byte WAV header for raw 16-bit PCM.
 * @param {number} dataLength  Byte length of the PCM payload.
 * @param {number} sampleRate
 * @param {{channels?: number, bitsPerSample?: number}} [opts]
 * @returns {Buffer}
 */
export function createWavHeader(dataLength, sampleRate, { channels = 1, bitsPerSample = 16 } = {}) {
  const header = Buffer.alloc(44);
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM fmt chunk size
  header.writeUInt16LE(1, 20); // audio format = PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataLength, 40);
  return header;
}

/**
 * Convert an array (or Int16Array) of 16-bit samples to a little-endian Buffer.
 * @param {Int16Array|number[]} samples
 * @returns {Buffer}
 */
export function int16ToBuffer(samples) {
  const buffer = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const value = Math.max(-32768, Math.min(32767, Math.round(samples[i] ?? 0)));
    buffer.writeInt16LE(value, i * 2);
  }
  return buffer;
}

/**
 * Wrap raw 16-bit PCM samples into a complete WAV buffer.
 * @param {Int16Array|number[]} samples
 * @param {number} sampleRate
 * @returns {Buffer}
 */
export function pcmInt16ToWav(samples, sampleRate) {
  const data = int16ToBuffer(samples);
  return Buffer.concat([createWavHeader(data.length, sampleRate), data]);
}

/** @returns {boolean} whether `ffmpeg` is available on PATH. */
export function hasFfmpeg() {
  const r = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  return !r.error && r.status === 0;
}

/** @returns {boolean} whether `ffplay` is available on PATH. */
export function hasFfplay() {
  const r = spawnSync("ffplay", ["-version"], { stdio: "ignore" });
  return !r.error && r.status === 0;
}

/**
 * Transcode arbitrary audio (e.g. the browser's webm/opus from MediaRecorder)
 * into 16 kHz mono 16-bit PCM WAV — the format Whisper expects.
 * @param {Buffer} inputBuffer
 * @returns {Buffer} WAV bytes.
 */
export function toWav16kMono(inputBuffer) {
  const r = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-ac", "1", "-ar", "16000", "-f", "wav", "pipe:1"],
    { input: inputBuffer, maxBuffer: 1024 * 1024 * 128 },
  );
  if (r.error) {
    if (/** @type {NodeJS.ErrnoException} */ (r.error).code === "ENOENT") {
      throw new Error("ffmpeg not found on PATH. Install ffmpeg and retry (see `npm run doctor`).");
    }
    throw r.error;
  }
  if (r.status !== 0) {
    throw new Error(`ffmpeg failed to transcode audio: ${r.stderr?.toString().trim() || r.status}`);
  }
  return r.stdout;
}

/**
 * Play a WAV buffer through ffplay and block until playback finishes.
 * @param {Buffer} wavBuffer
 */
export function playWav(wavBuffer) {
  const r = spawnSync(
    "ffplay",
    ["-hide_banner", "-loglevel", "error", "-autoexit", "-nodisp", "-i", "pipe:0"],
    { input: wavBuffer, stdio: ["pipe", "inherit", "inherit"] },
  );
  if (r.error) {
    if (/** @type {NodeJS.ErrnoException} */ (r.error).code === "ENOENT") {
      throw new Error("ffplay not found on PATH. Install ffmpeg (it ships with ffplay) and retry.");
    }
    throw r.error;
  }
  if (r.status !== 0) throw new Error(`ffplay exited with code ${r.status}`);
}

/**
 * Spawn the system microphone via ffmpeg, emitting f32le mono frames on stdout.
 * Used by the optional desktop voice loop. Override the device with MIC_DEVICE.
 * @param {{sampleRate?: number}} [opts]
 * @returns {import("node:child_process").ChildProcessWithoutNullStreams}
 */
export function startMicrophone({ sampleRate = 16000 } = {}) {
  const platform = process.platform;
  const device = process.env.MIC_DEVICE || (platform === "darwin" ? ":0" : "default");
  let input;
  if (platform === "darwin") input = ["-f", "avfoundation", "-i", device];
  else if (platform === "win32") input = ["-f", "dshow", "-i", `audio=${device}`];
  else input = ["-f", "pulse", "-i", device];

  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    ...input,
    "-ac",
    "1",
    "-ar",
    String(sampleRate),
    "-f",
    "f32le",
    "pipe:1",
  ];
  return /** @type {any} */ (spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "inherit"] }));
}
