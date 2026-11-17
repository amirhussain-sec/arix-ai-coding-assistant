export interface VoicePreset {
  name: string;
  rate: number;
  pitch: number;
}

export const VOICE_PRESETS: VoicePreset[] = [
  {name: 'Natural', rate: 1.0, pitch: 1.0},
  {name: 'Calm', rate: 0.9, pitch: 0.92},
  {name: 'Energetic', rate: 1.15, pitch: 1.1},
  {name: 'Deep', rate: 0.95, pitch: 0.78},
  {name: 'Bright', rate: 1.05, pitch: 1.2},
];

export function stripMarkdownForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' Code block omitted. ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[#*_>-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function speakText(
  text: string,
  options: {
    voiceName?: string;
    rate?: number;
    pitch?: number;
    onEnd?: () => void;
  } = {}
): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const clean = stripMarkdownForSpeech(text);
  if (!clean) return;

  const utterance = new SpeechSynthesisUtterance(clean);
  const voices = window.speechSynthesis.getVoices();
  if (options.voiceName) {
    const matched = voices.find((v) => v.name === options.voiceName);
    if (matched) utterance.voice = matched;
  }
  utterance.rate = options.rate ?? 1.0;
  utterance.pitch = options.pitch ?? 1.0;
  if (options.onEnd) {
    utterance.onend = options.onEnd;
    utterance.onerror = options.onEnd;
  }
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: {results: ArrayLike<ArrayLike<{transcript: string}>>}) => void) | null;
  onerror: ((event: {error: string}) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export function createSpeechRecognition(): SpeechRecognitionLike | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = win.SpeechRecognition || win.webkitSpeechRecognition;
  if (!Ctor) return null;
  const instance = new Ctor();
  instance.lang = 'en-US';
  instance.interimResults = true;
  instance.continuous = false;
  return instance;
}
