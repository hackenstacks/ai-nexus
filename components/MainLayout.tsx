import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Character, ChatSession, AppData, Plugin } from '../types';
import { loadData, saveData } from '../services/secureStorage';
import { CharacterList } from './CharacterList';
import { CharacterForm } from './CharacterForm';
import { ChatInterface } from './ChatInterface';
import { PluginManager } from './PluginManager';
import { PluginSandbox } from '../services/pluginSandbox';
import { DownloadIcon } from './icons/DownloadIcon';
import { UploadIcon } from './icons/UploadIcon';
import { CodeIcon } from './icons/CodeIcon';

type View = 'chat' | 'form' | 'plugins';

export const MainLayout: React.FC = () => {
    const [characters, setCharacters] = useState<Character[]>([]);
    const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
    const [plugins, setPlugins] = useState<Plugin[]>([]);
    
    const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
    const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
    const [view, setView] = useState<View>('chat');

    const fileInputRef = useRef<HTMLInputElement>(null);
    const sandboxes = useRef(new Map<string, PluginSandbox>()).current;

    const persistData = useCallback(async (data: AppData) => {
        await saveData(data);
    }, []);

    useEffect(() => {
        const loadInitialData = async () => {
            const data = await loadData();
            setCharacters(data.characters);
            setChatSessions(data.chatSessions);
            setPlugins(data.plugins);
        };
        loadInitialData();

        // Cleanup sandboxes on component unmount
        return () => {
            sandboxes.forEach(sandbox => sandbox.terminate());
            sandboxes.clear();
        };
    }, []);

    // Effect to manage sandboxes based on plugin state
    useEffect(() => {
        plugins.forEach(async (plugin) => {
            if (plugin.enabled && !sandboxes.has(plugin.id)) {
                try {
                    console.log(`Initializing sandbox for plugin: ${plugin.name}`);
                    const sandbox = new PluginSandbox();
                    await sandbox.loadCode(plugin.code);
                    sandboxes.set(plugin.id, sandbox);
                } catch (error) {
                    console.error(`Failed to load plugin "${plugin.name}":`, error);
                    alert(`Error loading plugin "${plugin.name}". Check console for details.`);
                }
            } else if (!plugin.enabled && sandboxes.has(plugin.id)) {
                console.log(`Terminating sandbox for disabled plugin: ${plugin.name}`);
                sandboxes.get(plugin.id)?.terminate();
                sandboxes.delete(plugin.id);
            }
        });
    }, [plugins, sandboxes]);

    const handleSaveCharacter = (character: Character) => {
        const updatedCharacters = [...characters];
        const existingIndex = updatedCharacters.findIndex(c => c.id === character.id);
        if (existingIndex > -1) {
            updatedCharacters[existingIndex] = character;
        } else {
            updatedCharacters.push(character);
        }
        setCharacters(updatedCharacters);
        persistData({ characters: updatedCharacters, chatSessions, plugins });
        setView('chat');
        setEditingCharacter(null);
    };

    const handleDeleteCharacter = (characterId: string) => {
        if (window.confirm('Are you sure you want to delete this character and all related conversations?')) {
            const updatedCharacters = characters.filter(c => c.id !== characterId);
            const updatedSessions = chatSessions.filter(s => s.characterId !== characterId);
            setCharacters(updatedCharacters);
            setChatSessions(updatedSessions);
            persistData({ characters: updatedCharacters, chatSessions: updatedSessions, plugins });
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
        const data = await loadData();
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ai-nexus-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };
    
    const handleImportData = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const text = e.target?.result;
                if (typeof text !== 'string') throw new Error('Invalid file content');
                
                const data = JSON.parse(text) as AppData;

                if (typeof data !== 'object' || data === null || Array.isArray(data)) {
                    throw new Error("Invalid backup file format. Expected a JSON object.");
                }
                
                const importedData: AppData = {
                    characters: Array.isArray(data.characters) ? data.characters : [],
                    chatSessions: Array.isArray(data.chatSessions) ? data.chatSessions : [],
                    plugins: Array.isArray(data.plugins) ? data.plugins : [],
                };

                if (window.confirm('This will overwrite all current data. Are you sure you want to proceed?')) {
                    setCharacters(importedData.characters);
                    setChatSessions(importedData.chatSessions);
                    setPlugins(importedData.plugins);
                    await persistData(importedData);
                    setSelectedCharacter(null);
                    setView('chat');
                    alert('Data imported successfully!');
                }
            } catch (error) {
                console.error("Import failed:", error);
                alert(`Failed to import data. Please check the file format. Error: ${error instanceof Error ? error.message : String(error)}`);
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
    
    const triggerPluginHook = useCallback(async <T,>(hookName: string, data: T): Promise<T> => {
        let processedData = data;
        const enabledPlugins = plugins.filter(p => p.enabled);

        for (const plugin of enabledPlugins) {
            const sandbox = sandboxes.get(plugin.id);
            if (sandbox) {
                try {
                    processedData = await sandbox.executeHook(hookName, processedData);
                } catch (error) {
                    console.error(`Error in plugin '${plugin.name}' during hook '${hookName}':`, error);
                    // Continue with the last successfully processed data
                }
            }
        }
        return processedData;
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
                <div className="mt-auto pt-4 border-t border-nexus-gray-700 flex space-x-2">
                    <button onClick={handleExportData} title="Export Data" className="flex-1 flex items-center justify-center space-x-2 px-3 py-2 text-sm font-medium text-center rounded-md bg-nexus-gray-700 hover:bg-nexus-gray-600 transition-colors">
                        <DownloadIcon className="w-4 h-4" />
                        <span>Export</span>
                    </button>
                    <input type="file" ref={fileInputRef} onChange={handleImportData} accept=".json" className="hidden" />
                    <button onClick={() => fileInputRef.current?.click()} title="Import Data" className="flex-1 flex items-center justify-center space-x-2 px-3 py-2 text-sm font-medium text-center rounded-md bg-nexus-gray-700 hover:bg-nexus-gray-600 transition-colors">
                        <UploadIcon className="w-4 h-4" />
                        <span>Import</span>
                    </button>
                    <button onClick={() => setView('plugins')} title="Manage Plugins" className="flex-1 flex items-center justify-center space-x-2 px-3 py-2 text-sm font-medium text-center rounded-md bg-nexus-gray-700 hover:bg-nexus-gray-600 transition-colors">
                        <CodeIcon className="w-4 h-4" />
                        <span>Plugins</span>
                    </button>
                </div>
            </aside>
            <main className="flex-1 flex flex-col">
                {renderMainContent()}
            </main>
        </div>
    );
};