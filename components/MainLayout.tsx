import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Character, ChatSession, AppData, Plugin, GeminiApiRequest } from '../types';
import { loadData, saveData } from '../services/secureStorage';
import { CharacterList } from './CharacterList';
import { ChatList } from './ChatList';
import { CharacterForm } from './CharacterForm';
import { ChatInterface } from './ChatInterface';
import { PluginManager } from './PluginManager';
import { LogViewer } from './LogViewer';
import { HelpModal } from './HelpModal';
import { ChatSelectionModal } from './ChatSelectionModal';
import { PluginSandbox } from '../services/pluginSandbox';
import * as geminiService from '../services/geminiService';
import { logger } from '../services/loggingService';
import { DownloadIcon } from './icons/DownloadIcon';
import { UploadIcon } from './icons/UploadIcon';
import { CodeIcon } from './icons/CodeIcon';
import { TerminalIcon } from './icons/TerminalIcon';
import { HelpIcon } from './icons/HelpIcon';
import { PlusIcon } from './icons/PlusIcon';

const defaultImagePlugin: Plugin = {
    id: 'default-image-generator',
    name: 'Image Generation',
    description: 'Generates images from prompts. Single-click the image icon for a prompt, double-click to summarize chat context.',
    enabled: true,
    code: `
// Default Image Generation Plugin
nexus.hooks.register('generateImage', async (payload) => {
  try {
    let prompt;
    if (payload.type === 'summary') {
      nexus.log('Summarizing content for image prompt...');
      const summaryPrompt = \`Based on the following conversation, create a short, visually descriptive prompt for an image generation model. The prompt should capture the essence of the last few messages. Be creative and concise. Conversation:\\n\\n\${payload.value}\`;
      prompt = await nexus.gemini.generateContent(summaryPrompt);
      nexus.log('Generated prompt from summary:', prompt);
    } else {
      prompt = payload.value;
      nexus.log('Using direct prompt:', prompt);
    }
    
    // The main app passes the plugin settings as part of the request.
    const settings = payload.settings || {};
    
    const imageUrl = await nexus.gemini.generateImage(prompt, settings);
    return { url: imageUrl };

  } catch (error) {
    nexus.log('Error in image generation plugin:', error.message);
    // Return an error structure that the UI can handle
    return { error: error.message };
  }
});
nexus.log('Image Generation plugin loaded.');
`,
    settings: {
        service: 'default',
        style: 'Default (None)',
        negativePrompt: '',
    }
};

type View = 'chat' | 'form' | 'plugins';

export const MainLayout: React.FC = () => {
    const [appData, setAppData] = useState<AppData>({ characters: [], chatSessions: [], plugins: [] });
    
    const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
    const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
    const [view, setView] = useState<View>('chat');

    const [isLogViewerVisible, setIsLogViewerVisible] = useState(false);
    const [isHelpVisible, setIsHelpVisible] = useState(false);
    const [isChatModalVisible, setIsChatModalVisible] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const sandboxes = useRef(new Map<string, PluginSandbox>()).current;

    const persistData = useCallback(async (data: AppData) => {
        await saveData(data);
    }, []);

    // Secure handler for API requests coming from plugin sandboxes
    const handlePluginApiRequest = useCallback(async (request: GeminiApiRequest) => {
        switch (request.type) {
            case 'generateContent':
                return await geminiService.generateContent(request.prompt);
            case 'generateImage':
                return await geminiService.generateImageFromPrompt(request.prompt, request.settings);
            default:
                throw new Error('Unknown API request type from plugin.');
        }
    }, []);

    useEffect(() => {
        const loadInitialData = async () => {
            logger.log("Loading initial application data...");
            const data = await loadData();
            
            let hasDefaultPlugin = data.plugins && data.plugins.some(p => p.id === defaultImagePlugin.id);
            if (!hasDefaultPlugin) {
                if (!data.plugins) data.plugins = [];
                data.plugins.push(defaultImagePlugin);
                logger.log("Default image generation plugin injected.");
            } else {
                data.plugins = data.plugins.map(p => {
                    if (p.id === defaultImagePlugin.id && !p.settings) {
                        return { ...p, settings: defaultImagePlugin.settings };
                    }
                    return p;
                });
            }

            setAppData(data);
            if (data.chatSessions.length > 0) {
                setSelectedChatId(data.chatSessions[0].id);
            }
            logger.log("Application data loaded successfully.", { characters: data.characters.length, sessions: data.chatSessions.length, plugins: data.plugins.length });
        };
        loadInitialData();

        return () => {
            sandboxes.forEach(sandbox => sandbox.terminate());
            sandboxes.clear();
        };
    }, []);

    useEffect(() => {
        appData.plugins?.forEach(async (plugin) => {
            const existingSandbox = sandboxes.get(plugin.id);
            if (plugin.enabled && !existingSandbox) {
                try {
                    logger.log(`Initializing sandbox for plugin: ${plugin.name}`);
                    const sandbox = new PluginSandbox(handlePluginApiRequest);
                    await sandbox.loadCode(plugin.code);
                    sandboxes.set(plugin.id, sandbox);
                } catch (error) {
                    logger.error(`Failed to load plugin "${plugin.name}":`, error);
                    alert(`Error loading plugin "${plugin.name}". Check logs for details.`);
                }
            } else if (!plugin.enabled && existingSandbox) {
                logger.log(`Terminating sandbox for disabled plugin: ${plugin.name}`);
                existingSandbox.terminate();
                sandboxes.delete(plugin.id);
            }
        });
        sandboxes.forEach((_, id) => {
            if (!appData.plugins?.some(p => p.id === id)) {
                logger.log(`Pruning sandbox for deleted plugin ID: ${id}`);
                sandboxes.get(id)?.terminate();
                sandboxes.delete(id);
            }
        });

    }, [appData.plugins, sandboxes, handlePluginApiRequest]);

    const handleSaveCharacter = (character: Character) => {
        const isNew = !appData.characters.some(c => c.id === character.id);
        const updatedCharacters = isNew ? [...appData.characters, character] : appData.characters.map(c => c.id === character.id ? character : c);
        
        const updatedData = { ...appData, characters: updatedCharacters };
        setAppData(updatedData);
        persistData(updatedData);
        logger.log(`Character ${isNew ? 'created' : 'updated'}: ${character.name}`);
        
        setView('chat');
        setEditingCharacter(null);
    };
    
    const handleCharacterUpdate = (character: Character) => {
        const updatedCharacters = appData.characters.map(c => c.id === character.id ? character : c);
        const updatedData = { ...appData, characters: updatedCharacters };
        setAppData(updatedData);
        persistData(updatedData);
        logger.log(`Character data updated programmatically: ${character.name}`);
    };

    const handleDeleteCharacter = (characterId: string) => {
        if (window.confirm('Are you sure you want to delete this character? All chats involving this character will also be deleted.')) {
            const characterName = appData.characters.find(c => c.id === characterId)?.name || 'Unknown';
            const updatedCharacters = appData.characters.filter(c => c.id !== characterId);
            const updatedSessions = appData.chatSessions.filter(s => !s.characterIds.includes(characterId));
            
            const updatedData = { ...appData, characters: updatedCharacters, chatSessions: updatedSessions };
            setAppData(updatedData);
            persistData(updatedData);
            logger.log(`Deleted character and associated sessions: ${characterName}`);

            if (selectedChatId && !updatedSessions.some(s => s.id === selectedChatId)) {
                setSelectedChatId(updatedSessions.length > 0 ? updatedSessions[0].id : null);
            }
        }
    };

    const handleCreateChat = (name: string, characterIds: string[]) => {
        const newSession: ChatSession = {
            id: crypto.randomUUID(),
            name,
            characterIds,
            messages: []
        };
        const updatedSessions = [...appData.chatSessions, newSession];
        const updatedData = { ...appData, chatSessions: updatedSessions };
        setAppData(updatedData);
        persistData(updatedData);
        setSelectedChatId(newSession.id);
        setIsChatModalVisible(false);
        logger.log(`New chat created: "${name}"`);
    };

    const handleDeleteChat = (sessionId: string) => {
        if (window.confirm('Are you sure you want to delete this chat session?')) {
            const updatedSessions = appData.chatSessions.filter(s => s.id !== sessionId);
            const updatedData = { ...appData, chatSessions: updatedSessions };
            setAppData(updatedData);
            persistData(updatedData);
            if (selectedChatId === sessionId) {
                setSelectedChatId(updatedSessions.length > 0 ? updatedSessions[0].id : null);
            }
            logger.log(`Chat session deleted: ${sessionId}`);
        }
    };
    
    const handleEditCharacter = (character: Character) => {
        setEditingCharacter(character);
        setView('form');
    };
    
    const handleAddNewCharacter = () => {
        setEditingCharacter(null);
        setView('form');
    };

    const handleSelectChat = (sessionId: string) => {
        setSelectedChatId(sessionId);
        setView('chat');
        setEditingCharacter(null);
    };

    const handleSessionUpdate = (session: ChatSession) => {
        const updatedSessions = [...appData.chatSessions];
        const sessionIndex = updatedSessions.findIndex(s => s.id === session.id);
        if (sessionIndex > -1) {
            updatedSessions[sessionIndex] = session;
        } else {
            updatedSessions.push(session);
        }
        const updatedData = { ...appData, chatSessions: updatedSessions };
        setAppData(updatedData);
        persistData(updatedData);
    };

    const handleExportData = async () => {
        try {
            const data = await loadData();
            const jsonString = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const timestamp = new Date().toISOString().split('T')[0];
            a.download = `ai-nexus-backup-${timestamp}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            logger.log("Data exported successfully.", { filename: a.download });
        } catch (error) {
            logger.error("Failed to export data.", error);
            alert("Failed to export data. Check logs for details.");
        }
    };
    
    const handleImportData = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        logger.log(`Starting data import from file: ${file.name}`);
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const text = e.target?.result;
                if (typeof text !== 'string') throw new Error('Invalid file content');
                
                const data = JSON.parse(text);

                if (typeof data !== 'object' || data === null || Array.isArray(data)) {
                    throw new Error("Invalid backup file format. Expected a JSON object.");
                }
                
                const importedPlugins = Array.isArray(data.plugins) ? data.plugins : [];
                const hasDefaultPlugin = importedPlugins.some(p => p.id === defaultImagePlugin.id);
                if (!hasDefaultPlugin) {
                    importedPlugins.push(defaultImagePlugin);
                }

                const importedData: AppData = {
                    characters: Array.isArray(data.characters) ? data.characters : [],
                    chatSessions: Array.isArray(data.chatSessions) ? data.chatSessions : [],
                    plugins: importedPlugins,
                };

                if (window.confirm('This will overwrite all current data. Are you sure you want to proceed?')) {
                    await persistData(importedData);
                    logger.log("Data imported successfully! Reloading application...");
                    alert('Data imported successfully! The application will now reload to apply the changes.');
                    window.location.reload();
                } else {
                    logger.log("Data import cancelled by user.");
                }
            } catch (error) {
                logger.error("Import failed:", error);
                alert(`Failed to import data. Please check the file format and logs. Error: ${error instanceof Error ? error.message : String(error)}`);
            } finally {
                if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                }
            }
        };
        reader.readAsText(file);
    };

    const handlePluginsUpdate = (updatedPlugins: Plugin[]) => {
        const updatedData = { ...appData, plugins: updatedPlugins };
        setAppData(updatedData);
        persistData(updatedData);
    };
    
    const triggerPluginHook = useCallback(async <T, R>(hookName: string, data: T): Promise<R> => {
        let processedData: any = data;
        const enabledPlugins = appData.plugins?.filter(p => p.enabled) || [];

        if (hookName === 'generateImage') {
            const imagePlugin = appData.plugins?.find(p => p.id === 'default-image-generator');
            processedData = { ...processedData, settings: imagePlugin?.settings || {} };
        }

        for (const plugin of enabledPlugins) {
            const sandbox = sandboxes.get(plugin.id);
            if (sandbox) {
                try {
                    processedData = await sandbox.executeHook(hookName, processedData);
                } catch (error) {
                    logger.error(`Error in plugin '${plugin.name}' during hook '${hookName}':`, error);
                }
            }
        }
        return processedData as R;
    }, [appData.plugins, sandboxes]);

    const renderMainContent = () => {
        const selectedChat = appData.chatSessions.find(s => s.id === selectedChatId);

        switch (view) {
            case 'form':
                return <CharacterForm 
                    character={editingCharacter} 
                    onSave={handleSaveCharacter} 
                    onCancel={() => setView('chat')}
                />;
            case 'plugins':
                return <PluginManager
                    plugins={appData.plugins || []}
                    onPluginsUpdate={handlePluginsUpdate}
                />;
            case 'chat':
            default:
                return selectedChat ? (
                    <ChatInterface
                        key={selectedChat.id}
                        session={selectedChat}
                        allCharacters={appData.characters}
                        onSessionUpdate={handleSessionUpdate}
                        onTriggerHook={triggerPluginHook}
                        onCharacterUpdate={handleCharacterUpdate}
                    />
                ) : (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-center text-nexus-gray-500">
                            <h2 className="text-2xl">Welcome to AI Nexus</h2>
                            <p>Create a character and start a new chat to begin.</p>
                        </div>
                    </div>
                );
        }
    }

    return (
        <div className="flex h-screen bg-nexus-dark text-nexus-gray-200 font-sans">
            {isLogViewerVisible && <LogViewer onClose={() => setIsLogViewerVisible(false)} />}
            {isHelpVisible && <HelpModal onClose={() => setIsHelpVisible(false)} />}
            {isChatModalVisible && <ChatSelectionModal characters={appData.characters} onClose={() => setIsChatModalVisible(false)} onCreateChat={handleCreateChat}/>}
            
            <aside className="w-80 bg-nexus-gray-800 flex flex-col p-4 border-r border-nexus-gray-700">
                <div className="flex items-center justify-between mb-4">
                    <h1 className="text-2xl font-bold text-white">AI Nexus</h1>
                </div>

                <div className="flex justify-between items-center mb-2">
                    <h2 className="text-lg font-semibold text-white">Chats</h2>
                    <button onClick={() => setIsChatModalVisible(true)} className="p-2 rounded-md text-nexus-gray-400 hover:bg-nexus-gray-700 hover:text-white transition-colors" title="New Chat">
                        <PlusIcon className="w-5 h-5" />
                    </button>
                </div>
                <ChatList 
                    chatSessions={appData.chatSessions}
                    characters={appData.characters}
                    selectedChatId={selectedChatId}
                    onSelectChat={handleSelectChat}
                    onDeleteChat={handleDeleteChat}
                />
                
                <div className="mt-4 flex-shrink-0">
                    <CharacterList 
                        characters={appData.characters}
                        onDeleteCharacter={handleDeleteCharacter}
                        onEditCharacter={handleEditCharacter}
                        onAddNew={handleAddNewCharacter}
                    />
                </div>

                <div className="mt-auto pt-4 border-t border-nexus-gray-700 grid grid-cols-2 gap-2">
                    <button onClick={handleExportData} title="Export All Data" className="flex items-center justify-center space-x-2 px-3 py-2 text-sm font-medium text-center rounded-md bg-nexus-gray-700 hover:bg-nexus-gray-600 transition-colors">
                        <DownloadIcon className="w-4 h-4" />
                        <span>Export</span>
                    </button>
                    <input type="file" ref={fileInputRef} onChange={handleImportData} accept=".json" className="hidden" />
                    <button onClick={() => fileInputRef.current?.click()} title="Import Data from File" className="flex items-center justify-center space-x-2 px-3 py-2 text-sm font-medium text-center rounded-md bg-nexus-gray-700 hover:bg-nexus-gray-600 transition-colors">
                        <UploadIcon className="w-4 h-4" />
                        <span>Import</span>
                    </button>
                    <button onClick={() => setView('plugins')} title="Manage Plugins" className="flex items-center justify-center space-x-2 px-3 py-2 text-sm font-medium text-center rounded-md bg-nexus-gray-700 hover:bg-nexus-gray-600 transition-colors">
                        <CodeIcon className="w-4 h-4" />
                        <span>Plugins</span>
                    </button>
                     <button onClick={() => setIsLogViewerVisible(true)} title="View Application Logs" className="flex items-center justify-center space-x-2 px-3 py-2 text-sm font-medium text-center rounded-md bg-nexus-gray-700 hover:bg-nexus-gray-600 transition-colors">
                        <TerminalIcon className="w-4 h-4" />
                        <span>Logs</span>
                    </button>
                    <button onClick={() => setIsHelpVisible(true)} title="Open Help Center" className="col-span-2 flex items-center justify-center space-x-2 px-3 py-2 text-sm font-medium text-center rounded-md bg-nexus-gray-700 hover:bg-nexus-gray-600 transition-colors">
                        <HelpIcon className="w-4 h-4" />
                        <span>Help</span>
                    </button>
                </div>
            </aside>
            <main className="flex-1 flex flex-col">
                {renderMainContent()}
            </main>
        </div>
    );
};
