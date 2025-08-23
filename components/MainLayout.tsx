
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Character, ChatSession, AppData, Plugin, GeminiApiRequest } from '../types';
import { loadData, saveData } from '../services/secureStorage';
import { CharacterList } from './CharacterList';
import { CharacterForm } from './CharacterForm';
import { ChatInterface } from './ChatInterface';
import { PluginManager } from './PluginManager';
import { LogViewer } from './LogViewer';
import { PluginSandbox } from '../services/pluginSandbox';
import * as geminiService from '../services/geminiService';
import { logger } from '../services/loggingService';
import { DownloadIcon } from './icons/DownloadIcon';
import { UploadIcon } from './icons/UploadIcon';
import { CodeIcon } from './icons/CodeIcon';
import { TerminalIcon } from './icons/TerminalIcon';

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
    
    const imageUrl = await nexus.gemini.generateImage(prompt);
    return { url: imageUrl };

  } catch (error) {
    nexus.log('Error in image generation plugin:', error.message);
    // Return an error structure that the UI can handle
    return { error: error.message };
  }
});
nexus.log('Image Generation plugin loaded.');
`
};

type View = 'chat' | 'form' | 'plugins';

export const MainLayout: React.FC = () => {
    const [characters, setCharacters] = useState<Character[]>([]);
    const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
    const [plugins, setPlugins] = useState<Plugin[]>([]);
    
    const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
    const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
    const [view, setView] = useState<View>('chat');
    const [isLogViewerVisible, setIsLogViewerVisible] = useState(false);

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
                return await geminiService.generateImageFromPrompt(request.prompt);
            default:
                throw new Error('Unknown API request type from plugin.');
        }
    }, []);

    useEffect(() => {
        const loadInitialData = async () => {
            logger.log("Loading initial application data...");
            const data = await loadData();
            
            // Inject default plugin if it doesn't exist
            const hasDefaultPlugin = data.plugins.some(p => p.id === defaultImagePlugin.id);
            if (!hasDefaultPlugin) {
                data.plugins.push(defaultImagePlugin);
                logger.log("Default image generation plugin injected.");
            }

            setCharacters(data.characters);
            setChatSessions(data.chatSessions);
            setPlugins(data.plugins);
            logger.log("Application data loaded successfully.", { characters: data.characters.length, sessions: data.chatSessions.length, plugins: data.plugins.length });
        };
        loadInitialData();

        return () => {
            sandboxes.forEach(sandbox => sandbox.terminate());
            sandboxes.clear();
        };
    }, []);

    useEffect(() => {
        plugins.forEach(async (plugin) => {
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
        // Prune sandboxes for deleted plugins
        sandboxes.forEach((_, id) => {
            if (!plugins.some(p => p.id === id)) {
                logger.log(`Pruning sandbox for deleted plugin ID: ${id}`);
                sandboxes.get(id)?.terminate();
                sandboxes.delete(id);
            }
        });

    }, [plugins, sandboxes, handlePluginApiRequest]);

    const handleSaveCharacter = (character: Character) => {
        const isNew = !characters.some(c => c.id === character.id);
        const updatedCharacters = isNew ? [...characters, character] : characters.map(c => c.id === character.id ? character : c);

        setCharacters(updatedCharacters);
        persistData({ characters: updatedCharacters, chatSessions, plugins });
        logger.log(`Character ${isNew ? 'created' : 'updated'}: ${character.name}`);
        setView('chat');
        setEditingCharacter(null);
    };

    const handleDeleteCharacter = (characterId: string) => {
        if (window.confirm('Are you sure you want to delete this character and all related conversations?')) {
            const characterName = characters.find(c => c.id === characterId)?.name || 'Unknown';
            const updatedCharacters = characters.filter(c => c.id !== characterId);
            const updatedSessions = chatSessions.filter(s => s.characterId !== characterId);
            setCharacters(updatedCharacters);
            setChatSessions(updatedSessions);
            persistData({ characters: updatedCharacters, chatSessions: updatedSessions, plugins });
            logger.log(`Deleted character and associated sessions: ${characterName}`);
            if (selectedCharacter?.id === characterId) {
                setSelectedCharacter(null);
            }
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

    const handleSelectCharacter = (character: Character) => {
        setSelectedCharacter(character);
        setView('chat');
        setEditingCharacter(null);
    };

    const handleSessionUpdate = (session: ChatSession) => {
        const updatedSessions = [...chatSessions];
        const sessionIndex = updatedSessions.findIndex(s => s.id === session.id);
        if (sessionIndex > -1) {
            updatedSessions[sessionIndex] = session;
        } else {
            updatedSessions.push(session);
        }
        setChatSessions(updatedSessions);
        persistData({ characters, chatSessions: updatedSessions, plugins });
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
        setPlugins(updatedPlugins);
        persistData({ characters, chatSessions, plugins: updatedPlugins });
    };
    
    const triggerPluginHook = useCallback(async <T, R>(hookName: string, data: T): Promise<R> => {
        let processedData: any = data;
        const enabledPlugins = plugins.filter(p => p.enabled);

        for (const plugin of enabledPlugins) {
            const sandbox = sandboxes.get(plugin.id);
            if (sandbox) {
                try {
                    // The result from one plugin is passed as data to the next.
                    processedData = await sandbox.executeHook(hookName, processedData);
                } catch (error) {
                    logger.error(`Error in plugin '${plugin.name}' during hook '${hookName}':`, error);
                }
            }
        }
        return processedData as R;
    }, [plugins, sandboxes]);

    const renderMainContent = () => {
        switch (view) {
            case 'form':
                return <CharacterForm 
                    character={editingCharacter} 
                    onSave={handleSaveCharacter} 
                    onCancel={() => setView('chat')}
                />;
            case 'plugins':
                return <PluginManager
                    plugins={plugins}
                    onPluginsUpdate={handlePluginsUpdate}
                />;
            case 'chat':
            default:
                return selectedCharacter ? (
                    <ChatInterface
                        key={selectedCharacter.id}
                        character={selectedCharacter}
                        chatSession={chatSessions.find(s => s.characterId === selectedCharacter.id)}
                        onSessionUpdate={handleSessionUpdate}
                        onTriggerHook={triggerPluginHook}
                    />
                ) : (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-center text-nexus-gray-500">
                            <h2 className="text-2xl">Welcome to AI Nexus</h2>
                            <p>Select a character to start chatting, or create a new one.</p>
                        </div>
                    </div>
                );
        }
    }

    return (
        <div className="flex h-screen bg-nexus-dark text-nexus-gray-200 font-sans">
            {isLogViewerVisible && <LogViewer onClose={() => setIsLogViewerVisible(false)} />}
            <aside className="w-80 bg-nexus-gray-800 flex flex-col p-4 border-r border-nexus-gray-700">
                <div className="flex items-center mb-6">
                    <h1 className="text-2xl font-bold text-white">AI Nexus</h1>
                </div>
                <CharacterList 
                    characters={characters}
                    onSelectCharacter={handleSelectCharacter}
                    onDeleteCharacter={handleDeleteCharacter}
                    onEditCharacter={handleEditCharacter}
                    onAddNew={handleAddNewCharacter}
                    selectedCharacterId={selectedCharacter?.id}
                />
                <div className="mt-auto pt-4 border-t border-nexus-gray-700 grid grid-cols-2 gap-2">
                    <button onClick={handleExportData} title="Export Data" className="flex items-center justify-center space-x-2 px-3 py-2 text-sm font-medium text-center rounded-md bg-nexus-gray-700 hover:bg-nexus-gray-600 transition-colors">
                        <DownloadIcon className="w-4 h-4" />
                        <span>Export</span>
                    </button>
                    <input type="file" ref={fileInputRef} onChange={handleImportData} accept=".json" className="hidden" />
                    <button onClick={() => fileInputRef.current?.click()} title="Import Data" className="flex items-center justify-center space-x-2 px-3 py-2 text-sm font-medium text-center rounded-md bg-nexus-gray-700 hover:bg-nexus-gray-600 transition-colors">
                        <UploadIcon className="w-4 h-4" />
                        <span>Import</span>
                    </button>
                    <button onClick={() => setView('plugins')} title="Manage Plugins" className="flex items-center justify-center space-x-2 px-3 py-2 text-sm font-medium text-center rounded-md bg-nexus-gray-700 hover:bg-nexus-gray-600 transition-colors">
                        <CodeIcon className="w-4 h-4" />
                        <span>Plugins</span>
                    </button>
                     <button onClick={() => setIsLogViewerVisible(true)} title="View Logs" className="flex items-center justify-center space-x-2 px-3 py-2 text-sm font-medium text-center rounded-md bg-nexus-gray-700 hover:bg-nexus-gray-600 transition-colors">
                        <TerminalIcon className="w-4 h-4" />
                        <span>Logs</span>
                    </button>
                </div>
            </aside>
            <main className="flex-1 flex flex-col">
                {renderMainContent()}
            </main>
        </div>
    );
};
