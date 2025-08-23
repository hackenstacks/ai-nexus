import { AppData, ChatSession } from '../types';
import { STORAGE_KEY_DATA, STORAGE_KEY_PASS_VERIFIER } from '../constants';
import { logger } from './loggingService';

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

// --- IndexedDB setup ---
const DB_NAME = 'AINexusDB';
const STORE_NAME = 'appDataStore';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

const getDB = (): Promise<IDBDatabase> => {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            if (typeof indexedDB === 'undefined') {
                return reject(new Error('IndexedDB is not supported in this browser.'));
            }
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                logger.error("IndexedDB error:", request.error);
                reject("Error opening DB");
            };
            request.onsuccess = () => {
                resolve(request.result);
            };
            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
        });
    }
    return dbPromise;
};

const getFromDB = async (key: string): Promise<any> => {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(key);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
};

const setToDB = async (key: string, value: any): Promise<void> => {
    const db = await getDB();
    return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(value, key);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
};

// A helper to migrate a single key from localStorage to IndexedDB
const migrateKey = async (key: string) => {
    try {
        const lsValue = localStorage.getItem(key);
        if (lsValue !== null) {
            await setToDB(key, lsValue);
            localStorage.removeItem(key);
            logger.log(`Migrated '${key}' from localStorage to IndexedDB.`);
        }
    } catch (e) {
        logger.error(`Failed to migrate '${key}' to IndexedDB:`, e);
    }
};

export const hasMasterPassword = async (): Promise<boolean> => {
    // Check for localStorage and migrate if necessary
    await migrateKey(STORAGE_KEY_PASS_VERIFIER);
    const verifier = await getFromDB(STORAGE_KEY_PASS_VERIFIER);
    return verifier !== undefined && verifier !== null;
};

export const setMasterPassword = async (password: string): Promise<void> => {
    setMasterKey(password);
    // Store a verifier. In a real app, this would be a securely hashed version of the password.
    // Here we just store an encrypted known value.
    const verifier = encrypt('password_is_correct');
    await setToDB(STORAGE_KEY_PASS_VERIFIER, verifier);
    // Clear any old localStorage value on new password set
    localStorage.removeItem(STORAGE_KEY_PASS_VERIFIER);
};

export const verifyMasterPassword = async (password: string): Promise<boolean> => {
    setMasterKey(password);
    // Migration check. Even if hasMasterPassword ran, a user might reload on the auth screen.
    await migrateKey(STORAGE_KEY_PASS_VERIFIER);
    const verifier = await getFromDB(STORAGE_KEY_PASS_VERIFIER);
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
    try {
        await setToDB(STORAGE_KEY_DATA, encryptedData);
    } catch (e) {
        logger.error("Failed to save data to IndexedDB:", e);
        // Re-throw to allow callers (like import) to handle it
        throw e;
    }
};

export const loadData = async (): Promise<AppData> => {
    // Migration check for main data
    let encryptedData: string | undefined;
    try {
        const lsData = localStorage.getItem(STORAGE_KEY_DATA);
        encryptedData = await getFromDB(STORAGE_KEY_DATA);

        if (!encryptedData && lsData) {
            logger.log("Migrating main app data from localStorage to IndexedDB...");
            encryptedData = lsData;
            await setToDB(STORAGE_KEY_DATA, lsData);
            localStorage.removeItem(STORAGE_KEY_DATA);
        }
    } catch (e) {
        logger.error("Failed to load or migrate data:", e);
        // Fallback to empty if DB fails completely
        return { characters: [], chatSessions: [], plugins: [] };
    }

    if (!encryptedData) {
        return { characters: [], chatSessions: [], plugins: [] };
    }
    try {
        const jsonString = decrypt(encryptedData);
        const data = JSON.parse(jsonString) as AppData;

        // Migration logic for chat sessions
        if (data.chatSessions && data.chatSessions.length > 0) {
            data.chatSessions = data.chatSessions.map((session: any) => {
                if (session.characterId && !session.characterIds) {
                    logger.log("Migrating old chat session format for session ID:", session.id);
                    const character = data.characters.find(c => c.id === session.characterId);
                    const migratedSession: ChatSession = {
                        id: session.id,
                        characterIds: [session.characterId],
                        name: character ? `Chat with ${character.name}` : 'Untitled Chat',
                        messages: session.messages
                    };
                    return migratedSession;
                }
                return session as ChatSession;
            });
        }

        // Ensure all top-level keys exist for backward compatibility
        return {
            characters: data.characters || [],
            chatSessions: data.chatSessions || [],
            plugins: data.plugins || []
        };
    } catch (e) {
        logger.error("Failed to decrypt or parse data. Data might be corrupted or password is wrong.", e);
        // On decryption failure, returning empty state prevents app crash
        return { characters: [], chatSessions: [], plugins: [] };
    }
};
