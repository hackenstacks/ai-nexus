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
}

export interface Plugin {
  id: string;
  name: string;
  description: string;
  code: string;
  enabled: boolean;
  settings?: {
    [key: string]: any;
  };
}

export interface AppData {
  characters: Character[];
  chatSessions: ChatSession[];
  plugins?: Plugin[];
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
