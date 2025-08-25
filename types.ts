export interface CryptoKeys {
    publicKey: JsonWebKey;
    privateKey: JsonWebKey;
}

export interface Message {
  role: 'user' | 'model' | 'narrator';
  content: string;
  timestamp: string;
  characterId?: string; // Identifies which character sent a 'model' message
  attachment?: {
    type: 'image';
    status: 'loading' | 'done' | 'error';
    url?: string;
    prompt?: string;
  };
  // New security fields
  signature?: string; // Signed by user or character's private key
  publicKeyJwk?: JsonWebKey; // Public key of the signer for verification
}

export interface ChatSession {
  id: string;
  characterIds: string[];
  name: string;
  messages: Message[];
}

export interface ApiConfig {
  service: 'default' | 'gemini' | 'openai';
  apiKey?: string;
  apiEndpoint?: string; // Base URL for OpenAI-compatible
  model?: string;
}

export interface Character {
  id: string;
  name: string;
  description: string;
  personality: string; // Will be used as Role Instruction
  avatarUrl: string;
  tags: string[];
  createdAt: string;
  apiConfig?: ApiConfig;
  // New fields for more detailed characters
  physicalAppearance?: string;
  personalityTraits?: string; // Comma-separated
  lore?: string[];
  memory?: string;
  voiceURI?: string; // For Text-to-Speech
  // New security fields
  keys?: CryptoKeys; // Character's own signing key pair
  signature?: string; // Signed by the USER's master private key
  userPublicKeyJwk?: JsonWebKey; // User's public key that signed this character
}

export interface Plugin {
  id: string;
  name: string;
  description: string;
  code: string;
  enabled: boolean;
  settings?: {
    [key:string]: any;
  };
}

export interface AppData {
  characters: Character[];
  chatSessions: ChatSession[];
  plugins?: Plugin[];
  // New security field
  userKeys?: CryptoKeys;
}

// Types for the secure plugin API bridge
export type GeminiApiRequest = 
  | { type: 'generateContent'; prompt: string }
  | { type: 'generateImage'; prompt: string, settings?: { [key: string]: any } };

export interface PluginApiRequest {
  ticket: number;
  apiRequest: GeminiApiRequest;
}

export interface PluginApiResponse {
  ticket: number;
  result?: any;
  error?: string;
}