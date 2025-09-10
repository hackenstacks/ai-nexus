import React, { useState, useMemo } from 'react';
import { UISettings, ChatSession, Character } from '../types';
import { generateContent } from '../services/geminiService';
import { logger } from '../services/loggingService';
import { SpinnerIcon } from './icons/SpinnerIcon';
import { UploadIcon } from './icons/UploadIcon';
import { SparklesIcon } from './icons/SparklesIcon';
import { TrashIcon } from './icons/TrashIcon';

interface AppearanceModalProps {
  settings: UISettings;
  currentChat: ChatSession | undefined;
  allCharacters: Character[];
  onUpdate: (settings: UISettings) => void;
  onGenerateImage: (prompt: string) => Promise<string | null>;
  onClose: () => void;
}

const ImageControl: React.FC<{
  label: string;
  imageUrl?: string;
  onUpload: (file: File) => void;
  onGenerate: (type: 'prompt' | 'auto' | 'character') => void;
  onClear: () => void;
  isGenerating: boolean;
  canAutoGenerate: boolean;
  canCharacterGenerate: boolean;
}> = ({ label, imageUrl, onUpload, onGenerate, onClear, isGenerating, canAutoGenerate, canCharacterGenerate }) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { // 4MB limit
      alert("File is too large. Please select an image under 4MB.");
      return;
    }
    onUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-medium text-nexus-gray-900 dark:text-white">{label}</h3>
      <div className="h-40 w-full rounded-md border-2 border-dashed border-nexus-gray-light-400 dark:border-nexus-gray-600 flex items-center justify-center bg-cover bg-center" style={{ backgroundImage: `url(${imageUrl || ''})`, backgroundColor: imageUrl ? '' : 'rgba(0,0,0,0.1)' }}>
        {!imageUrl && <span className="text-nexus-gray-600 dark:text-nexus-gray-400">No Image Set</span>}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/png, image/jpeg, image/webp, image/gif" className="hidden" />
        <button onClick={() => fileInputRef.current?.click()} className="flex items-center justify-center space-x-2 px-3 py-2 text-sm font-medium text-center rounded-md bg-nexus-gray-light-300 dark:bg-nexus-gray-700 hover:bg-nexus-gray-light-400 dark:hover:bg-nexus-gray-600 transition-colors">
            <UploadIcon className="w-4 h-4" /> <span>Upload</span>
        </button>
        <button onClick={() => onGenerate('prompt')} disabled={isGenerating} className="flex items-center justify-center space-x-2 px-3 py-2 text-sm font-medium text-center rounded-md bg-nexus-gray-light-300 dark:bg-nexus-gray-700 hover:bg-nexus-gray-light-400 dark:hover:bg-nexus-gray-600 transition-colors disabled:opacity-50">
            {isGenerating ? <SpinnerIcon className="w-4 h-4 animate-spin"/> : <SparklesIcon className="w-4 h-4" />} <span>From Prompt</span>
        </button>
        <button onClick={() => onGenerate('auto')} disabled={isGenerating || !canAutoGenerate} className="flex items-center justify-center space-x-2 px-3 py-2 text-sm font-medium text-center rounded-md bg-nexus-gray-light-300 dark:bg-nexus-gray-700 hover:bg-nexus-gray-light-400 dark:hover:bg-nexus-gray-600 transition-colors disabled:opacity-50" title={!canAutoGenerate ? "Not enough chat history available" : "Generate from chat context"}>
            {isGenerating ? <SpinnerIcon className="w-4 h-4 animate-spin"/> : <SparklesIcon className="w-4 h-4" />} <span>From Chat</span>
        </button>
        <button onClick={() => onGenerate('character')} disabled={isGenerating || !canCharacterGenerate} className="flex items-center justify-center space-x-2 px-3 py-2 text-sm font-medium text-center rounded-md bg-nexus-gray-light-300 dark:bg-nexus-gray-700 hover:bg-nexus-gray-light-400 dark:hover:bg-nexus-gray-600 transition-colors disabled:opacity-50" title={!canCharacterGenerate ? "No characters in this chat" : "Generate from character details"}>
            {isGenerating ? <SpinnerIcon className="w-4 h-4 animate-spin"/> : <SparklesIcon className="w-4 h-4" />} <span>From Character</span>
        </button>
        <button onClick={onClear} className="col-span-2 md:col-span-1 flex items-center justify-center space-x-2 px-3 py-2 text-sm font-medium text-center rounded-md bg-red-500/20 text-red-700 dark:text-red-400 hover:bg-red-500/30 transition-colors">
            <TrashIcon className="w-4 h-4" /> <span>Clear</span>
        </button>
      </div>
    </div>
  );
};

export const AppearanceModal: React.FC<AppearanceModalProps> = ({ settings, currentChat, allCharacters, onUpdate, onGenerateImage, onClose }) => {
  const [isGeneratingBg, setIsGeneratingBg] = useState(false);
  const [isGeneratingBanner, setIsGeneratingBanner] = useState(false);

  const participants = useMemo(() => {
    if (!currentChat) return [];
    return allCharacters.filter(c => currentChat.characterIds.includes(c.id));
  }, [allCharacters, currentChat]);
  
  const canAutoGenerate = !!currentChat && currentChat.messages.length >= 2;
  const canCharacterGenerate = participants.length > 0;

  const handleFileUpload = (file: File, type: 'background' | 'banner') => {
    const reader = new FileReader();
    reader.onload = () => {
      const newSettings = { ...settings };
      if (type === 'background') newSettings.backgroundImage = reader.result as string;
      if (type === 'banner') newSettings.bannerImage = reader.result as string;
      onUpdate(newSettings);
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = async (type: 'background' | 'banner', mode: 'prompt' | 'auto' | 'character') => {
    const setIsGenerating = type === 'background' ? setIsGeneratingBg : setIsGeneratingBanner;
    
    let promptText: string | null = null;
    setIsGenerating(true);

    try {
        if (mode === 'prompt') {
            promptText = window.prompt(`Enter a prompt for the ${type} image:`);
        } else if (mode === 'auto') {
            if (!canAutoGenerate) throw new Error("Not enough chat history to auto-generate an image.");
            const context = currentChat.messages.slice(-5).map(m => m.content).join('\n');
            const summaryPrompt = `Based on the following conversation, create a short, visually descriptive prompt for an atmospheric ${type} image. The prompt should capture the essence of the scene. Be creative and concise. Conversation:\n\n${context}`;
            promptText = await generateContent(summaryPrompt);
            logger.log(`Auto-generated image prompt from chat:`, promptText);
        } else if (mode === 'character') {
            if (!canCharacterGenerate) throw new Error("No characters in this chat to generate an image from.");
            const characterDetails = participants.map(p => {
                let details = `Name: ${p.name}\nDescription: ${p.description}\nPhysical Appearance: ${p.physicalAppearance}\nPersonality: ${p.personalityTraits}`;
                if (p.memory && p.memory !== 'No memories yet.') {
                    details += `\nRecent Memory: ${p.memory}`;
                }
                return details;
            }).join('\n\n---\n\n');

            const summaryPrompt = `Based on the following character details, create a short, visually descriptive prompt for an atmospheric ${type} image that represents them or their environment. Be creative and concise. Character Details:\n\n${characterDetails}`;
            promptText = await generateContent(summaryPrompt);
            logger.log(`Auto-generated image prompt from character details:`, promptText);
        }

        if (!promptText) {
          setIsGenerating(false);
          return;
        }

        const imageUrl = await onGenerateImage(promptText);
        if (imageUrl) {
          const newSettings = { ...settings };
          if (type === 'background') newSettings.backgroundImage = imageUrl;
          if (type === 'banner') newSettings.bannerImage = imageUrl;
          onUpdate(newSettings);
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : "An unknown error occurred.";
        logger.error("Failed to generate image prompt or image", err);
        alert(`Could not generate image: ${message}`);
    } finally {
        setIsGenerating(false);
    }
  };
  
  const handleClear = (type: 'background' | 'banner') => {
    const newSettings = { ...settings };
    if (type === 'background') newSettings.backgroundImage = undefined;
    if (type === 'banner') newSettings.bannerImage = undefined;
    onUpdate(newSettings);
  };

  const handleAvatarSizeChange = (size: 'small' | 'medium' | 'large') => {
    onUpdate({ ...settings, avatarSize: size });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-nexus-gray-light-100 dark:bg-nexus-gray-800 rounded-lg shadow-xl w-full max-w-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <header className="p-4 border-b border-nexus-gray-light-300 dark:border-nexus-gray-700 flex justify-between items-center flex-shrink-0">
          <h2 className="text-xl font-bold text-nexus-gray-900 dark:text-white">Appearance Settings</h2>
          <button onClick={onClose} className="text-nexus-gray-700 dark:text-nexus-gray-400 hover:text-nexus-gray-900 dark:hover:text-white transition-colors text-2xl font-bold leading-none p-1">&times;</button>
        </header>
        
        <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
          <ImageControl 
            label="Background Image"
            imageUrl={settings.backgroundImage}
            onUpload={(file) => handleFileUpload(file, 'background')}
            onGenerate={(mode) => handleGenerate('background', mode)}
            onClear={() => handleClear('background')}
            isGenerating={isGeneratingBg}
            canAutoGenerate={canAutoGenerate}
            canCharacterGenerate={canCharacterGenerate}
          />
          <ImageControl 
            label="Banner Image"
            imageUrl={settings.bannerImage}
            onUpload={(file) => handleFileUpload(file, 'banner')}
            onGenerate={(mode) => handleGenerate('banner', mode)}
            onClear={() => handleClear('banner')}
            isGenerating={isGeneratingBanner}
            canAutoGenerate={canAutoGenerate}
            canCharacterGenerate={canCharacterGenerate}
          />

          <div className="space-y-3 pt-6 border-t border-nexus-gray-light-300 dark:border-nexus-gray-700">
            <h3 className="text-lg font-medium text-nexus-gray-900 dark:text-white">Avatar Size</h3>
            <p className="text-sm text-nexus-gray-700 dark:text-nexus-gray-400">Controls the size of character avatars displayed next to messages in this chat.</p>
            <div className="flex items-center space-x-4">
                {(['small', 'medium', 'large'] as const).map(size => (
                    <label key={size} className="flex items-center space-x-2 cursor-pointer">
                        <input
                            type="radio"
                            name="avatar-size"
                            value={size}
                            checked={(settings.avatarSize || 'medium') === size}
                            onChange={() => handleAvatarSizeChange(size)}
                            className="h-4 w-4 text-nexus-blue-600 border-nexus-gray-500 dark:border-nexus-gray-600 bg-nexus-gray-light-100 dark:bg-nexus-gray-900 focus:ring-nexus-blue-500"
                        />
                        <span className="capitalize text-nexus-gray-800 dark:text-nexus-gray-300">{size}</span>
                    </label>
                ))}
            </div>
          </div>

        </div>

        <footer className="p-4 border-t border-nexus-gray-light-300 dark:border-nexus-gray-700 flex justify-end">
            <button onClick={onClose} className="py-2 px-4 rounded-md text-nexus-gray-900 dark:text-white bg-nexus-gray-light-400 dark:bg-nexus-gray-600 hover:bg-nexus-gray-light-500 dark:hover:bg-nexus-gray-500">Close</button>
        </footer>
      </div>
    </div>
  );
};