import { AppData, ChatSession, VectorChunk, Character } from '../types';
import { STORAGE_KEY_DATA, STORAGE_KEY_PASS_VERIFIER, STORAGE_KEY_SALT } from '../constants';
import { logger } from './loggingService';

// --- Production-Grade Encryption using Web Crypto API ---
// This service implements strong, authenticated encryption for all user data.
// - Key Derivation: PBKDF2 with 100,000 iterations and a unique salt.
// - Encryption: AES-GCM with a 256-bit key.
// - IV Management: A unique 12-byte Initialization Vector (IV) is generated for each encryption
//   operation and prepended to the ciphertext.
// This ensures confidentiality, integrity, and authenticity of the stored data.

let masterCryptoKey: CryptoKey | null = null;
// This is kept ONLY for the one-time migration of legacy data
let masterPasswordForMigration: string | null = null; 

// --- Web Crypto API Helpers ---

const deriveKey = async (password: string, salt: Uint8Array): Promise<CryptoKey> => {
    const encoder = new TextEncoder();
    const baseKey = await window.crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );
    return window.crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: 100000,
            hash: 'SHA-256'
        },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
};

const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
};

const encryptData = async (data: string, key: CryptoKey): Promise<string> => {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 12 bytes is recommended for AES-GCM

    const encryptedBuffer = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        dataBuffer
    );
    
    // Prepend IV to the ciphertext for storage. This is a standard and secure practice.
    const combinedBuffer = new Uint8Array(iv.length + encryptedBuffer.byteLength);
    combinedBuffer.set(iv);
    combinedBuffer.set(new Uint8Array(encryptedBuffer), iv.length);

    return arrayBufferToBase64(combinedBuffer);
};

const decryptData = async (encryptedBase64: string, key: CryptoKey): Promise<string> => {
    const combinedBuffer = base64ToArrayBuffer(encryptedBase64);
    
    // Extract IV from the start of the buffer
    const iv = combinedBuffer.slice(0, 12);
    const ciphertext = combinedBuffer.slice(12);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        ciphertext
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
};


// --- Legacy XOR Cipher (for migration only) ---

const legacySimpleXOR = (data: string, key: string): string => {
  let output = '';
  for (let i = 0; i < data.length; i++) {
    output += String.fromCharCode(data.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return output;
};

const legacyDecrypt = (encryptedData: string, masterKey: string): string => {
    if (!masterKey) throw new Error('Legacy master key is not set for migration.');
    const utf16ToBinary = (str: string): string => unescape(encodeURIComponent(str));
    const binaryToUtf16 = (binary: string): string => decodeURIComponent(escape(binary));
    
    const binaryString = atob(encryptedData);
    const xorResult = binaryToUtf16(binaryString);
    return legacySimpleXOR(xorResult, masterKey);
};

// --- IndexedDB setup ---
const DB_NAME = 'AINexusDB';
const STORE_NAME = 'appDataStore';
const VECTOR_STORE_NAME = 'vectorStore';
const DB_VERSION = 2;

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
                if (!db.objectStoreNames.contains(VECTOR_STORE_NAME)) {
                    const vectorStore = db.createObjectStore(VECTOR_STORE_NAME, { keyPath: 'id' });
                    vectorStore.createIndex('characterId', 'characterId', { unique: false });
                    vectorStore.createIndex('sourceId', 'sourceId', { unique: false });
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
    await migrateKey(STORAGE_KEY_PASS_VERIFIER);
    const verifier = await getFromDB(STORAGE_KEY_PASS_VERIFIER);
    return verifier !== undefined && verifier !== null;
};

export const setMasterPassword = async (password: string): Promise<void> => {
    masterPasswordForMigration = password;
    
    // Generate a new salt for the new password
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(password, salt);
    masterCryptoKey = key;

    const verifier = await encryptData('password_is_correct', key);
    
    await setToDB(STORAGE_KEY_SALT, salt);
    await setToDB(STORAGE_KEY_PASS_VERIFIER, verifier);
    
    // Clear any old localStorage value on new password set
    localStorage.removeItem(STORAGE_KEY_PASS_VERIFIER);
    localStorage.removeItem(STORAGE_KEY_SALT);
};

export const verifyMasterPassword = async (password: string): Promise<boolean> => {
    masterPasswordForMigration = password; // Keep for potential data migration
    
    await migrateKey(STORAGE_KEY_PASS_VERIFIER);
    await migrateKey(STORAGE_KEY_SALT);

    const salt = await getFromDB(STORAGE_KEY_SALT);
    const verifier = await getFromDB(STORAGE_KEY_PASS_VERIFIER);
    if (!verifier) return false;

    if (salt) {
        // --- Modern Path (AES-GCM) ---
        try {
            const key = await deriveKey(password, salt);
            masterCryptoKey = key;
            const decrypted = await decryptData(verifier, key);
            return decrypted === 'password_is_correct';
        } catch (e) {
            return false;
        }
    } else {
        // --- Legacy Path (XOR) for migration ---
        try {
            const decrypted = legacyDecrypt(verifier, password);
            // If legacy login is correct, masterCryptoKey remains null.
            // This signals to loadData() that a migration is needed.
            return decrypted === 'password_is_correct';
        } catch (e) {
            return false;
        }
    }
};

export const saveData = async (data: AppData): Promise<void> => {
    if (!masterCryptoKey) throw new Error("Cannot save data: master key not available. This may happen if a legacy login occurred without a data load/migration.");

    const jsonString = JSON.stringify(data);
    const encryptedData = await encryptData(jsonString, masterCryptoKey);
    try {
        await setToDB(STORAGE_KEY_DATA, encryptedData);
    } catch (e) {
        logger.error("Failed to save data to IndexedDB:", e);
        throw e;
    }
};

export const loadData = async (): Promise<AppData> => {
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
        return { characters: [], chatSessions: [], plugins: [] };
    }

    if (!encryptedData) {
        return { characters: [], chatSessions: [], plugins: [] };
    }

    let rawData: any;
    try {
        if (masterCryptoKey) {
            // --- Modern Decryption Path ---
            const jsonString = await decryptData(encryptedData, masterCryptoKey);
            rawData = JSON.parse(jsonString);
        } else {
            // --- Legacy Decryption and Migration Path ---
            if (!masterPasswordForMigration) throw new Error("Password not available for legacy data migration.");
            
            logger.warn("No modern key found. Attempting legacy data decryption and migration...");
            const jsonString = legacyDecrypt(encryptedData, masterPasswordForMigration);
            rawData = JSON.parse(jsonString);
            logger.log("Legacy data successfully decrypted. Performing one-time security upgrade...");

            // --- Perform Security Upgrade ---
            const newSalt = window.crypto.getRandomValues(new Uint8Array(16));
            const newKey = await deriveKey(masterPasswordForMigration, newSalt);
            masterCryptoKey = newKey; // Set the key for the current session

            // Upgrade the password verifier
            const newVerifier = await encryptData('password_is_correct', newKey);
            await setToDB(STORAGE_KEY_SALT, newSalt);
            await setToDB(STORAGE_KEY_PASS_VERIFIER, newVerifier);

            // Re-encrypt and save the main data blob with the new key
            await saveData(rawData); 
            logger.log("Security upgrade complete. All data is now protected with AES-GCM.");
        }

    } catch (e) {
        logger.error("Failed to decrypt or parse data. Data might be corrupted or password is wrong.", e);
        return { characters: [], chatSessions: [], plugins: [] };
    }

    // --- Data Validation and Sanitization (Runs on data from both paths) ---
    if (typeof rawData !== 'object' || rawData === null) {
        logger.error("Loaded data is not a valid object after parsing. Data is corrupted.", { rawData });
        return { characters: [], chatSessions: [], plugins: [] };
    }

    const sanitizedCharacters: Character[] = (Array.isArray(rawData.characters) ? rawData.characters : [])
        .filter(c => c && typeof c === 'object');
    
    const sanitizedChatSessions: ChatSession[] = (Array.isArray(rawData.chatSessions) ? rawData.chatSessions : [])
        .filter(s => s && typeof s === 'object');
        
    const sanitizedPlugins = (Array.isArray(rawData.plugins) ? rawData.plugins : [])
        .filter(p => p && typeof p === 'object');

    const validatedData: AppData = {
        characters: sanitizedCharacters,
        chatSessions: sanitizedChatSessions,
        plugins: sanitizedPlugins,
        userKeys: rawData.userKeys
    };

    validatedData.chatSessions = validatedData.chatSessions.map((session: any) => {
        if (session.characterId && !session.characterIds) {
            logger.log("Migrating old chat session format for session ID:", session.id);
            const character = validatedData.characters.find(c => c.id === session.characterId);
            const migratedSession: ChatSession = {
                id: session.id,
                characterIds: [session.characterId],
                name: character ? `Chat with ${character.name}` : 'Untitled Chat',
                messages: Array.isArray(session.messages) ? session.messages : []
            };
            return migratedSession;
        }
        if (!Array.isArray(session.messages)) {
            session.messages = [];
        }
        return session as ChatSession;
    });

    return validatedData;
};

// --- Vector Store Functions ---

export const saveVectorChunks = async (chunks: VectorChunk[]): Promise<void> => {
    const db = await getDB();
    const transaction = db.transaction(VECTOR_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(VECTOR_STORE_NAME);
    for (const chunk of chunks) {
        store.put(chunk);
    }
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
};

export const getVectorChunksByCharacter = async (characterId: string): Promise<VectorChunk[]> => {
    const db = await getDB();
    const transaction = db.transaction(VECTOR_STORE_NAME, 'readonly');
    const store = transaction.objectStore(VECTOR_STORE_NAME);
    const index = store.index('characterId');
    const request = index.getAll(characterId);
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const deleteVectorChunksBySource = async (sourceId: string): Promise<void> => {
    const db = await getDB();
    const transaction = db.transaction(VECTOR_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(VECTOR_STORE_NAME);
    const index = store.index('sourceId');
    const request = index.openCursor(IDBKeyRange.only(sourceId));
    
    return new Promise((resolve, reject) => {
        request.onsuccess = () => {
            const cursor = request.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            } else {
                resolve();
            }
        };
        request.onerror = () => reject(request.error);
    });
};