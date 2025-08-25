import { logger } from './loggingService';

let voices: SpeechSynthesisVoice[] = [];
let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;

const loadVoices = (): Promise<SpeechSynthesisVoice[]> => {
  return new Promise((resolve) => {
    const getAndResolve = () => {
      const voiceList = window.speechSynthesis.getVoices();
      if (voiceList.length > 0) {
        // Sort voices alphabetically by name for a consistent UI
        voices = voiceList.sort((a, b) => a.name.localeCompare(b.name));
        resolve(voices);
        return true;
      }
      return false;
    };

    // Attempt to get voices immediately. In some browsers, they're ready.
    if (getAndResolve()) {
      return;
    }
    
    // In other browsers, we need to wait for the `onvoiceschanged` event.
    window.speechSynthesis.onvoiceschanged = getAndResolve;
  });
};

/**
 * Gets the list of available TTS voices, handling the asynchronous loading process.
 */
export const getVoices = (): Promise<SpeechSynthesisVoice[]> => {
  if (!isSupported()) {
    return Promise.resolve([]);
  }
  if (voices.length > 0) {
    return Promise.resolve(voices);
  }
  if (!voicesPromise) {
    voicesPromise = loadVoices();
  }
  return voicesPromise;
};

/**
 * Checks if the browser supports the Web Speech API.
 */
export const isSupported = (): boolean => {
    return 'speechSynthesis' in window && window.speechSynthesis !== null;
};

/**
 * Speaks a given text string, optionally with a specific voice.
 * @param text The text to be spoken.
 * @param voiceURI The URI of the desired voice from the SpeechSynthesisVoice object.
 */
export const speak = (text: string, voiceURI?: string) => {
    if (!isSupported() || !text) return;
    
    // Stop any currently speaking utterance to prevent overlap.
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    
    if (voiceURI && voices.length > 0) {
        const selectedVoice = voices.find(v => v.voiceURI === voiceURI);
        if (selectedVoice) {
            utterance.voice = selectedVoice;
        } else {
            logger.warn(`TTS voice not found for URI: ${voiceURI}. Using default.`);
        }
    }
    
    window.speechSynthesis.speak(utterance);
};

/**
 * Stops any currently playing speech.
 */
export const cancel = () => {
    if (isSupported()) {
        window.speechSynthesis.cancel();
    }
};

// Pre-warm the voices list when the application loads. This helps ensure
// the voice list is populated by the time the user needs it.
getVoices();
