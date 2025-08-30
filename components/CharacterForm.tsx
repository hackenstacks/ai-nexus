import React, { useState, useEffect, useRef } from 'react';
import { Character, ApiConfig, EmbeddingConfig, RagSource } from '../types';
import * as ttsService from '../services/ttsService';
import * as ragService from '../services/ragService';
import { logger } from '../services/loggingService';
import { TrashIcon } from './icons/TrashIcon';
import { UploadIcon } from './icons/UploadIcon';
import { SparklesIcon } from './icons/SparklesIcon';
import { SpinnerIcon } from './icons/SpinnerIcon';

interface CharacterFormProps {
  character: Character | null;
  onSave: (character: Character) => void;
  onCancel: () => void;
  onDeleteRagSource: (characterId: string, sourceId: string) => Promise<void>;
  onGenerateImage: (prompt: string) => Promise<string | null>;
}

const defaultApiConfig: ApiConfig = {
    service: 'default',
    apiKey: '',
    apiEndpoint: '',
    model: ''
};

const defaultEmbeddingConfig: EmbeddingConfig = {
    service: 'gemini',
    apiKey: '',
    apiEndpoint: 'http://localhost:11434/api/embeddings',
    model: 'nomic-embed-text'
};

const examplePluginCode = `// This code runs in a secure sandbox right before this character generates a response.
// You can use it to dynamically alter their behavior.
// The 'nexus' object provides logging and access to hooks.

nexus.hooks.register('beforeResponseGenerate', (payload) => {
  // The payload contains the data for the upcoming API call.
  // payload: { history: Message[], systemOverride?: string }
  
  nexus.log('Character plugin is running...');

  // Example: Make the character always respond in a pirate accent.
  const pirateInstruction = 'For this response, you must speak like a pirate.';
  
  if (payload.systemOverride) {
    // If an override already exists (e.g., from a /sys command), append to it.
    payload.systemOverride += \`\\n\${pirateInstruction}\`;
  } else {
    payload.systemOverride = pirateInstruction;
  }
  
  // You must return the modified payload object.
  return payload;
});
`;

const Section: React.FC<{ title: string, children: React.ReactNode, defaultOpen?: boolean }> = ({ title, children, defaultOpen = true }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <div className="rounded-md border border-nexus-gray-light-400 dark:border-nexus-gray-700 bg-nexus-gray-light-200/50 dark:bg-nexus-gray-800/50">
            <button type="button" onClick={() => setIsOpen(!isOpen)} className="w-full text-left p-4 flex justify-between items-center">
                <h3 className="text-lg font-medium text-nexus-gray-900 dark:text-white">{title}</h3>
                <svg className={`w-5 h-5 text-nexus-gray-700 dark:text-nexus-gray-400 transform transition-transform ${isOpen ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
            </button>
            {isOpen && <div className="p-4 border-t border-nexus-gray-light-400 dark:border-nexus-gray-700 space-y-4">{children}</div>}
        </div>
    );
}

export const CharacterForm: React.FC<CharacterFormProps> = ({ character, onSave, onCancel, onDeleteRagSource, onGenerateImage }) => {
  const [formState, setFormState] = useState<Character>({} as Character);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [indexingStatus, setIndexingStatus] = useState<string | null>(null);
  const [isGeneratingAvatar, setIsGeneratingAvatar] = useState(false);
  
  const ragFileInputRef = useRef<HTMLInputElement>(null);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ttsService.isSupported()) {
        ttsService.getVoices().then(availableVoices => {
            if (availableVoices.length > 0) {
                setVoices(availableVoices);
            }
        });
    }
  }, []);

  useEffect(() => {
    if (character) {
        setFormState({
            ...character,
            tags: character.tags || [],
            lore: character.lore || [],
            memory: character.memory || 'No memories yet.',
            ragSources: character.ragSources || [],
            embeddingConfig: character.embeddingConfig || defaultEmbeddingConfig,
            apiConfig: character.apiConfig || defaultApiConfig,
            pluginEnabled: character.pluginEnabled || false,
            pluginCode: character.pluginCode || '',
        });
    } else {
        setFormState({
            id: '', // Will be set on save
            name: '',
            description: '',
            personality: '',
            avatarUrl: '',
            tags: [],
            createdAt: '', // Will be set on save
            physicalAppearance: '',
            personalityTraits: '',
            lore: [],
            memory: 'No memories yet.',
            voiceURI: '',
            apiConfig: defaultApiConfig,
            ragEnabled: false,
            embeddingConfig: defaultEmbeddingConfig,
            ragSources: [],
            pluginEnabled: false,
            pluginCode: examplePluginCode,
        });
    }
  }, [character]);

  const handleFormChange = <K extends keyof Character>(key: K, value: Character[K]) => {
      setFormState(prev => ({ ...prev, [key]: value }));
  };
  
  const handleApiConfigChange = <K extends keyof ApiConfig>(key: K, value: ApiConfig[K]) => {
      setFormState(prev => ({ ...prev, apiConfig: { ...prev.apiConfig!, [key]: value }}));
  };
  
  const handleEmbeddingConfigChange = <K extends keyof EmbeddingConfig>(key: K, value: EmbeddingConfig[K]) => {
      setFormState(prev => ({ ...prev, embeddingConfig: { ...prev.embeddingConfig!, [key]: value }}));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.name.trim()) return;

    const characterToSave: Character = {
      ...formState,
      id: character?.id || crypto.randomUUID(),
      createdAt: character?.createdAt || new Date().toISOString(),
      apiConfig: {
        ...formState.apiConfig,
        apiKey: formState.apiConfig?.apiKey?.trim(),
        apiEndpoint: formState.apiConfig?.apiEndpoint?.trim(),
        model: formState.apiConfig?.model?.trim(),
      },
       embeddingConfig: {
        ...formState.embeddingConfig,
        apiKey: formState.embeddingConfig?.apiKey?.trim(),
        apiEndpoint: formState.embeddingConfig?.apiEndpoint?.trim(),
        model: formState.embeddingConfig?.model?.trim(),
      }
    };
    onSave(characterToSave);
  };
  
  const handleRagFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !character) return;
      
      try {
        setIndexingStatus(`Processing "${file.name}"...`);
        const newSource = await ragService.processAndIndexFile(file, character, (progress) => {
            setIndexingStatus(progress);
        });

        const updatedCharacter = {
            ...formState,
            ragSources: [...(formState.ragSources || []), newSource]
        };
        setFormState(updatedCharacter);
        onSave(updatedCharacter); // Persist the new source
        setIndexingStatus(`Successfully indexed "${file.name}"!`);
      } catch (error) {
        logger.error("File indexing failed:", error);
        setIndexingStatus(`Error indexing "${file.name}": ${error instanceof Error ? error.message : "Unknown error"}`);
      } finally {
        if(ragFileInputRef.current) ragFileInputRef.current.value = "";
        setTimeout(() => setIndexingStatus(null), 5000);
      }
  };

  const handleAvatarFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) { // 2MB limit
      alert("File is too large. Please select an image under 2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      handleFormChange('avatarUrl', reader.result as string);
    };
    reader.onerror = (error) => {
        logger.error("Failed to read avatar file:", error);
        alert("Failed to read file.");
    };
    reader.readAsDataURL(file);
    if(avatarFileInputRef.current) avatarFileInputRef.current.value = "";
  };

  const generateAvatar = async (prompt: string) => {
    setIsGeneratingAvatar(true);
    try {
        const imageUrl = await onGenerateImage(prompt);
        if (imageUrl) {
            handleFormChange('avatarUrl', imageUrl);
        }
    } finally {
        setIsGeneratingAvatar(false);
    }
  };

  const handleGenerateFromPrompt = () => {
    const prompt = window.prompt("Enter a prompt for the new avatar:");
    if (prompt) {
        generateAvatar(prompt);
    }
  };

  const handleGenerateFromDescription = () => {
    if (formState.physicalAppearance?.trim()) {
        generateAvatar(formState.physicalAppearance);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-nexus-gray-light-200 dark:bg-nexus-gray-900 h-full">
      <header className="flex items-center p-4 border-b border-nexus-gray-light-300 dark:border-nexus-gray-700 flex-shrink-0">
          <h2 className="text-xl font-bold text-nexus-gray-900 dark:text-white">
            {character ? 'Edit Character' : 'Create New Character'}
          </h2>
      </header>
      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl mx-auto">

            <Section title="Core Identity">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300">Name</label>
                  <input
                    id="name"
                    type="text"
                    value={formState.name || ''}
                    onChange={(e) => handleFormChange('name', e.target.value)}
                    required
                    className="mt-1 block w-full bg-nexus-gray-light-100 dark:bg-nexus-gray-800 border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-md shadow-sm py-2 px-3 text-nexus-gray-900 dark:text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
                  />
                </div>
                 <div>
                  <label className="block text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300">Avatar</label>
                  <div className="mt-2 flex items-center space-x-6">
                     <div className="relative flex-shrink-0">
                        <img
                            src={formState.avatarUrl || 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='}
                            alt="Avatar Preview"
                            className="w-24 h-24 rounded-full object-cover bg-nexus-gray-light-300 dark:bg-nexus-gray-700 border border-nexus-gray-light-400 dark:border-nexus-gray-600"
                        />
                        {isGeneratingAvatar && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-full">
                                <SpinnerIcon className="animate-spin h-8 w-8 text-white" />
                            </div>
                        )}
                     </div>
                     <div className="flex-grow space-y-2">
                        <input type="file" ref={avatarFileInputRef} onChange={handleAvatarFileChange} accept="image/png, image/jpeg, image/webp" className="hidden" />
                        <button type="button" onClick={() => avatarFileInputRef.current?.click()} className="w-full flex items-center justify-center space-x-2 px-3 py-2 text-sm font-medium text-center rounded-md bg-nexus-gray-light-300 dark:bg-nexus-gray-700 hover:bg-nexus-gray-light-400 dark:hover:bg-nexus-gray-600 transition-colors">
                            <UploadIcon className="w-4 h-4" />
                            <span>Upload File</span>
                        </button>
                        <button type="button" onClick={handleGenerateFromDescription} disabled={!formState.physicalAppearance?.trim() || isGeneratingAvatar} className="w-full flex items-center justify-center space-x-2 px-3 py-2 text-sm font-medium text-center rounded-md bg-nexus-gray-light-300 dark:bg-nexus-gray-700 hover:bg-nexus-gray-light-400 dark:hover:bg-nexus-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                            <SparklesIcon className="w-4 h-4" />
                            <span>Generate from Description</span>
                        </button>
                         <button type="button" onClick={handleGenerateFromPrompt} disabled={isGeneratingAvatar} className="w-full flex items-center justify-center space-x-2 px-3 py-2 text-sm font-medium text-center rounded-md bg-nexus-gray-light-300 dark:bg-nexus-gray-700 hover:bg-nexus-gray-light-400 dark:hover:bg-nexus-gray-600 transition-colors">
                            <SparklesIcon className="w-4 h-4" />
                            <span>Generate from Prompt...</span>
                        </button>
                     </div>
                  </div>
                  <div className="mt-4">
                    <label htmlFor="avatarUrl" className="block text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300">Or paste image URL</label>
                     <input
                      id="avatarUrl"
                      type="text"
                      value={formState.avatarUrl || ''}
                      onChange={(e) => handleFormChange('avatarUrl', e.target.value)}
                      className="mt-1 block w-full bg-nexus-gray-light-100 dark:bg-nexus-gray-800 border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-md shadow-sm py-2 px-3 text-nexus-gray-900 dark:text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
                      placeholder="https://example.com/avatar.png"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300">Description</label>
                  <textarea
                    id="description"
                    value={formState.description || ''}
                    onChange={(e) => handleFormChange('description', e.target.value)}
                    rows={3}
                    className="mt-1 block w-full bg-nexus-gray-light-100 dark:bg-nexus-gray-800 border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-md shadow-sm py-2 px-3 text-nexus-gray-900 dark:text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
                    placeholder="A brief, one-sentence description of the character."
                  />
                </div>
                <div>
                  <label htmlFor="tags" className="block text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300">Tags</label>
                  <input
                    id="tags"
                    type="text"
                    value={(formState.tags || []).join(', ')}
                    onChange={(e) => handleFormChange('tags', e.target.value.split(',').map(tag => tag.trim()))}
                    className="mt-1 block w-full bg-nexus-gray-light-100 dark:bg-nexus-gray-800 border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-md shadow-sm py-2 px-3 text-nexus-gray-900 dark:text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
                    placeholder="Comma-separated, e.g., sci-fi, assistant, funny"
                  />
                </div>
            </Section>
            
            <Section title="Persona & Prompting">
                 <div>
                  <label htmlFor="physicalAppearance" className="block text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300">Physical Appearance</label>
                  <textarea
                    id="physicalAppearance"
                    value={formState.physicalAppearance || ''}
                    onChange={(e) => handleFormChange('physicalAppearance', e.target.value)}
                    rows={3}
                    className="mt-1 block w-full bg-nexus-gray-light-100 dark:bg-nexus-gray-800 border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-md shadow-sm py-2 px-3 text-nexus-gray-900 dark:text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
                    placeholder="Describe the character's physical appearance in detail."
                  />
                </div>
                <div>
                  <label htmlFor="personalityTraits" className="block text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300">Personality Traits</label>
                  <input
                    id="personalityTraits"
                    type="text"
                    value={formState.personalityTraits || ''}
                    onChange={(e) => handleFormChange('personalityTraits', e.target.value)}
                    className="mt-1 block w-full bg-nexus-gray-light-100 dark:bg-nexus-gray-800 border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-md shadow-sm py-2 px-3 text-nexus-gray-900 dark:text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
                    placeholder="Comma-separated traits, e.g., witty, sarcastic, kind, curious"
                  />
                </div>
                {voices.length > 0 && (
                  <div>
                    <label htmlFor="voice" className="block text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300">Voice</label>
                    <select
                      id="voice"
                      value={formState.voiceURI || ''}
                      onChange={(e) => handleFormChange('voiceURI', e.target.value)}
                      className="mt-1 block w-full bg-nexus-gray-light-100 dark:bg-nexus-gray-800 border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-md shadow-sm py-2 px-3 text-nexus-gray-900 dark:text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
                    >
                      <option value="">Default Voice</option>
                      {voices.map(voice => (
                        <option key={voice.voiceURI} value={voice.voiceURI}>
                          {`${voice.name} (${voice.lang})`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                 <div>
                  <label htmlFor="personality" className="block text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300">Role Instruction / System Prompt</label>
                  <textarea
                    id="personality"
                    value={formState.personality || ''}
                    onChange={(e) => handleFormChange('personality', e.target.value)}
                    rows={8}
                    className="mt-1 block w-full bg-nexus-gray-light-100 dark:bg-nexus-gray-800 border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-md shadow-sm py-2 px-3 text-nexus-gray-900 dark:text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
                    placeholder="Describe the character's personality, quirks, and conversation style. This is the main system prompt that guides the AI's behavior."
                  />
                </div>
            </Section>

            <Section title="Memory & Lore">
                 <div>
                    <label htmlFor="lore" className="block text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300">Lore</label>
                    <p className="text-xs text-nexus-gray-700 dark:text-nexus-gray-400 mb-1">Key facts about the character. Add new facts in chat with '/lore [fact]'. One fact per line.</p>
                    <textarea
                        id="lore"
                        value={(formState.lore || []).join('\n')}
                        onChange={(e) => handleFormChange('lore', e.target.value.split('\n'))}
                        rows={8}
                        className="mt-1 block w-full bg-nexus-gray-light-100 dark:bg-nexus-gray-800 border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-md shadow-sm py-2 px-3 text-nexus-gray-900 dark:text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
                        placeholder="Fact 1 about the character...&#10;Fact 2 about the character..."
                    />
                </div>
                 <div>
                    <label htmlFor="memory" className="block text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300">Memory</label>
                     <p className="text-xs text-nexus-gray-700 dark:text-nexus-gray-400 mb-1">Automatically summarized highlights from conversations.</p>
                    <textarea
                        id="memory"
                        value={formState.memory || ''}
                        readOnly
                        rows={6}
                        className="mt-1 block w-full bg-nexus-gray-light-300 dark:bg-nexus-dark border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-md shadow-sm py-2 px-3 text-nexus-gray-800 dark:text-nexus-gray-300 focus:outline-none cursor-not-allowed"
                    />
                </div>
            </Section>

            <Section title="Character Logic (Experimental)" defaultOpen={false}>
                <div className="flex items-center space-x-3">
                    <label htmlFor="plugin-enabled" className="text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300">Enable Character Logic</label>
                    <button
                        type="button"
                        onClick={() => handleFormChange('pluginEnabled', !formState.pluginEnabled)}
                        className={`${formState.pluginEnabled ? 'bg-nexus-blue-600' : 'bg-nexus-gray-light-400 dark:bg-nexus-gray-600'} relative inline-flex h-6 w-11 items-center rounded-full`}
                        >
                        <span className={`${formState.pluginEnabled ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition`}/>
                    </button>
                </div>
                {formState.pluginEnabled && (
                    <div className="space-y-4 pt-4 border-t border-nexus-gray-light-400 dark:border-nexus-gray-700 mt-4">
                        <p className="text-xs text-nexus-gray-700 dark:text-nexus-gray-400">
                            Write custom JavaScript that runs in a secure sandbox before this character generates a response. This allows for dynamic, complex behaviors. The code has access to a special <code className="bg-nexus-gray-light-300 dark:bg-nexus-dark px-1 rounded">nexus</code> object to register a <code className="bg-nexus-gray-light-300 dark:bg-nexus-dark px-1 rounded">'beforeResponseGenerate'</code> hook.
                        </p>
                        <div className="flex flex-col h-72">
                            <label htmlFor="pluginCode" className="block text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300 mb-1">Plugin Code</label>
                            <textarea
                                id="pluginCode"
                                value={formState.pluginCode || ''}
                                onChange={(e) => handleFormChange('pluginCode', e.target.value)}
                                className="flex-1 w-full bg-nexus-light dark:bg-nexus-dark border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-md py-2 px-3 text-nexus-gray-900 dark:text-white font-mono text-sm focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500 resize-none"
                                spellCheck="false"
                                placeholder="nexus.hooks.register('beforeResponseGenerate', (payload) => { ... });"
                            />
                        </div>
                    </div>
                )}
            </Section>
            
            <Section title="Chat API Configuration" defaultOpen={false}>
                <div className="space-y-4">
                    <div>
                        <label htmlFor="api-service" className="block text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300">API Service</label>
                        <select 
                            id="api-service"
                            value={formState.apiConfig?.service || 'default'}
                            onChange={(e) => handleApiConfigChange('service', e.target.value as ApiConfig['service'])}
                            className="mt-1 block w-full bg-nexus-gray-light-100 dark:bg-nexus-gray-800 border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-md shadow-sm py-2 px-3 text-nexus-gray-900 dark:text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
                        >
                            <option value="default">Default (Gemini)</option>
                            <option value="gemini">Google Gemini (Custom Key)</option>
                            <option value="openai">OpenAI-Compatible (e.g., Ollama)</option>
                        </select>
                    </div>
                    {formState.apiConfig?.service === 'gemini' && (
                         <div>
                            <label htmlFor="api-key" className="block text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300">Gemini API Key</label>
                            <input
                                id="api-key"
                                type="password"
                                value={formState.apiConfig.apiKey || ''}
                                onChange={(e) => handleApiConfigChange('apiKey', e.target.value)}
                                className="mt-1 block w-full bg-nexus-gray-light-100 dark:bg-nexus-gray-800 border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-md shadow-sm py-2 px-3 text-nexus-gray-900 dark:text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
                                placeholder="Enter your Gemini API key"
                            />
                        </div>
                    )}
                     {formState.apiConfig?.service === 'openai' && (
                        <>
                            <div>
                                <label htmlFor="api-endpoint" className="block text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300">API Endpoint</label>
                                <input
                                    id="api-endpoint"
                                    type="text"
                                    value={formState.apiConfig.apiEndpoint || ''}
                                    onChange={(e) => handleApiConfigChange('apiEndpoint', e.target.value)}
                                    className="mt-1 block w-full bg-nexus-gray-light-100 dark:bg-nexus-gray-800 border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-md py-2 px-3 text-nexus-gray-900 dark:text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
                                    placeholder="e.g., http://localhost:11434/v1/chat/completions"
                                />
                            </div>
                             <div>
                                <label htmlFor="api-key" className="block text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300">API Key</label>
                                <input
                                    id="api-key"
                                    type="password"
                                    value={formState.apiConfig.apiKey || ''}
                                    onChange={(e) => handleApiConfigChange('apiKey', e.target.value)}
                                    className="mt-1 block w-full bg-nexus-gray-light-100 dark:bg-nexus-gray-800 border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-md py-2 px-3 text-nexus-gray-900 dark:text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
                                    placeholder="API Key (optional for some services)"
                                />
                            </div>
                            <div>
                                <label htmlFor="api-model" className="block text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300">Model Name</label>
                                <input
                                    id="api-model"
                                    type="text"
                                    value={formState.apiConfig.model || ''}
                                    onChange={(e) => handleApiConfigChange('model', e.target.value)}
                                    className="mt-1 block w-full bg-nexus-gray-light-100 dark:bg-nexus-gray-800 border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-md py-2 px-3 text-nexus-gray-900 dark:text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
                                    placeholder="e.g., llama3"
                                />
                            </div>
                        </>
                    )}
                    {(formState.apiConfig?.service === 'gemini' || formState.apiConfig?.service === 'openai') && (
                        <div>
                            <label htmlFor="api-rate-limit" className="block text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300">Request Delay (ms)</label>
                            <input
                                id="api-rate-limit"
                                type="number"
                                value={formState.apiConfig.rateLimit || ''}
                                onChange={(e) => handleApiConfigChange('rateLimit', e.target.value ? parseInt(e.target.value, 10) : undefined)}
                                className="mt-1 block w-full bg-nexus-gray-light-100 dark:bg-nexus-gray-800 border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-md py-2 px-3 text-nexus-gray-900 dark:text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
                                placeholder="e.g., 1000 (for 1 request per second)"
                                min="0"
                            />
                            <p className="text-xs text-nexus-gray-700 dark:text-nexus-gray-400 mt-1">Minimum time to wait between requests from this character to avoid rate limits.</p>
                        </div>
                    )}
                </div>
            </Section>

            <Section title="Retrieval-Augmented Generation (RAG)" defaultOpen={false}>
                <div className="flex items-center space-x-3">
                    <label htmlFor="rag-enabled" className="text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300">Enable RAG</label>
                    <button
                        type="button"
                        onClick={() => handleFormChange('ragEnabled', !formState.ragEnabled)}
                        className={`${formState.ragEnabled ? 'bg-nexus-blue-600' : 'bg-nexus-gray-light-400 dark:bg-nexus-gray-600'} relative inline-flex h-6 w-11 items-center rounded-full`}
                        >
                        <span className={`${formState.ragEnabled ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition`}/>
                    </button>
                </div>
                {formState.ragEnabled && (
                    <div className="space-y-4 pt-4 border-t border-nexus-gray-light-400 dark:border-nexus-gray-700 mt-4">
                         <p className="text-xs text-nexus-gray-700 dark:text-nexus-gray-400">
                            Enable this to allow the character to retrieve information from uploaded documents to answer questions. An embedding API is required.
                         </p>
                        
                        <h4 className="text-md font-semibold">Knowledge Base</h4>
                        <div className="p-2 border border-dashed border-nexus-gray-500 dark:border-nexus-gray-600 rounded-md space-y-2">
                            {(formState.ragSources || []).map(source => (
                                <div key={source.id} className="flex items-center justify-between bg-nexus-gray-light-300 dark:bg-nexus-gray-700 p-2 rounded">
                                    <span className="text-sm truncate">{source.fileName}</span>
                                    <button type="button" onClick={() => onDeleteRagSource(character!.id, source.id)} className="p-1 text-red-500 hover:text-red-400">
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                             {character && (
                                <>
                                    <input type="file" ref={ragFileInputRef} onChange={handleRagFileUpload} accept=".txt,.md" className="hidden" disabled={!!indexingStatus} />
                                    <button type="button" onClick={() => ragFileInputRef.current?.click()} disabled={!!indexingStatus} className="w-full flex items-center justify-center space-x-2 px-3 py-2 text-sm font-medium text-center rounded-md bg-nexus-gray-light-400 dark:bg-nexus-gray-600 hover:bg-nexus-gray-light-500 dark:hover:bg-nexus-gray-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                        <UploadIcon className="w-4 h-4" />
                                        <span>Upload Knowledge File (.txt, .md)</span>
                                    </button>
                                </>
                            )}
                            {indexingStatus && <p className="text-xs text-center text-nexus-gray-700 dark:text-nexus-gray-400 p-2">{indexingStatus}</p>}
                        </div>

                        <h4 className="text-md font-semibold pt-4 border-t border-nexus-gray-light-400 dark:border-nexus-gray-700">Embedding API Configuration</h4>
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="embed-api-service" className="block text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300">Embedding Service</label>
                                <select 
                                    id="embed-api-service"
                                    value={formState.embeddingConfig?.service || 'gemini'}
                                    onChange={(e) => handleEmbeddingConfigChange('service', e.target.value as EmbeddingConfig['service'])}
                                    className="mt-1 block w-full bg-nexus-gray-light-100 dark:bg-nexus-gray-800 border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-md shadow-sm py-2 px-3 text-nexus-gray-900 dark:text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
                                >
                                    <option value="gemini">Google Gemini</option>
                                    <option value="openai">OpenAI-Compatible (e.g., Ollama)</option>
                                </select>
                            </div>
                             {formState.embeddingConfig?.service === 'gemini' && (
                                 <div>
                                    <label htmlFor="embed-api-key" className="block text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300">Gemini API Key</label>
                                    <input
                                        id="embed-api-key"
                                        type="password"
                                        value={formState.embeddingConfig.apiKey || ''}
                                        onChange={(e) => handleEmbeddingConfigChange('apiKey', e.target.value)}
                                        className="mt-1 block w-full bg-nexus-gray-light-100 dark:bg-nexus-gray-800 border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-md py-2 px-3 text-nexus-gray-900 dark:text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
                                        placeholder="Leave blank to use default key"
                                    />
                                </div>
                            )}
                             {formState.embeddingConfig?.service === 'openai' && (
                                <>
                                    <div>
                                        <label htmlFor="embed-api-endpoint" className="block text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300">API Endpoint</label>
                                        <input
                                            id="embed-api-endpoint"
                                            type="text"
                                            value={formState.embeddingConfig.apiEndpoint || ''}
                                            onChange={(e) => handleEmbeddingConfigChange('apiEndpoint', e.target.value)}
                                            className="mt-1 block w-full bg-nexus-gray-light-100 dark:bg-nexus-gray-800 border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-md py-2 px-3 text-nexus-gray-900 dark:text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
                                            placeholder="e.g., http://localhost:11434/api/embeddings"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="embed-api-key" className="block text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300">API Key</label>
                                        <input
                                            id="embed-api-key"
                                            type="password"
                                            value={formState.embeddingConfig.apiKey || ''}
                                            onChange={(e) => handleEmbeddingConfigChange('apiKey', e.target.value)}
                                            className="mt-1 block w-full bg-nexus-gray-light-100 dark:bg-nexus-gray-800 border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-md py-2 px-3 text-nexus-gray-900 dark:text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
                                            placeholder="API Key (optional for some services)"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="embed-api-model" className="block text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300">Model Name</label>
                                        <input
                                            id="embed-api-model"
                                            type="text"
                                            value={formState.embeddingConfig.model || ''}
                                            onChange={(e) => handleEmbeddingConfigChange('model', e.target.value)}
                                            className="mt-1 block w-full bg-nexus-gray-light-100 dark:bg-nexus-gray-800 border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-md py-2 px-3 text-nexus-gray-900 dark:text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
                                            placeholder="e.g., nomic-embed-text"
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </Section>
           
            <div className="flex justify-end space-x-4 pt-4 pb-4">
              <button
                type="button"
                onClick={onCancel}
                className="py-2 px-4 border border-nexus-gray-light-500 dark:border-nexus-gray-600 rounded-md shadow-sm text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300 bg-nexus-gray-light-300 dark:bg-nexus-gray-700 hover:bg-nexus-gray-light-400 dark:hover:bg-nexus-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-nexus-gray-light-200 dark:focus:ring-offset-nexus-gray-900 focus:ring-nexus-gray-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-nexus-blue-600 hover:bg-nexus-blue-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-nexus-gray-light-200 dark:focus:ring-offset-nexus-gray-900 focus:ring-nexus-blue-500"
              >
                Save Character
              </button>
            </div>
        </form>
      </div>
    </div>
  );
};