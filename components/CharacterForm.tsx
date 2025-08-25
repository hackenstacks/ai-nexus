import React, { useState, useEffect } from 'react';
import { Character, ApiConfig } from '../types';
import * as ttsService from '../services/ttsService';

interface CharacterFormProps {
  character: Character | null;
  onSave: (character: Character) => void;
  onCancel: () => void;
}

const defaultApiConfig: ApiConfig = {
    service: 'default',
    apiKey: '',
    apiEndpoint: '',
    model: ''
};

const Section: React.FC<{ title: string, children: React.ReactNode }> = ({ title, children }) => {
    const [isOpen, setIsOpen] = useState(true);
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

export const CharacterForm: React.FC<CharacterFormProps> = ({ character, onSave, onCancel }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [personality, setPersonality] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [tags, setTags] = useState('');
  const [apiConfig, setApiConfig] = useState<ApiConfig>(defaultApiConfig);
  const [physicalAppearance, setPhysicalAppearance] = useState('');
  const [personalityTraits, setPersonalityTraits] = useState('');
  const [lore, setLore] = useState<string[]>([]);
  const [memory, setMemory] = useState('');
  const [voiceURI, setVoiceURI] = useState('');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

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
      setName(character.name);
      setDescription(character.description);
      setPersonality(character.personality);
      setAvatarUrl(character.avatarUrl);
      setTags(character.tags.join(', '));
      setApiConfig(character.apiConfig || defaultApiConfig);
      setPhysicalAppearance(character.physicalAppearance || '');
      setPersonalityTraits(character.personalityTraits || '');
      setLore(character.lore || []);
      setMemory(character.memory || 'No memories yet.');
      setVoiceURI(character.voiceURI || '');
    } else {
        setName('');
        setDescription('');
        setPersonality('');
        setAvatarUrl('');
        setTags('');
        setApiConfig(defaultApiConfig);
        setPhysicalAppearance('');
        setPersonalityTraits('');
        setLore([]);
        setMemory('No memories yet.');
        setVoiceURI('');
    }
  }, [character]);

  const handleApiConfigChange = <K extends keyof ApiConfig>(key: K, value: ApiConfig[K]) => {
      setApiConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const newCharacter: Character = {
      id: character?.id || crypto.randomUUID(),
      name,
      description,
      personality,
      avatarUrl,
      tags: tags.split(',').map(tag => tag.trim()).filter(Boolean),
      createdAt: character?.createdAt || new Date().toISOString(),
      physicalAppearance,
      personalityTraits,
      lore,
      memory: character?.memory || '',
      voiceURI,
      apiConfig: {
        ...apiConfig,
        apiKey: apiConfig.apiKey?.trim(),
        apiEndpoint: apiConfig.apiEndpoint?.trim(),
        model: apiConfig.model?.trim(),
      },
    };
    onSave(newCharacter);
  };
  
  const handleGenerateAvatar = () => {
    const seed = name || crypto.randomUUID();
    setAvatarUrl(`https://picsum.photos/seed/${seed}/200/200`);
  };

  return (
    <div className="flex-1 flex flex-col p-8 bg-nexus-gray-light-200 dark:bg-nexus-gray-900 overflow-y-auto">
      <h2 className="text-3xl font-bold text-nexus-gray-900 dark:text-white mb-6">
        {character ? 'Edit Character' : 'Create New Character'}
      </h2>
      <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">

        <Section title="Core Identity">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300">Name</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="mt-1 block w-full bg-nexus-gray-light-100 dark:bg-nexus-gray-800 border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-md shadow-sm py-2 px-3 text-nexus-gray-900 dark:text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
              />
            </div>
             <div>
              <label htmlFor="avatarUrl" className="block text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300">Avatar URL</label>
              <div className="mt-1 flex rounded-md shadow-sm">
                <input
                  id="avatarUrl"
                  type="text"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  className="flex-1 block w-full min-w-0 bg-nexus-gray-light-100 dark:bg-nexus-gray-800 border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-none rounded-l-md py-2 px-3 text-nexus-gray-900 dark:text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
                  placeholder="https://example.com/avatar.png"
                />
                 <button type="button" onClick={handleGenerateAvatar} className="relative -ml-px inline-flex items-center space-x-2 px-4 py-2 border border-nexus-gray-light-400 dark:border-nexus-gray-700 text-sm font-medium rounded-r-md text-nexus-gray-800 dark:text-nexus-gray-300 bg-nexus-gray-light-300 dark:bg-nexus-gray-700 hover:bg-nexus-gray-light-400 dark:hover:bg-nexus-gray-600 focus:outline-none focus:ring-1 focus:ring-nexus-blue-500 focus:border-nexus-blue-500">
                    <span>Generate</span>
                 </button>
              </div>
            </div>
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300">Description</label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
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
                value={tags}
                onChange={(e) => setTags(e.target.value)}
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
                value={physicalAppearance}
                onChange={(e) => setPhysicalAppearance(e.target.value)}
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
                value={personalityTraits}
                onChange={(e) => setPersonalityTraits(e.target.value)}
                className="mt-1 block w-full bg-nexus-gray-light-100 dark:bg-nexus-gray-800 border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-md shadow-sm py-2 px-3 text-nexus-gray-900 dark:text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
                placeholder="Comma-separated traits, e.g., witty, sarcastic, kind, curious"
              />
            </div>
            {voices.length > 0 && (
              <div>
                <label htmlFor="voice" className="block text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300">Voice</label>
                <select
                  id="voice"
                  value={voiceURI}
                  onChange={(e) => setVoiceURI(e.target.value)}
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
                value={personality}
                onChange={(e) => setPersonality(e.target.value)}
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
                    value={lore.join('\n')}
                    onChange={(e) => setLore(e.target.value.split('\n'))}
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
                    value={memory}
                    readOnly
                    rows={6}
                    className="mt-1 block w-full bg-nexus-gray-light-300 dark:bg-nexus-dark border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-md shadow-sm py-2 px-3 text-nexus-gray-800 dark:text-nexus-gray-300 focus:outline-none cursor-not-allowed"
                />
            </div>
        </Section>
        
        <Section title="API Configuration">
            <div className="space-y-4">
                <div>
                    <label htmlFor="api-service" className="block text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300">API Service</label>
                    <select 
                        id="api-service"
                        value={apiConfig.service}
                        onChange={(e) => handleApiConfigChange('service', e.target.value as ApiConfig['service'])}
                        className="mt-1 block w-full bg-nexus-gray-light-100 dark:bg-nexus-gray-800 border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-md shadow-sm py-2 px-3 text-nexus-gray-900 dark:text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
                    >
                        <option value="default">Default (Gemini)</option>
                        <option value="gemini">Google Gemini (Custom Key)</option>
                        <option value="openai">OpenAI-Compatible (e.g., Ollama)</option>
                    </select>
                </div>
                {apiConfig.service === 'gemini' && (
                     <div>
                        <label htmlFor="api-key" className="block text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300">Gemini API Key</label>
                        <input
                            id="api-key"
                            type="password"
                            value={apiConfig.apiKey}
                            onChange={(e) => handleApiConfigChange('apiKey', e.target.value)}
                            className="mt-1 block w-full bg-nexus-gray-light-100 dark:bg-nexus-gray-800 border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-md shadow-sm py-2 px-3 text-nexus-gray-900 dark:text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
                            placeholder="Enter your Gemini API key"
                        />
                    </div>
                )}
                 {apiConfig.service === 'openai' && (
                    <>
                        <div>
                            <label htmlFor="api-endpoint" className="block text-sm font-medium text-nexus-gray-800 dark:text-nexus-gray-300">API Endpoint</label>
                            <input
                                id="api-endpoint"
                                type="text"
                                value={apiConfig.apiEndpoint}
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
                                value={apiConfig.apiKey}
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
                                value={apiConfig.model}
                                onChange={(e) => handleApiConfigChange('model', e.target.value)}
                                className="mt-1 block w-full bg-nexus-gray-light-100 dark:bg-nexus-gray-800 border border-nexus-gray-light-400 dark:border-nexus-gray-700 rounded-md py-2 px-3 text-nexus-gray-900 dark:text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
                                placeholder="e.g., llama3"
                            />
                        </div>
                    </>
                )}
            </div>
        </Section>
       
        <div className="flex justify-end space-x-4 pt-4">
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
  );
};