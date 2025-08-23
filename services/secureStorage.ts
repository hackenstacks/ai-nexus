import { AppData } from '../types';
import { STORAGE_KEY_DATA, STORAGE_KEY_PASS_VERIFIER } from '../constants';

// --- IMPORTANT ---
// This is a SIMULATED encryption for demonstration purposes in a browser-only environment.
// It uses a simple XOR cipher and is NOT cryptographically secure.
// In a real-world application, use a robust library like crypto-js or the Web Crypto API
// and handle key management securely on a backend.

let masterKey: string | null = null;

// Helper function to handle Unicode strings for btoa. It converts a UTF-16 string
// to a "binary" string where each character's code point is one of the bytes of the
// UTF-8 sequence. This is safe to pass to btoa.
const utf16ToBinary = (str: string): string => {
    return unescape(encodeURIComponent(str));
};

// Helper function to decode the "binary" string from atob back to a UTF-16 string.
const binaryToUtf16 = (binary: string): string => {
    return decodeURIComponent(escape(binary));
};

const simpleXOR = (data: string, key: string): string => {
  let output = '';
  for (let i = 0; i < data.length; i++) {
    output += String.fromCharCode(data.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return output;
};

const encrypt = (data: string): string => {
  if (!masterKey) throw new Error('Master key is not set.');
  // The result of XOR might contain non-Latin1 characters.
  // We must convert it to a binary-safe string before btoa.
  const xorResult = simpleXOR(data, masterKey);
  const binaryString = utf16ToBinary(xorResult);
  return btoa(binaryString);
};

const decrypt = (encryptedData: string): string => {
  if (!masterKey) throw new Error('Master key is not set.');
  const binaryString = atob(encryptedData);
  // Convert back from the binary-safe string format before applying XOR again.
  const xorResult = binaryToUtf16(binaryString);
  return simpleXOR(xorResult, masterKey);
};

const setMasterKey = (password: string) => {
    masterKey = password;
};

export const hasMasterPassword = async (): Promise<boolean> => {
    return localStorage.getItem(STORAGE_KEY_PASS_VERIFIER) !== null;
};

export const setMasterPassword = async (password: string): Promise<void> => {
    setMasterKey(password);
    // Store a verifier. In a real app, this would be a securely hashed version of the password.
    // Here we just store an encrypted known value.
    const verifier = encrypt('password_is_correct');
    localStorage.setItem(STORAGE_KEY_PASS_VERIFIER, verifier);
};

export const verifyMasterPassword = async (password: string): Promise<boolean> => {
    setMasterKey(password);
    const verifier = localStorage.getItem(STORAGE_KEY_PASS_VERIFIER);
    if (!verifier) return false;
    try {
        const decrypted = decrypt(verifier);
        return decrypted === 'password_is_correct';
    } catch (e) {
        return false;
    }
};

export const saveData = async (data: AppData): Promise<void> => {
    const jsonString = JSON.stringify(data);
    const encryptedData = encrypt(jsonString);
    localStorage.setItem(STORAGE_KEY_DATA, encryptedData);
};

export const loadData = async (): Promise<AppData> => {
    const encryptedData = localStorage.getItem(STORAGE_KEY_DATA);
    if (!encryptedData) {
        return { characters: [], chatSessions: [], plugins: [] };
    }
    try {
        const jsonString = decrypt(encryptedData);
        const data = JSON.parse(jsonString) as AppData;
        // Ensure all top-level keys exist for backward compatibility
        return {
            characters: data.characters || [],
            chatSessions: data.chatSessions || [],
            plugins: data.plugins || []
        };
    } catch (e) {
        console.error("Failed to decrypt or parse data. Data might be corrupted or password is wrong.", e);
        // On decryption failure, returning empty state prevents app crash
        return { characters: [], chatSessions: [], plugins: [] };
    }
};
