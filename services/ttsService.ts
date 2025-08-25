import { logger } from './loggingService';

let voices: SpeechSynthesisVoice[] = [];
let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;

const loadVoices = (): Promise<SpeechSynthesisVoice[]> => {
  return new Promise((resolve) => {
    const getAndResolve = () => {
      const voiceList = window.speechSynthesis.getVoices();
      if (voiceList.length > 0) {
        voices = voiceList.sort((a, b) => a.name.localeCompare(b.name));
        // Ensure the event listener is removed once voices are loaded.
        window.speechSynthesis.onvoiceschanged = null;
        resolve(voices);
        return true;
      }
      return false;
    };

    if (getAndResolve()) {
      return;
    }
    
    window.speechSynthesis.onvoiceschanged = getAndResolve;
  });
};

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

export const isSupported = (): boolean => {
    return 'speechSynthesis' in window && window.speechSynthesis !== null;
};

export const speak = async (text: string, voiceURI?: string) => {
    if (!isSupported() || !text) return;
    
    try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        
        if (voiceURI) {
            const availableVoices = await getVoices();
            if (availableVoices.length > 0) {
                const selectedVoice = availableVoices.find(v => v.voiceURI === voiceURI);
                if (selectedVoice) {
                    utterance.voice = selectedVoice;
                } else {
                    logger.warn(`TTS voice not found for URI: ${voiceURI}. Using default.`);
                }
            }
        }
        
        utterance.onerror = (event) => {
            logger.error('TTS Utterance Error:', event.error);
        };
        
        window.speechSynthesis.speak(utterance);
    } catch (error) {
        logger.error('Failed to initiate TTS speak.', error);
    }
};

export const cancel = () => {
    if (isSupported()) {
        window.speechSynthesis.cancel();
    }
};

if (isSupported()) {
    getVoices();
}
