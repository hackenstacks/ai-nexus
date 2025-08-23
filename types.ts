export interface Message {
  role: 'user' | 'model';
  content: string;
  timestamp: string;
  attachment?: {
    type: 'image';
    status: 'loading' | 'done' | 'error';
    url?: string;
    prompt?: string;
  };
}

export interface ChatSession {
  id: string;
  characterId: string;
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
  personality: string;
  avatarUrl: string;
  tags: string[];
  createdAt: string;
  apiConfig?: ApiConfig;
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
  | { type: 'generateImage'; prompt: string };

export interface PluginApiRequest {
  ticket: number;
  apiRequest: GeminiApiRequest;
}

export interface PluginApiResponse {
  ticket: number;
  result?: any;
  error?: string;
}
