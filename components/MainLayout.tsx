import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Character, ChatSession, AppData, Plugin, GeminiApiRequest, Message, CryptoKeys } from '../types';
import { loadData, saveData } from '../services/secureStorage';
import { CharacterList } from './CharacterList';
import { ChatList } from './ChatList';
import { CharacterForm } from './CharacterForm';
import { ChatInterface } from './ChatInterface';
import { PluginManager } from './PluginManager';
import { LogViewer } from './LogViewer';
import { HelpModal } from './HelpModal';
import { ChatSelectionModal } from './ChatSelectionModal';
import { ThemeSwitcher } from './ThemeSwitcher';
import { PluginSandbox } from '../services/pluginSandbox';
import * as geminiService from '../services/geminiService';
import * as compatibilityService from '../services/compatibilityService';
import * as cryptoService from '../services/cryptoService';
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
    nexus.log('Error in image generation plugin:', error);
    // Return an error structure that the UI can handle
    return { error: String(error) };
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

const defaultTtsPlugin: Plugin = {
    id: 'default-tts-narrator',
    name: 'Text-to-Speech (TTS)',
    description: 'Enables text-to-speech functionality in the chat interface. Note: This plugin is a placeholder as TTS is now a core feature and cannot be disabled.',
    enabled: true,
    code: `
// Text-to-Speech (TTS) is now a core feature of AI Nexus.
// The UI for TTS (speaker icons on messages, etc.) is built directly into the app.
// This approach is necessary because plugins run in a secure sandbox
// and cannot directly manipulate the application's user interface (DOM).

// This plugin remains to ensure users are aware the feature is active.
// It does not contain any executable hooks.

nexus.log('TTS Plugin loaded (Core Feature).');
`,
    settings: {}
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
                // The image generation plugin now has its own complete settings object.
                // We pass this directly to the service.
                const imagePlugin = appData.plugins?.find(p => p.id === 'default-image-generator');
                const settings = { ...imagePlugin?.settings, ...request.settings };
                return await geminiService.generateImageFromPrompt(request.prompt, settings);
            default:
                throw new Error('Unknown API request type from plugin.');
        }
    }, [appData.plugins]);

    useEffect(() => {
        const loadInitialData = async () => {
            logger.log("Loading initial application data...");
            const data = await loadData();
            let dataNeedsSave = false;
            
            // --- Key Generation and Migration ---
            if (!data.userKeys) {
                logger.log("User signing keys not found. Generating new master key pair.");
                const keyPair = await cryptoService.generateSigningKeyPair();
                data.userKeys = {
                    publicKey: await cryptoService.exportKey(keyPair.publicKey),
                    privateKey: await cryptoService.exportKey(keyPair.privateKey),
                };
                dataNeedsSave = true;
                logger.log("New user master key pair generated.");
            }
            
            const defaultPlugins = [defaultImagePlugin, defaultTtsPlugin];
            if (!data.plugins) data.plugins = [];

            defaultPlugins.forEach(defaultPlugin => {
                let hasPlugin = data.plugins.some(p => p.id === defaultPlugin.id);
                if (!hasPlugin) {
                    data.plugins.push(defaultPlugin);
                    logger.log(`Default plugin injected: ${defaultPlugin.name}`);
                    dataNeedsSave = true;
                } else {
                    // Ensure settings exist on existing default plugins
                    data.plugins = data.plugins.map(p => {
                        if (p.id === defaultPlugin.id && !p.settings) {
                            dataNeedsSave = true;
                            return { ...p, settings: defaultPlugin.settings };
                        }
                        return p;
                    });
                }
            });


            if (dataNeedsSave) {
                await persistData(data);
                logger.log("Initial data modifications saved.");
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
    }, [persistData]);

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

    const handleSaveCharacter = async (character: Character) => {
        const isNew = !appData.characters.some(c => c.id === character.id);
        let updatedCharacter = { ...character };

        // Generate signing keys for a new character or one that's missing them
        if (isNew || !updatedCharacter.keys) {
            logger.log(`Generating signing keys for character: ${updatedCharacter.name}`);
            const keyPair = await cryptoService.generateSigningKeyPair();
            updatedCharacter.keys = {
                publicKey: await cryptoService.exportKey(keyPair.publicKey),
                privateKey: await cryptoService.exportKey(keyPair.privateKey),
            };
        }
        
        // Sign the character data with the user's master key
        if (appData.userKeys) {
            logger.log("Signing character data with user's master key...");
            const userPrivateKey = await cryptoService.importKey(appData.userKeys.privateKey, 'sign');
            
            const dataToSign: Partial<Character> = { ...updatedCharacter };
            delete dataToSign.signature; // Exclude the signature itself
            
            const canonicalString = cryptoService.createCanonicalString(dataToSign);
            updatedCharacter.signature = await cryptoService.sign(canonicalString, userPrivateKey);
            updatedCharacter.userPublicKeyJwk = appData.userKeys.publicKey;
            logger.log("Character data signed successfully.");
        }

        const updatedCharacters = isNew 
            ? [...appData.characters, updatedCharacter] 
            : appData.characters.map(c => c.id === updatedCharacter.id ? updatedCharacter : c);
        
        const updatedData = { ...appData, characters: updatedCharacters };
        setAppData(updatedData);
        persistData(updatedData);
        logger.log(`Character ${isNew ? 'created' : 'updated'}: ${updatedCharacter.name}`);
        
        setView('chat');
        setEditingCharacter(null);
    };
    
    const handleCharacterUpdate = useCallback((character: Character) => {
        setAppData(prevAppData => {
            const updatedCharacters = prevAppData.characters.map(c => c.id === character.id ? character : c);
            const updatedData = { ...prevAppData, characters: updatedCharacters };
            persistData(updatedData);
            logger.log(`Character data updated programmatically: ${character.name}`);
            return updatedData;
        });
    }, [persistData]);

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

    const handleSessionUpdate = useCallback((session: ChatSession) => {
        setAppData(prevAppData => {
            const sessionExists = prevAppData.chatSessions.some(s => s.id === session.id);
            const updatedSessions = sessionExists
                ? prevAppData.chatSessions.map(s => s.id === session.id ? session : s)
                : [...prevAppData.chatSessions, session];
    
            const updatedData = { ...prevAppData, chatSessions: updatedSessions };
            persistData(updatedData);
            return updatedData;
        });
    }, [persistData]);

    const triggerDownload = (filename: string, data: object) => {
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleExportBackup = async () => {
        try {
            const data = await loadData();
            const timestamp = new Date().toISOString().split('T')[0];
            const filename = `ai-nexus-backup-${timestamp}.json`;
            triggerDownload(filename, data);
            logger.log("Full backup exported successfully.", { filename });
        } catch (error) {
            logger.error("Failed to export backup.", error);
            alert("Failed to export backup. Check logs for details.");
        }
    };

    const handleExportCharacter = async (characterId: string) => {
        const character = appData.characters.find(c => c.id === characterId);
        if (character) {
            try {
                const card = await compatibilityService.nexusToV2(character);
                const filename = `${character.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
                triggerDownload(filename, card);
                logger.log(`Exported character: ${character.name}`, { filename });
            } catch (error) {
                logger.error(`Failed to export character: ${character.name}`, error);
                alert(`Failed to export character. Check logs. Error: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    };

    const handleExportChat = (sessionId: string) => {
        const session = appData.chatSessions.find(s => s.id === sessionId);
        if (session) {
            const filename = `${session.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_chat.json`;
            triggerDownload(filename, session);
            logger.log(`Exported chat: ${session.name}`, { filename });
        }
    };
    
    const handleImportData = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        logger.log(`Starting data import from file: ${file.name}`);
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const text = e.target?.result as string;
                const data = JSON.parse(text);

                // 1. Check for AI Nexus Full Backup
                if (data.characters && data.chatSessions) {
                    if (window.confirm('This appears to be a full backup. Importing it will overwrite all current data. Are you sure?')) {
                        await persistData(data);
                        logger.log("Full backup imported successfully! Reloading application...");
                        alert('Backup restored successfully! The application will now reload.');
                        window.location.reload();
                    }
                    return;
                }

                // 2. Check for Character Card
                const importedChar = compatibilityService.v2ToNexus(data);
                if (importedChar) {
                    // Asynchronously verify signature if it exists
                    if (importedChar.signature && importedChar.userPublicKeyJwk) {
                        (async () => {
                            try {
                                const userPublicKey = await cryptoService.importKey(importedChar.userPublicKeyJwk, 'verify');
                                const dataToVerify: Partial<Character> = { ...importedChar };
                                delete dataToVerify.signature;
                                const canonicalString = cryptoService.createCanonicalString(dataToVerify);
                                const isValid = await cryptoService.verify(canonicalString, importedChar.signature, userPublicKey);
                                if (!isValid) {
                                    logger.warn(`Signature for imported character "${importedChar.name}" is INVALID.`);
                                    alert(`Warning: The signature for the imported character "${importedChar.name}" is invalid. The data may have been tampered with.`);
                                } else {
                                    logger.log(`Signature for imported character "${importedChar.name}" is VALID.`);
                                }
                            } catch (err) {
                                 logger.error(`Error verifying signature for imported character "${importedChar.name}".`, err);
                            }
                        })();
                    }
                    
                    const updatedData = { ...appData, characters: [...appData.characters, importedChar] };
                    setAppData(updatedData);
                    await persistData(updatedData);
                    logger.log(`Imported character: ${importedChar.name}`);
                    alert(`Character "${importedChar.name}" imported successfully. Edit and save the character to generate new signing keys.`);
                    return;
                }

                // 3. Check for AI Nexus Chat Session
                if (data.id && Array.isArray(data.messages) && Array.isArray(data.characterIds)) {
                    const newSession: ChatSession = { ...data, id: crypto.randomUUID() }; // new ID to prevent collision
                    const updatedData = { ...appData, chatSessions: [...appData.chatSessions, newSession] };
                    setAppData(updatedData);
                    await persistData(updatedData);
                    logger.log(`Imported chat session: ${newSession.name}`);
                    alert(`Chat "${newSession.name}" imported successfully.`);
                    return;
                }
                
                throw new Error("Unrecognized file format.");

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

    const handleMemoryImport = (fromSessionId: string, toSessionId: string) => {
        const fromSession = appData.chatSessions.find(s => s.id === fromSessionId);
        const toSession = appData.chatSessions.find(s => s.id === toSessionId);

        if (!fromSession || !toSession) {
            logger.error("Could not find sessions for memory import.");
            return;
        }

        const toSessionParticipants = appData.characters.filter(c => toSession.characterIds.includes(c.id));
        let charactersToUpdate: Character[] = [];
        let memoriesImported = false;

        toSessionParticipants.forEach(toChar => {
            if (fromSession.characterIds.includes(toChar.id)) {
                const fromChar = appData.characters.find(c => c.id === toChar.id);
                if (fromChar && fromChar.memory && fromChar.memory.trim() !== 'No memories yet.') {
                    const updatedMemory = `${toChar.memory || ''}\n\n[Imported memory from chat "${fromSession.name}"]:\n${fromChar.memory}`;
                    charactersToUpdate.push({ ...toChar, memory: updatedMemory.trim() });
                    memoriesImported = true;
                }
            }
        });
        
        if (!memoriesImported) {
             alert(`No shared characters with memories found in "${fromSession.name}".`);
             return;
        }

        const updatedCharacters = appData.characters.map(c => {
            const updated = charactersToUpdate.find(uc => uc.id === c.id);
            return updated || c;
        });
        
        const narratorMessage: Message = {
            role: 'narrator',
            content: `Memory from "${fromSession.name}" has been integrated.`,
            timestamp: new Date().toISOString()
        };
        const updatedSession = {...toSession, messages: [...toSession.messages, narratorMessage] };
        const updatedSessions = appData.chatSessions.map(s => s.id === toSessionId ? updatedSession : s);
        
        const updatedData = { ...appData, characters: updatedCharacters, chatSessions: updatedSessions };
        setAppData(updatedData);
        persistData(updatedData);

        logger.log(`Memory imported from session "${fromSession.name}" to "${toSession.name}"`);
    };
    
    const triggerPluginHook = useCallback(async <T, R>(hookName: string, data: T): Promise<R> => {
        let processedData: any = data;
        const enabledPlugins = appData.plugins?.filter(p => p.enabled) || [];

        // Special handling for image generation to inject its settings
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
                        allChatSessions={appData.chatSessions}
                        userKeys={appData.userKeys}
                        onSessionUpdate={handleSessionUpdate}
                        onTriggerHook={triggerPluginHook}
                        onCharacterUpdate={handleCharacterUpdate}
                        onMemoryImport={handleMemoryImport}
                    />
                ) : (
                    <div className="flex-1 flex items-center justify-center bg-nexus-gray-light-200 dark:bg-nexus-gray-900">
                        <div className="text-center text-nexus-gray-700 dark:text-nexus-gray-500">
                            <h2 className="text-2xl">Welcome to AI Nexus</h2>
                            <p>Create a character and start a new chat to begin.</p>
                        </div>
                    </div>
                );
        }
    }

    return (
        <div className="flex h-screen bg-nexus-light dark:bg-nexus-dark text-nexus-gray-900 dark:text-nexus-gray-200 font-sans">
            {isLogViewerVisible && <LogViewer onClose={() => setIsLogViewerVisible(false)} />}
            {isHelpVisible && <HelpModal onClose={() => setIsHelpVisible(false)} />}
            {isChatModalVisible && <ChatSelectionModal characters={appData.characters} onClose={() => setIsChatModalVisible(false)} onCreateChat={handleCreateChat}/>}
            
            <aside className="w-80 bg-nexus-gray-light-200 dark:bg-nexus-gray-800 flex flex-col p-4 border-r border-nexus-gray-light-300 dark:border-nexus-gray-700">
                <div className="flex items-center justify-between mb-4">
                    <h1 className="text-2xl font-bold text-nexus-gray-900 dark:text-white">AI Nexus</h1>
                    <ThemeSwitcher />
                </div>

                <div className="flex justify-between items-center mb-2">
                    <h2 className="text-lg font-semibold text-nexus-gray-900 dark:text-white">Chats</h2>
                    <button onClick={() => setIsChatModalVisible(true)} className="p-2 rounded-md text-nexus-gray-600 dark:text-nexus-gray-400 hover:bg-nexus-gray-light-300 dark:hover:bg-nexus-gray-700 hover:text-nexus-gray-900 dark:hover:text-white transition-colors" title="New Chat">
                        <PlusIcon className="w-5 h-5" />
                    </button>
                </div>
                <ChatList 
                    chatSessions={appData.chatSessions}
                    characters={appData.characters}
                    selectedChatId={selectedChatId}
                    onSelectChat={handleSelectChat}
                    onDeleteChat={handleDeleteChat}
                    onExportChat={handleExportChat}
                />
                
                <div className="mt-4 flex-shrink-0">
                    <CharacterList 
                        characters={appData.characters}
                        onDeleteCharacter={handleDeleteCharacter}
                        onEditCharacter={handleEditCharacter}
                        onAddNew={handleAddNewCharacter}
                        onExportCharacter={handleExportCharacter}
                    />
                </div>

                <div className="mt-auto pt-4 border-t border-nexus-gray-light-300 dark:border-nexus-gray-700 grid grid-cols-2 gap-2">
                    <input type="file" ref={fileInputRef} onChange={handleImportData} accept=".json" className="hidden" />
                    <button onClick={() => fileInputRef.current?.click()} title="Import Character, Chat, or Backup" className="flex items-center justify-center space-x-2 px-3 py-2 text-sm font-medium text-center rounded-md bg-nexus-gray-light-300 dark:bg-nexus-gray-700 hover:bg-nexus-gray-light-400 dark:hover:bg-nexus-gray-600 transition-colors">
                        <UploadIcon className="w-4 h-4" />
                        <span>Import</span>
                    </button>
                    <button onClick={handleExportBackup} title="Export Full Backup" className="flex items-center justify-center space-x-2 px-3 py-2 text-sm font-medium text-center rounded-md bg-nexus-gray-light-300 dark:bg-nexus-gray-700 hover:bg-nexus-gray-light-400 dark:hover:bg-nexus-gray-600 transition-colors">
                        <DownloadIcon className="w-4 h-4" />
                        <span>Export Backup</span>
                    </button>
                    <button onClick={() => setView('plugins')} title="Manage Plugins" className="flex items-center justify-center space-x-2 px-3 py-2 text-sm font-medium text-center rounded-md bg-nexus-gray-light-300 dark:bg-nexus-gray-700 hover:bg-nexus-gray-light-400 dark:hover:bg-nexus-gray-600 transition-colors">
                        <CodeIcon className="w-4 h-4" />
                        <span>Plugins</span>
                    </button>
                     <button onClick={() => setIsLogViewerVisible(true)} title="View Application Logs" className="flex items-center justify-center space-x-2 px-3 py-2 text-sm font-medium text-center rounded-md bg-nexus-gray-light-300 dark:bg-nexus-gray-700 hover:bg-nexus-gray-light-400 dark:hover:bg-nexus-gray-600 transition-colors">
                        <TerminalIcon className="w-4 h-4" />
                        <span>Logs</span>
                    </button>
                    <button onClick={() => setIsHelpVisible(true)} title="Open Help Center" className="col-span-2 flex items-center justify-center space-x-2 px-3 py-2 text-sm font-medium text-center rounded-md bg-nexus-gray-light-300 dark:bg-nexus-gray-700 hover:bg-nexus-gray-light-400 dark:hover:bg-nexus-gray-600 transition-colors">
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
