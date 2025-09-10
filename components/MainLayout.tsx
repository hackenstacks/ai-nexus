import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Character, ChatSession, AppData, Plugin, GeminiApiRequest, Message, CryptoKeys, RagSource, ConfirmationRequest, UISettings } from '../types';
import { loadData, saveData } from '../services/secureStorage';
import * as ragService from '../services/ragService';
import { CharacterList } from './CharacterList';
import { ChatList } from './ChatList';
import { CharacterForm } from './CharacterForm';
import { ChatInterface } from './ChatInterface';
import { PluginManager } from './PluginManager';
import { LogViewer } from './LogViewer';
import { HelpModal } from './HelpModal';
import { ChatSelectionModal } from './ChatSelectionModal';
import { ConfirmationModal } from './ConfirmationModal';
import { ThemeSwitcher } from './ThemeSwitcher';
import { AppearanceModal } from './AppearanceModal';
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
import { ChatBubbleIcon } from './icons/ChatBubbleIcon';
import { UsersIcon } from './icons/UsersIcon';
import { PaletteIcon } from './icons/PaletteIcon';


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
type ActivePanel = 'chats' | 'characters' | 'none';
type ActiveView = 'chats' | 'characters' | 'plugins';

export const MainLayout: React.FC = () => {
    const [appData, setAppData] = useState<AppData>({ characters: [], chatSessions: [], plugins: [] });
    
    const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
    const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
    const [view, setView] = useState<View>('chat');
    const [activeView, setActiveView] = useState<ActiveView>('chats');

    const [isLogViewerVisible, setIsLogViewerVisible] = useState(false);
    const [isHelpVisible, setIsHelpVisible] = useState(false);
    const [isChatModalVisible, setIsChatModalVisible] = useState(false);
    const [isAppearanceModalVisible, setIsAppearanceModalVisible] = useState(false);
    const [confirmationRequest, setConfirmationRequest] = useState<ConfirmationRequest | null>(null);
    const [activePanel, setActivePanel] = useState<ActivePanel>('chats');
    const [showArchivedChats, setShowArchivedChats] = useState(false);
    const [showArchivedCharacters, setShowArchivedCharacters] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const sandboxes = useRef(new Map<string, PluginSandbox>()).current;

    const persistData = useCallback(async (data: AppData) => {
        await saveData(data);
    }, []);

    const handlePanelToggle = (panel: ActivePanel) => {
        setActivePanel(prev => (prev === panel ? 'none' : panel));
    };

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
            
            // --- UI Settings Migration (from global to per-chat) ---
            const dataAsAny = data as any;
            if (dataAsAny.uiSettings && Object.keys(dataAsAny.uiSettings).length > 0) {
                logger.log("Migrating global UI settings to chat sessions...");
                const globalSettings = dataAsAny.uiSettings;
                delete dataAsAny.uiSettings;

                data.chatSessions = data.chatSessions.map(cs => {
                    if (!cs.uiSettings) {
                        return { ...cs, uiSettings: globalSettings };
                    }
                    return cs;
                });
                
                logger.log(`Applied global UI settings to relevant chat sessions.`);
                dataNeedsSave = true;
            }

            const defaultPlugins = [defaultImagePlugin, defaultTtsPlugin];
            if (!data.plugins) data.plugins = [];

            defaultPlugins.forEach(defaultPlugin => {
                let hasPlugin = data.plugins!.some(p => p.id === defaultPlugin.id);
                if (!hasPlugin) {
                    data.plugins!.push(defaultPlugin);
                    logger.log(`Default plugin injected: ${defaultPlugin.name}`);
                    dataNeedsSave = true;
                } else {
                    // Ensure settings exist on existing default plugins
                    data.plugins = data.plugins!.map(p => {
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
                setSelectedChatId(data.chatSessions.find(cs => !cs.isArchived)?.id || data.chatSessions[0].id);
                setActiveView('chats');
            } else {
                // If there are no chats but there are characters, open the character panel
                if (data.characters.length > 0) {
                    setActivePanel('characters');
                    setActiveView('characters');
                }
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
        await persistData(updatedData); // Use await here
        logger.log(`Character ${isNew ? 'created' : 'updated'}: ${updatedCharacter.name}`);
        
        // If we were editing, update the state for the form to reflect the saved data
        if (editingCharacter && editingCharacter.id === updatedCharacter.id) {
            setEditingCharacter(updatedCharacter);
        }
        
        setView('chat');
        setActiveView('chats');
        if (isNew) {
           setEditingCharacter(null);
        }
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

    const handleArchiveCharacter = (characterId: string) => {
        const characterName = appData.characters.find(c => c.id === characterId)?.name || 'Unknown';
        setConfirmationRequest({
            message: (
                <span>Are you sure you want to archive <strong>{characterName}</strong>? They will be hidden from the list but can be restored later.</span>
            ),
            onConfirm: () => {
                const updatedCharacters = appData.characters.map(c => 
                    c.id === characterId ? { ...c, isArchived: true } : c
                );
                
                const updatedData = { ...appData, characters: updatedCharacters };
                setAppData(updatedData);
                persistData(updatedData);
                logger.log(`Archived character: ${characterName}`);
                setConfirmationRequest(null);
            },
            onCancel: () => setConfirmationRequest(null)
        });
    };

    const handleRestoreCharacter = (characterId: string) => {
        const updatedCharacters = appData.characters.map(c => 
            c.id === characterId ? { ...c, isArchived: false } : c
        );
        const updatedData = { ...appData, characters: updatedCharacters };
        setAppData(updatedData);
        persistData(updatedData);
        logger.log(`Restored character: ${appData.characters.find(c => c.id === characterId)?.name}`);
    };

    const handlePermanentlyDeleteCharacter = (characterId: string) => {
        const characterName = appData.characters.find(c => c.id === characterId)?.name || 'Unknown';
        setConfirmationRequest({
            message: (
                <span>Are you sure you want to permanently delete <strong>{characterName}</strong>? All chats involving this character and all associated knowledge files will also be permanently deleted. This action cannot be undone.</span>
            ),
            onConfirm: () => {
                const characterToDelete = appData.characters.find(c => c.id === characterId);
                
                if (characterToDelete?.ragSources && characterToDelete.ragSources.length > 0) {
                    characterToDelete.ragSources.forEach(async (source) => {
                        await ragService.deleteSource(source.id);
                    });
                    logger.log(`Deleted all knowledge sources for character: ${characterName}`);
                }

                const updatedCharacters = appData.characters.filter(c => c.id !== characterId);
                const updatedSessions = appData.chatSessions.filter(s => !s.characterIds.includes(characterId));
                
                const updatedData = { ...appData, characters: updatedCharacters, chatSessions: updatedSessions };
                setAppData(updatedData);
                persistData(updatedData);
                logger.log(`Permanently deleted character and associated sessions: ${characterName}`);

                if (selectedChatId && !updatedSessions.some(s => s.id === selectedChatId)) {
                    setSelectedChatId(updatedSessions.length > 0 ? updatedSessions[0].id : null);
                }
                setConfirmationRequest(null);
            },
            onCancel: () => setConfirmationRequest(null)
        });
    };

    const handleDeleteRagSource = async (characterId: string, sourceId: string) => {
        const character = appData.characters.find(c => c.id === characterId);
        if (!character) return;
        const source = character.ragSources?.find(s => s.id === sourceId);
        if (!source) return;

        setConfirmationRequest({
            message: `Are you sure you want to delete the knowledge file "${source.fileName}"? This cannot be undone.`,
            onConfirm: async () => {
                try {
                    await ragService.deleteSource(sourceId);
                    const updatedCharacter = {
                        ...character,
                        ragSources: character.ragSources?.filter(s => s.id !== sourceId)
                    };
                    await handleSaveCharacter(updatedCharacter);
                    logger.log(`Deleted RAG source "${source.fileName}" for character ${character.name}`);
                } catch (error) {
                    logger.error("Failed to delete RAG source:", error);
                    alert(`Failed to delete knowledge source. Check logs for details.`);
                } finally {
                    setConfirmationRequest(null);
                }
            },
            onCancel: () => setConfirmationRequest(null)
        });
    };

    const handleCreateChat = (name: string, characterIds: string[]) => {
        const newSession: ChatSession = {
            id: crypto.randomUUID(),
            name,
            characterIds,
            messages: [],
            uiSettings: {}
        };
        const updatedSessions = [...appData.chatSessions, newSession];
        const updatedData = { ...appData, chatSessions: updatedSessions };
        setAppData(updatedData);
        persistData(updatedData);
        setSelectedChatId(newSession.id);
        setActiveView('chats');
        setIsChatModalVisible(false);
        logger.log(`New chat created: "${name}"`);
        setActivePanel('none');
    };

    const handleArchiveChat = (sessionId: string) => {
        const sessionName = appData.chatSessions.find(s => s.id === sessionId)?.name || 'Unknown Chat';
        setConfirmationRequest({
            message: `Are you sure you want to archive the chat session "${sessionName}"? It can be restored later.`,
            onConfirm: () => {
                const updatedSessions = appData.chatSessions.map(s => 
                    s.id === sessionId ? { ...s, isArchived: true } : s
                );
                const updatedData = { ...appData, chatSessions: updatedSessions };
                setAppData(updatedData);
                persistData(updatedData);
                if (selectedChatId === sessionId) {
                    setSelectedChatId(updatedSessions.find(s => !s.isArchived)?.id || null);
                }
                logger.log(`Chat session archived: ${sessionId}`);
                setConfirmationRequest(null);
            },
            onCancel: () => setConfirmationRequest(null)
        });
    };

    const handleRestoreChat = (sessionId: string) => {
        const updatedSessions = appData.chatSessions.map(s => 
            s.id === sessionId ? { ...s, isArchived: false } : s
        );
        const updatedData = { ...appData, chatSessions: updatedSessions };
        setAppData(updatedData);
        persistData(updatedData);
        logger.log(`Restored chat: ${appData.chatSessions.find(s => s.id === sessionId)?.name}`);
    };

    const handlePermanentlyDeleteChat = (sessionId: string) => {
        const sessionName = appData.chatSessions.find(s => s.id === sessionId)?.name || 'Unknown Chat';
        setConfirmationRequest({
            message: `Are you sure you want to permanently delete the chat session "${sessionName}"? This action cannot be undone.`,
            onConfirm: () => {
                const updatedSessions = appData.chatSessions.filter(s => s.id !== sessionId);
                const updatedData = { ...appData, chatSessions: updatedSessions };
                setAppData(updatedData);
                persistData(updatedData);
                if (selectedChatId === sessionId) {
                    setSelectedChatId(updatedSessions.length > 0 ? updatedSessions[0].id : null);
                }
                logger.log(`Chat session permanently deleted: ${sessionId}`);
                setConfirmationRequest(null);
            },
            onCancel: () => setConfirmationRequest(null)
        });
    };
    
    const handleEditCharacter = (character: Character) => {
        setEditingCharacter(character);
        setView('form');
        setActiveView('characters');
        setActivePanel('none');
    };
    
    const handleAddNewCharacter = () => {
        setEditingCharacter(null);
        setView('form');
        setActiveView('characters');
        setActivePanel('none');
    };

    const handleSelectChat = (sessionId: string) => {
        setSelectedChatId(sessionId);
        setView('chat');
        setActiveView('chats');
        setEditingCharacter(null);
        setActivePanel('none');
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

    const handleSaveBackup = useCallback(async () => {
        try {
            const dataToExport = {
                spec: 'ai_nexus_backup',
                version: '1.0',
                data: appData
            };
            const timestamp = new Date().toISOString().split('T')[0];
            const filename = `ai-nexus-backup-${timestamp}.json`;
            triggerDownload(filename, dataToExport);
            logger.log("Full backup saved successfully.", { filename });
        } catch (error) {
            logger.error("Failed to save backup.", error);
            alert("Failed to save backup. Check logs for details.");
        }
    }, [appData]);

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
        if (!file) {
            logger.warn("Import handler was called but no file was selected.");
            return;
        }

        logger.log(`Starting data import from file: ${file.name}`);
        const reader = new FileReader();

        reader.onerror = (error) => {
            logger.error("FileReader failed to read the file.", error);
            alert("An error occurred while trying to read the file. Please check the browser console for details.");
        };
        
        reader.onload = async (e) => {
            logger.log("File has been loaded into memory. Processing content...");
            try {
                const text = e.target?.result as string;
                if (!text) {
                    throw new Error("File content is empty.");
                }
                const data = JSON.parse(text);

                // Helper to validate the core structure of AppData, now with deeper checks.
                const isValidAppData = (d: any): d is AppData => {
                    if (typeof d !== 'object' || d === null) {
                        logger.debug("Import validation failed: data is not a non-null object.");
                        return false;
                    }
                    
                    // Check characters array and its contents
                    if (!Array.isArray(d.characters)) {
                        logger.debug("Import validation failed: 'characters' is not an array.");
                        return false;
                    }
                    if (d.characters.some((c: any) => typeof c !== 'object' || c === null)) {
                        logger.debug("Import validation failed: 'characters' array contains non-object or null entries.");
                        return false;
                    }

                    // Check chatSessions array and its contents
                    if (!Array.isArray(d.chatSessions)) {
                        logger.debug("Import validation failed: 'chatSessions' is not an array.");
                        return false;
                    }
                    if (d.chatSessions.some((s: any) => typeof s !== 'object' || s === null)) {
                        logger.debug("Import validation failed: 'chatSessions' array contains non-object or null entries.");
                        return false;
                    }
                    
                    // Check plugins array if it exists
                    if (d.plugins !== undefined) {
                        if (!Array.isArray(d.plugins)) {
                            logger.debug("Import validation failed: 'plugins' exists but is not an array.");
                            return false;
                        }
                        if (d.plugins.some((p: any) => typeof p !== 'object' || p === null)) {
                            logger.debug("Import validation failed: 'plugins' array contains non-object or null entries.");
                            return false;
                        }
                    }

                    return true;
                };


                // --- Type Identification Logic ---

                // 1. AI Nexus Backup (v1.0+)
                if (data.spec === 'ai_nexus_backup' && isValidAppData(data.data)) {
                    logger.log("Detected valid AI Nexus full backup format.");
                    setConfirmationRequest({
                        message: 'This is a full backup file. Importing it will overwrite all of your current characters, chats, and settings. Are you sure you want to continue?',
                        onConfirm: async () => {
                            try {
                                await persistData(data.data);
                                logger.log("Full backup imported successfully! Reloading application...");
                                alert('Backup restored successfully! The application will now reload.');
                                setConfirmationRequest(null);
                                window.location.reload();
                            } catch (err) {
                                logger.error("Failed to save imported backup data.", err);
                                alert("Could not save the imported backup data. The database might be full or corrupted.");
                                setConfirmationRequest(null);
                            }
                        },
                        onCancel: () => {
                            logger.log("Backup import cancelled by user.");
                            setConfirmationRequest(null);
                        }
                    });
                    return;
                }

                // 2. Character Card (V2 compatible or Nexus-exported)
                const importedChar = compatibilityService.v2ToNexus(data);
                if (importedChar) {
                    logger.log("Detected Character Card format.");
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
                    alert(`Character "${importedChar.name}" imported successfully. Edit and save the character to generate new signing keys if it's from an external source.`);
                    return;
                }
                
                // 3. Legacy Backup (checked after specific formats)
                if (isValidAppData(data)) {
                    logger.log("Detected legacy backup format.");
                    setConfirmationRequest({
                        message: 'This appears to be a full backup. Importing it will overwrite all current data. Are you sure?',
                        onConfirm: async () => {
                             try {
                                await persistData(data); // Legacy format is the raw AppData
                                logger.log("Legacy backup imported successfully! Reloading application...");
                                alert('Backup restored successfully! The application will now reload.');
                                setConfirmationRequest(null);
                                window.location.reload();
                             } catch (err) {
                                logger.error("Failed to save imported backup data.", err);
                                alert("Could not save the imported backup data. The database might be full or corrupted.");
                                setConfirmationRequest(null);
                            }
                        },
                        onCancel: () => {
                            logger.log("Backup import cancelled by user.");
                            setConfirmationRequest(null);
                        }
                    });
                    return;
                }

                // 4. Chat Session
                if (data.id && Array.isArray(data.messages) && Array.isArray(data.characterIds)) {
                    logger.log("Detected Chat Session format.");
                    const newSession: ChatSession = { ...data, id: crypto.randomUUID() }; // new ID to prevent collision
                    const updatedData = { ...appData, chatSessions: [...appData.chatSessions, newSession] };
                    setAppData(updatedData);
                    await persistData(updatedData);
                    logger.log(`Imported chat session: ${newSession.name}`);
                    alert(`Chat "${newSession.name}" imported successfully.`);
                    return;
                }
                
                // 5. Fallback
                throw new Error("Unrecognized file format. The file is not a valid character card, chat session, or full backup.");

            } catch (error) {
                logger.error("Import failed during processing:", error);
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
    
    const handleGenerateImage = useCallback(async (prompt: string): Promise<string | null> => {
        try {
            const imagePlugin = appData.plugins?.find(p => p.id === 'default-image-generator');
            if (!imagePlugin) {
                throw new Error("Image generation plugin not found.");
            }
            logger.log("Generating image with prompt:", prompt);
            const imageUrl = await geminiService.generateImageFromPrompt(prompt, imagePlugin.settings);
            logger.log("Image generated successfully.");
            return imageUrl;
        } catch (error) {
            logger.error("Failed to generate image:", error);
            alert(`Image generation failed. Please check plugin settings and logs. Details: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }, [appData.plugins]);

    const handleViewPlugins = () => {
        setView('plugins');
        setActiveView('plugins');
        setActivePanel('none');
    };
    
    const handleCancelForm = () => {
        setView('chat');
        setActiveView('chats');
    }

    const handleUiSettingsUpdate = useCallback(async (newSettings: UISettings) => {
        if (!selectedChatId) return;

        const updatedSessions = appData.chatSessions.map(session => 
            session.id === selectedChatId 
                ? { ...session, uiSettings: newSettings } 
                : session
        );
        const updatedData = { ...appData, chatSessions: updatedSessions };
        setAppData(updatedData);
        await persistData(updatedData);
        logger.log("UI appearance settings updated for chat:", selectedChatId);
    }, [appData, persistData, selectedChatId]);

    const selectedChat = appData.chatSessions.find(s => s.id === selectedChatId);

    const renderMainContent = () => {
        switch (view) {
            case 'form':
                return <CharacterForm 
                    character={editingCharacter} 
                    onSave={handleSaveCharacter} 
                    onCancel={handleCancelForm}
                    onDeleteRagSource={handleDeleteRagSource}
                    onGenerateImage={handleGenerateImage}
                />;
            case 'plugins':
                return <PluginManager
                    plugins={appData.plugins || []}
                    onPluginsUpdate={handlePluginsUpdate}
                    onSetConfirmation={setConfirmationRequest}
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
                        onSaveBackup={handleSaveBackup}
                        handlePluginApiRequest={handlePluginApiRequest}
                    />
                ) : (
                    <div className="flex-1 flex items-center justify-center h-full bg-nexus-gray-light-200 dark:bg-nexus-gray-900">
                        <div className="text-center text-nexus-gray-700 dark:text-nexus-gray-500">
                            <h2 className="text-2xl">Welcome to AI Nexus</h2>
                            <p>Select a chat or create a new one to begin.</p>
                        </div>
                    </div>
                );
        }
    };

    const renderPanelContent = () => {
        switch (activePanel) {
            case 'chats':
                return (
                    <>
                        <div className="flex justify-between items-center mb-2">
                            <h2 className="text-lg font-semibold text-nexus-gray-900 dark:text-white">Chats</h2>
                            <button onClick={() => setIsChatModalVisible(true)} className="p-2 rounded-md text-nexus-gray-600 dark:text-nexus-gray-400 hover:bg-nexus-gray-light-300 dark:hover:bg-nexus-gray-700 hover:text-nexus-gray-900 dark:hover:text-white transition-colors" title="New Chat">
                                <PlusIcon className="w-5 h-5" />
                            </button>
                        </div>
                        <ChatList 
                            chatSessions={appData.chatSessions.filter(c => !!c.isArchived === showArchivedChats)}
                            characters={appData.characters}
                            selectedChatId={selectedChatId}
                            onSelectChat={handleSelectChat}
                            onDeleteChat={handleArchiveChat}
                            onExportChat={handleExportChat}
                            showArchived={showArchivedChats}
                            onToggleArchiveView={() => setShowArchivedChats(!showArchivedChats)}
                            onRestoreChat={handleRestoreChat}
                            onPermanentlyDeleteChat={handlePermanentlyDeleteChat}
                        />
                    </>
                );
            case 'characters':
                return (
                     <CharacterList 
                        characters={appData.characters.filter(c => !!c.isArchived === showArchivedCharacters)}
                        onDeleteCharacter={handleArchiveCharacter}
                        onEditCharacter={handleEditCharacter}
                        onAddNew={handleAddNewCharacter}
                        onExportCharacter={handleExportCharacter}
                        showArchived={showArchivedCharacters}
                        onToggleArchiveView={() => setShowArchivedCharacters(!showArchivedCharacters)}
                        onRestoreCharacter={handleRestoreCharacter}
                        onPermanentlyDeleteCharacter={handlePermanentlyDeleteCharacter}
                    />
                );
            case 'none':
                return null;
        }
    };


    return (
        <div 
            className="relative h-screen w-screen overflow-hidden bg-nexus-light dark:bg-nexus-dark text-nexus-gray-900 dark:text-nexus-gray-200 font-sans flex transition-all duration-500"
            style={selectedChat?.uiSettings?.backgroundImage ? {
                backgroundImage: `url('${selectedChat.uiSettings.backgroundImage}')`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
            } : {}}
        >
            <div className="absolute inset-0 bg-nexus-light/80 dark:bg-nexus-dark/80 backdrop-blur-sm"></div>
            {isLogViewerVisible && <LogViewer onClose={() => setIsLogViewerVisible(false)} />}
            {isHelpVisible && <HelpModal onClose={() => setIsHelpVisible(false)} />}
            {isChatModalVisible && <ChatSelectionModal characters={appData.characters.filter(c => !c.isArchived)} onClose={() => setIsChatModalVisible(false)} onCreateChat={handleCreateChat}/>}
            {isAppearanceModalVisible && (
                <AppearanceModal 
                    settings={selectedChat?.uiSettings || {}}
                    currentChat={selectedChat}
                    allCharacters={appData.characters}
                    onUpdate={handleUiSettingsUpdate}
                    onGenerateImage={handleGenerateImage}
                    onClose={() => setIsAppearanceModalVisible(false)}
                />
            )}
            {confirmationRequest && (
                <ConfirmationModal 
                    message={confirmationRequest.message}
                    onConfirm={confirmationRequest.onConfirm}
                    onCancel={confirmationRequest.onCancel}
                />
            )}

            <div className="relative flex-shrink-0 bg-nexus-gray-light-100/80 dark:bg-nexus-gray-900/80 w-16 flex flex-col items-center justify-between py-4 border-r border-nexus-gray-light-300 dark:border-nexus-gray-700 z-20">
                <div className="flex flex-col items-center space-y-2">
                    <button onClick={() => handlePanelToggle('chats')} title="Chats" className={`p-2 rounded-lg ${activeView === 'chats' ? 'bg-nexus-blue-600 text-white' : 'text-nexus-gray-600 dark:text-nexus-gray-400 hover:bg-nexus-gray-light-300 dark:hover:bg-nexus-gray-700'}`}>
                        <ChatBubbleIcon className="w-6 h-6" />
                    </button>
                    <button onClick={() => handlePanelToggle('characters')} title="Characters" className={`p-2 rounded-lg ${activeView === 'characters' ? 'bg-nexus-blue-600 text-white' : 'text-nexus-gray-600 dark:text-nexus-gray-400 hover:bg-nexus-gray-light-300 dark:hover:bg-nexus-gray-700'}`}>
                        <UsersIcon className="w-6 h-6" />
                    </button>
                     <button onClick={handleViewPlugins} title="Plugins" className={`p-2 rounded-lg ${activeView === 'plugins' ? 'bg-nexus-blue-600 text-white' : 'text-nexus-gray-600 dark:text-nexus-gray-400 hover:bg-nexus-gray-light-300 dark:hover:bg-nexus-gray-700'}`}>
                        <CodeIcon className="w-6 h-6" />
                    </button>

                    <div className="w-8 border-t border-nexus-gray-light-300 dark:border-nexus-gray-700 my-2"></div>
                    
                    <button onClick={() => setIsAppearanceModalVisible(true)} title="Appearance Settings" className="p-2 rounded-lg text-nexus-gray-600 dark:text-nexus-gray-400 hover:bg-nexus-gray-light-300 dark:hover:bg-nexus-gray-700">
                        <PaletteIcon className="w-6 h-6" />
                    </button>
                    <input type="file" ref={fileInputRef} onChange={handleImportData} accept=".json" className="hidden" />
                    <button onClick={handleSaveBackup} title="Save Full Backup" className="p-2 rounded-lg text-nexus-gray-600 dark:text-nexus-gray-400 hover:bg-nexus-gray-light-300 dark:hover:bg-nexus-gray-700">
                        <DownloadIcon className="w-6 h-6" />
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} title="Import Data" className="p-2 rounded-lg text-nexus-gray-600 dark:text-nexus-gray-400 hover:bg-nexus-gray-light-300 dark:hover:bg-nexus-gray-700">
                        <UploadIcon className="w-6 h-6" />
                    </button>
                    <button onClick={() => setIsLogViewerVisible(true)} title="View Logs" className="p-2 rounded-lg text-nexus-gray-600 dark:text-nexus-gray-400 hover:bg-nexus-gray-light-300 dark:hover:bg-nexus-gray-700">
                        <TerminalIcon className="w-6 h-6" />
                    </button>
                    <button onClick={() => setIsHelpVisible(true)} title="Help" className="p-2 rounded-lg text-nexus-gray-600 dark:text-nexus-gray-400 hover:bg-nexus-gray-light-300 dark:hover:bg-nexus-gray-700">
                        <HelpIcon className="w-6 h-6" />
                    </button>

                </div>
                <div className="flex flex-col items-center">
                    <ThemeSwitcher />
                </div>
            </div>

            <aside className={`relative flex-shrink-0 transform transition-all duration-300 ease-in-out bg-nexus-gray-light-200/80 dark:bg-nexus-gray-800/80 border-r border-nexus-gray-light-300 dark:border-nexus-gray-700 flex flex-col overflow-hidden ${activePanel !== 'none' ? 'w-80 p-4' : 'w-0 p-0 border-r-0'}`}>
                {renderPanelContent()}
            </aside>
            
            <main className="relative flex-1 flex flex-col h-full overflow-hidden">
                {selectedChat?.uiSettings?.bannerImage && (
                    <div className="w-full h-32 md:h-48 flex-shrink-0 bg-black/20">
                        <img src={selectedChat.uiSettings.bannerImage} className="w-full h-full object-cover" alt="Banner"/>
                    </div>
                )}
                <div className="flex-1 min-h-0">
                    {renderMainContent()}
                </div>
            </main>
        </div>
    );
};