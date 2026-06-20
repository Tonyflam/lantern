/**
 * Lantern web client (vanilla ES module).
 *
 * Camera → snapshot → /api/ask, push-to-talk mic → /api/ask, typed requests,
 * spoken replies (TTS playback), and a live on-device activity stream. No build
 * step, no framework — keeps the submission reproducible.
 */

const els = {
  status: byId("status"),
  simBanner: byId("sim-banner"),
  video: byId("video"),
  canvas: byId("canvas"),
  camPlaceholder: byId("cam-placeholder"),
  startCam: byId("start-cam"),
  flipCam: byId("flip-cam"),
  talk: byId("talk"),
  textForm: byId("text-form"),
  textInput: byId("text-input"),
  result: byId("result"),
  badges: byId("badges"),
  detailWrap: byId("detail-wrap"),
  detail: byId("detail"),
  player: byId("player"),
  activity: byId("activity"),
};

let stream = null; // camera MediaStream
let facing = "environment";
let micStream = null;
let recorder = null;
let chunks = [];
let busy = false;
/** @type {AudioContext | null} Unlocked on first user gesture so replies can autoplay on mobile. */
let audioCtx = null;

init();

async function init() {
  await loadHealth();
  connectEvents();
  wireControls();
  wireAudioUnlock();
}

// Mobile browsers (and desktop) block programmatic audio that isn't tied to a
// user gesture. Creating/resuming an AudioContext on the first tap or keypress
// "unlocks" audio for the whole session, so spoken replies play even though
// they arrive after an async fetch.
function wireAudioUnlock() {
  const unlock = () => {
    try {
      const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
      if (!audioCtx && AC) audioCtx = new AC();
      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    } catch {
      /* WebAudio unavailable — the <audio> fallback still works */
    }
  };
  // Capture-phase, kept active: resume() is idempotent, so re-running per gesture
  // just guarantees the context is live whenever the user interacts.
  document.addEventListener("pointerdown", unlock, true);
  document.addEventListener("keydown", unlock, true);
}

async function loadHealth() {
  try {
    const r = await fetch("/api/health");
    const h = await r.json();
    if (h.mock) {
      els.simBanner.hidden = false;
      setStatus("Simulation mode");
    } else {
      setStatus(`On-device · ${String(h.device || "cpu").toUpperCase()}`);
    }
    if (h.delegation) els.status.title = h.delegation;
  } catch {
    setStatus("Offline");
  }
}

function connectEvents() {
  try {
    const es = new EventSource("/api/events");
    es.onmessage = (e) => {
      try {
        addActivity(JSON.parse(e.data));
      } catch {
        /* ignore malformed line */
      }
    };
  } catch {
    /* SSE unavailable — non-fatal */
  }
}

function addActivity(line) {
  if (!line || !line.op) return;
  const li = document.createElement("li");
  const tag = line.engine === "mock" ? "MOCK" : "qvac";
  const bits = [line.op];
  if (line.capability) bits.push(line.capability);
  if (line.durationMs != null) bits.push(line.durationMs + "ms");
  if (line.tokensPerSecond != null) bits.push(line.tokensPerSecond + " tok/s");
  li.textContent = `[${tag}] ${bits.join(" · ")}`;
  els.activity.prepend(li);
  while (els.activity.childElementCount > 40) els.activity.lastElementChild.remove();
}

function wireControls() {
  els.startCam.addEventListener("click", toggleCamera);
  els.flipCam.addEventListener("click", flipCamera);

  document.querySelectorAll(".action").forEach((btn) => {
    btn.addEventListener("click", () => {
      ask({ text: btn.getAttribute("data-text") || "", withImage: btn.getAttribute("data-image") === "1" });
    });
  });

  els.textForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = els.textInput.value.trim();
    if (!text) return;
    els.textInput.value = "";
    ask({ text, withImage: Boolean(stream) });
  });

  // Push-to-talk: pointer + keyboard (Space/Enter hold).
  const start = (e) => {
    e.preventDefault();
    startRecording();
  };
  const stop = (e) => {
    e.preventDefault();
    stopRecording();
  };
  els.talk.addEventListener("pointerdown", start);
  window.addEventListener("pointerup", stop);
  els.talk.addEventListener("keydown", (e) => {
    if ((e.key === " " || e.key === "Enter") && !e.repeat) start(e);
  });
  els.talk.addEventListener("keyup", (e) => {
    if (e.key === " " || e.key === "Enter") stop(e);
  });
}

async function toggleCamera() {
  if (stream) {
    stopCamera();
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false });
    els.video.srcObject = stream;
    els.camPlaceholder.hidden = true;
    await els.video.play();
    els.startCam.textContent = "Stop camera";
    els.flipCam.hidden = false;
  } catch {
    setResult("I couldn't open the camera. Please grant camera permission.");
  }
}

function stopCamera() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  els.video.srcObject = null;
  els.camPlaceholder.hidden = false;
  els.startCam.textContent = "Start camera";
  els.flipCam.hidden = true;
}

async function flipCamera() {
  facing = facing === "environment" ? "user" : "environment";
  if (stream) {
    stopCamera();
    await toggleCamera();
  }
}

function captureFrame() {
  if (!stream) return null;
  const v = els.video;
  const w = v.videoWidth;
  const h = v.videoHeight;
  if (!w || !h) return null;
  const c = els.canvas;
  c.width = w;
  c.height = h;
  c.getContext("2d").drawImage(v, 0, 0, w, h);
  return c.toDataURL("image/jpeg", 0.85);
}

async function startRecording() {
  if (recorder || busy) return;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    setResult("I couldn't open the microphone. Please grant permission, or type your request.");
    return;
  }
  chunks = [];
  recorder = new MediaRecorder(micStream);
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data);
  };
  recorder.onstop = onRecordingStop;
  recorder.start();
  els.talk.classList.add("recording");
  els.talk.textContent = "● Listening… release to send";
}

function stopRecording() {
  if (!recorder) return;
  els.talk.classList.remove("recording");
  els.talk.textContent = "🎙 Hold to talk";
  try {
    recorder.stop();
  } catch {
    /* already stopped */
  }
}

async function onRecordingStop() {
  micStream?.getTracks().forEach((t) => t.stop());
  micStream = null;
  const type = recorder?.mimeType || "audio/webm";
  const blob = new Blob(chunks, { type });
  recorder = null;
  chunks = [];
  if (!blob.size) return;
  const audioBase64 = await blobToBase64(blob);
  ask({ audioBase64, withImage: Boolean(stream) });
}

async function ask({ text = "", withImage = false, audioBase64 = null }) {
  if (busy) return;
  busy = true;
  setBusy(true);

  const payload = { text, speak: true };
  if (audioBase64) payload.audioBase64 = audioBase64;
  if (withImage) {
    const frame = captureFrame();
    if (frame) {
      payload.imageBase64 = frame;
      payload.imageMime = "image/jpeg";
    }
  }

  try {
    const r = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (!r.ok || data.ok === false) throw new Error(data.error || "Request failed");
    renderResult(data);
  } catch (err) {
    setResult("Something went wrong: " + (err?.message || err));
    els.badges.innerHTML = "";
  } finally {
    busy = false;
    setBusy(false);
  }
}

function renderResult(data) {
  setResult(data.speech || "(no response)");

  const badges = [];
  if (data.transcript) badges.push(badge('heard: "' + data.transcript + '"', "muted"));
  if (data.intent) badges.push(badge(data.intent, "intent"));
  badges.push(data.verified ? badge("✓ verified", "ok") : badge("AI estimate", "warn"));
  if (data.warning) badges.push(badge(data.warning, "warn"));
  els.badges.innerHTML = "";
  badges.forEach((b) => els.badges.appendChild(b));

  if (data.detail && data.detail !== data.speech) {
    els.detail.textContent = data.detail;
    els.detailWrap.hidden = false;
  } else {
    els.detailWrap.hidden = true;
  }

  if (data.audioBase64) {
    playReply(data.audioBase64);
  }
}

// Play a spoken reply robustly. Prefers a gesture-unlocked WebAudio context
// (most reliable autoplay on phones); falls back to the <audio> element, and if
// even that is blocked, reveals tappable controls so the user can play it.
async function playReply(base64Wav) {
  // Always populate the <audio> element: a visible replay control and a clear
  // signal that a spoken reply is ready.
  els.player.src = "data:audio/wav;base64," + base64Wav;
  els.player.hidden = false;
  els.player.controls = true;

  if (audioCtx && audioCtx.state === "running") {
    try {
      const bytes = base64ToBytes(base64Wav);
      const buf = await audioCtx.decodeAudioData(bytes.buffer.slice(0));
      const node = audioCtx.createBufferSource();
      node.buffer = buf;
      node.connect(audioCtx.destination);
      node.start(0);
      return;
    } catch {
      /* fall through to the <audio> element */
    }
  }

  try {
    await els.player.play();
  } catch {
    // Autoplay blocked and no unlocked context — the visible controls let the
    // user tap ▶ to hear the reply.
    setStatus("Tap \u25B6 to hear the reply");
  }
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function badge(text, kind) {
  const span = document.createElement("span");
  span.className = "badge badge-" + kind;
  span.textContent = text;
  return span;
}

function setBusy(on) {
  els.result.classList.toggle("busy", on);
  if (on) setResult("Thinking…");
}
function setResult(t) {
  els.result.textContent = t;
}
function setStatus(t) {
  els.status.textContent = t;
}
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
function byId(id) {
  return document.getElementById(id);
}
