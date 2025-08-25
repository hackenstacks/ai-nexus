import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Character, ChatSession, Message, CryptoKeys } from '../types';
import { streamChatResponse, streamGenericResponse, generateContent } from '../services/geminiService';
import * as cryptoService from '../services/cryptoService';
import * as ttsService from '../services/ttsService';
import { logger } from '../services/loggingService';
import { ChatBubbleIcon } from './icons/ChatBubbleIcon';
import { ImageIcon } from './icons/ImageIcon';
import { BookIcon } from './icons/BookIcon';
import { BrainIcon } from './icons/BrainIcon';
import { SpeakerIcon } from './icons/SpeakerIcon';
import { MemoryImportModal } from './MemoryImportModal';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import { ExclamationTriangleIcon } from './icons/ExclamationTriangleIcon';

interface ChatInterfaceProps {
  session: ChatSession;
  allCharacters: Character[];
  allChatSessions: ChatSession[];
  userKeys?: CryptoKeys;
  onSessionUpdate: (session: ChatSession) => void;
  onCharacterUpdate: (character: Character) => void;
  onTriggerHook: <T, R>(hookName: string, data: T) => Promise<R>;
  onMemoryImport: (fromSessionId: string, toSessionId: string) => void;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
    session, 
    allCharacters, 
    allChatSessions,
    userKeys, 
    onSessionUpdate, 
    onCharacterUpdate, 
    onTriggerHook,
    onMemoryImport
}) => {
  const [currentSession, setCurrentSession] = useState<ChatSession>(session);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isAutoConversing, setIsAutoConversing] = useState(false);
  const [isMemoryModalVisible, setIsMemoryModalVisible] = useState(false);
  const [isTtsEnabled, setIsTtsEnabled] = useState(false);
  const [verifiedSignatures, setVerifiedSignatures] = useState<Record<string, boolean>>({});

  const nextSpeakerIndex = useRef(0);
  const systemOverride = useRef<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const imageClickTimeout = useRef<number | null>(null);
  const narratorClickTimeout = useRef<number | null>(null);
  const autoConverseTimeout = useRef<number | null>(null);

  const participants = useMemo(() => {
    return allCharacters.filter(c => currentSession.characterIds.includes(c.id));
  }, [allCharacters, currentSession.characterIds]);

  useEffect(() => {
    setCurrentSession(session);
  }, [session]);
  
  useEffect(() => {
    const verifyAllMessages = async () => {
        const verificationResults: Record<string, boolean> = {};
        for (const msg of currentSession.messages) {
            if (msg.signature && msg.publicKeyJwk) {
                try {
                    const publicKey = await cryptoService.importKey(msg.publicKeyJwk, 'verify');
                    const dataToVerify: Partial<Message> = { ...msg };
                    delete dataToVerify.signature;
                    delete dataToVerify.publicKeyJwk;
                    const canonicalString = cryptoService.createCanonicalString(dataToVerify);
                    verificationResults[msg.timestamp] = await cryptoService.verify(canonicalString, msg.signature, publicKey);
                } catch (e) {
                    logger.error("Message verification failed during check", e);
                    verificationResults[msg.timestamp] = false;
                }
            }
        }
        setVerifiedSignatures(verificationResults);
    };
    verifyAllMessages();
  }, [currentSession.messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentSession.messages, isStreaming]);
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (autoConverseTimeout.current) clearTimeout(autoConverseTimeout.current);
      ttsService.cancel(); // Stop any speech on component unmount
    }
  }, []);

  const addMessage = useCallback((message: Message) => {
    setCurrentSession(prevSession => {
      const updatedSession = { ...prevSession, messages: [...prevSession.messages, message] };
      onSessionUpdate(updatedSession);
      return updatedSession;
    });
  }, [onSessionUpdate]);

  const addSystemMessage = useCallback((content: string, role: 'narrator' | 'system' = 'narrator') => {
    const systemMessage: Message = {
      role: 'narrator',
      content,
      timestamp: new Date().toISOString()
    };
    addMessage(systemMessage);
  }, [addMessage]);
  
  const triggerAIResponse = useCallback(async (character: Character, history: Message[], override?: string) => {
    setIsStreaming(true);
    const modelPlaceholder: Message = {
        role: 'model',
        content: '',
        timestamp: new Date().toISOString(),
        characterId: character.id
    };
    
    const updatedMessages = [...history, modelPlaceholder];
    const sessionWithPlaceholder = { ...currentSession, messages: updatedMessages };
    setCurrentSession(sessionWithPlaceholder);
    onSessionUpdate(sessionWithPlaceholder);

    let fullResponse = '';
    
    try {
        await streamChatResponse(
            character,
            participants,
            history,
            (chunk) => {
                fullResponse += chunk;
                setCurrentSession(current => ({
                    ...current,
                    messages: current.messages.map(msg => msg.timestamp === modelPlaceholder.timestamp ? { ...msg, content: fullResponse } : msg),
                }));
            },
            override
        );
    } catch (error) {
        logger.error("Streaming failed:", error);
        fullResponse = "Sorry, an error occurred while responding.";
    } finally {
        setIsStreaming(false);

        let finalMessage: Message = { ...modelPlaceholder, content: fullResponse };
        
        if (character.keys) {
            try {
                const privateKey = await cryptoService.importKey(character.keys.privateKey, 'sign');
                finalMessage.publicKeyJwk = character.keys.publicKey;
                const dataToSign: Partial<Message> = { ...finalMessage };
                delete dataToSign.signature;
                delete dataToSign.publicKeyJwk;
                const canonicalString = cryptoService.createCanonicalString(dataToSign);
                finalMessage.signature = await cryptoService.sign(canonicalString, privateKey);
            } catch (e) {
                logger.error(`Failed to sign message for character ${character.name}`, e);
            }
        }
        
        if (isTtsEnabled) {
            ttsService.speak(fullResponse, character.voiceURI);
        }

        setCurrentSession(current => {
            const updatedMessages = current.messages.map(msg =>
                msg.timestamp === modelPlaceholder.timestamp ? finalMessage : msg
            );
            const finalSession = { ...current, messages: updatedMessages };
            onSessionUpdate(finalSession);
            return finalSession;
        });
    }
}, [currentSession, onSessionUpdate, participants, isTtsEnabled]);

  const handleCommand = async (command: string, args: string) => {
    setInput('');
    switch (command) {
        case 'image': {
            handleImageGeneration(args, 'direct');
            break;
        }
        case 'narrate': {
            handleNarration(args, 'direct');
            break;
        }
        case 'save': {
            const history = currentSession.messages.slice(-10);
            if (history.length === 0) {
                addSystemMessage("Not enough conversation history to save a memory.");
                return;
            }
            addSystemMessage("Generating memory snapshot...");
            const context = history.map(m => `${m.role === 'model' ? allCharacters.find(c => c.id === m.characterId)?.name || 'AI' : 'User'}: ${m.content}`).join('\n');
            const prompt = `Summarize the key events, information, and character developments from this recent conversation snippet into a concise paragraph for a character's long-term memory. Focus on facts and relationship changes. Conversation:\n\n${context}`;
            
            try {
                const summary = await generateContent(prompt);
                participants.forEach(p => {
                    const updatedMemory = `${p.memory || ''}\n\n[Memory from ${new Date().toLocaleString()}]\n${summary}`;
                    onCharacterUpdate({...p, memory: updatedMemory.trim()});
                });
                addSystemMessage("Memory snapshot saved for all participants.");
            } catch (e) {
                logger.error("Failed to generate memory summary", e);
                addSystemMessage("Failed to generate memory summary. See logs for details.");
            }
            break;
        }
        case 'sys': {
            systemOverride.current = args;
            addSystemMessage(`System override set for next AI response: "${args}"`);
            break;
        }
        case 'character': {
            const [charName, ...promptParts] = args.split(' ');
            const prompt = promptParts.join(' ');
            if (!charName || !prompt) {
                addSystemMessage("Usage: /character <name> <prompt>");
                return;
            }
            const target = participants.find(p => p.name.toLowerCase().startsWith(charName.toLowerCase()));
            if (!target) {
                addSystemMessage(`Character "${charName}" not found in this chat.`);
                return;
            }
            
            const targetIndex = participants.findIndex(p => p.id === target.id);
            nextSpeakerIndex.current = targetIndex;

            const userMessage = await createUserMessage(prompt);
            const newHistory = [...currentSession.messages, userMessage];
            addMessage(userMessage);

            await triggerAIResponse(target, newHistory);
            break;
        }
        case 'converse': {
            if (participants.length > 1) {
                addSystemMessage(`Conversation topic: "${args || 'Anything at all.'}" AIs will now converse with each other. Type /end or /quit to stop.`);
                setIsAutoConversing(true);
                autoConverseTimeout.current = window.setTimeout(handleAutoConversationTurn, 500);
            } else {
                addSystemMessage("You need at least two characters in the chat to start a conversation.");
            }
            break;
        }
        case 'quit':
        case 'end': {
            if (isAutoConversing) {
                if (autoConverseTimeout.current) clearTimeout(autoConverseTimeout.current);
                setIsAutoConversing(false);
                addSystemMessage("AI conversation ended by user.");
            }
            break;
        }
        default:
            addSystemMessage(`Unknown command: /${command}`);
    }
  };
  
  const createUserMessage = async (content: string): Promise<Message> => {
    let userMessage: Message = { role: 'user', content, timestamp: new Date().toISOString() };
    if (userKeys) {
        try {
            const privateKey = await cryptoService.importKey(userKeys.privateKey, 'sign');
            userMessage.publicKeyJwk = userKeys.publicKey;
            const dataToSign: Partial<Message> = { ...userMessage };
            delete dataToSign.signature;
            delete dataToSign.publicKeyJwk;
            const canonicalString = cryptoService.createCanonicalString(dataToSign);
            userMessage.signature = await cryptoService.sign(canonicalString, privateKey);
        } catch(e) {
            logger.error("Failed to sign user message", e);
        }
    }
    return userMessage;
  };

  const handleAutoConversationTurn = useCallback(async () => {
    if (autoConverseTimeout.current) clearTimeout(autoConverseTimeout.current);

    if (!isAutoConversing || participants.length < 2) {
      setIsAutoConversing(false);
      return;
    }
    
    const speaker = participants[nextSpeakerIndex.current % participants.length];
    nextSpeakerIndex.current += 1;

    await triggerAIResponse(speaker, currentSession.messages);
    
    if (isAutoConversing) { // Re-check state as it might have changed
       autoConverseTimeout.current = window.setTimeout(handleAutoConversationTurn, 1500);
    }

  }, [isAutoConversing, participants, currentSession.messages, triggerAIResponse]);
  
  const handleSendMessage = useCallback(async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || (isStreaming && !isAutoConversing)) return;

    if (autoConverseTimeout.current) clearTimeout(autoConverseTimeout.current);
    const wasAutoConversing = isAutoConversing;
    setIsAutoConversing(false);
    
    if (trimmedInput.startsWith('/')) {
        const [command, ...args] = trimmedInput.substring(1).split(' ');
        handleCommand(command, args.join(' '));
        return;
    }
    
    if (wasAutoConversing) {
        addSystemMessage(`[User Guidance]: ${trimmedInput}`);
        setIsAutoConversing(true);
        autoConverseTimeout.current = window.setTimeout(handleAutoConversationTurn, 500);
        setInput('');
        return;
    }

    const userMessage = await createUserMessage(trimmedInput);
    const newHistory = [...currentSession.messages, userMessage];
    addMessage(userMessage);
    setInput('');

    if (participants.length > 0) {
        const respondent = participants[nextSpeakerIndex.current % participants.length];
        nextSpeakerIndex.current += 1;
        await triggerAIResponse(respondent, newHistory, systemOverride.current || undefined);
        if (systemOverride.current) {
            systemOverride.current = null;
        }
    }

  }, [input, isStreaming, isAutoConversing, participants, currentSession.messages, addMessage, addSystemMessage, handleAutoConversationTurn, triggerAIResponse, userKeys, handleCommand]);
  
  const handleImageGeneration = async (prompt: string, type: 'direct' | 'summary') => {
      const attachmentMessage: Message = {
          role: 'narrator',
          content: `Generating image for prompt: "${type === 'summary' ? 'Summarizing context...' : prompt}"`,
          timestamp: new Date().toISOString(),
          attachment: { type: 'image', status: 'loading', prompt }
      };
      addMessage(attachmentMessage);
      
      try {
        const payload = type === 'summary'
            ? { type: 'summary', value: prompt } // here prompt is the context
            : { type: 'direct', value: prompt };
            
        const result = await onTriggerHook<{type: string, value: string}, {url?: string, error?: string}>('generateImage', payload);

        if (result.url) {
            setCurrentSession(curr => {
                const updatedMessages = curr.messages.map((m): Message => m.timestamp === attachmentMessage.timestamp 
                    ? { ...m, content: '', attachment: { ...m.attachment!, status: 'done', url: result.url } }
                    : m
                );
                const updatedSession = { ...curr, messages: updatedMessages };
                onSessionUpdate(updatedSession);
                return updatedSession;
            });
        } else {
            throw new Error(result.error || 'Image generation failed with no message.');
        }
      } catch (error) {
           const errorMessage = error instanceof Error ? error.message : String(error);
           logger.error('Image generation failed:', error);
           setCurrentSession(curr => {
                const updatedMessages = curr.messages.map((m): Message => m.timestamp === attachmentMessage.timestamp 
                    ? { ...m, content: `Image generation failed: ${errorMessage}`, attachment: { ...m.attachment!, status: 'error' } }
                    : m
                );
                const updatedSession = { ...curr, messages: updatedMessages };
                onSessionUpdate(updatedSession);
                return updatedSession;
            });
      }
  };
  
  const handleNarration = async (prompt: string, type: 'direct' | 'summary') => {
    let finalPrompt = prompt;
    if (type === 'summary') {
        const summaryPrompt = `Based on the following conversation, create a short, descriptive narration of the current scene or situation. Be creative and concise. Conversation:\n\n${prompt}`;
        try {
            finalPrompt = await generateContent(summaryPrompt);
        } catch(e) {
            addSystemMessage("Failed to summarize context for narration.");
            return;
        }
    }
    
    const narratorPlaceholder: Message = { role: 'narrator', content: '', timestamp: new Date().toISOString() };
    addMessage(narratorPlaceholder);
    
    let fullResponse = '';
    await streamGenericResponse(
        "You are a neutral, third-person narrator for a story. Describe the scene or events based on the user's request.",
        finalPrompt,
        (chunk) => {
            fullResponse += chunk;
            setCurrentSession(curr => ({
                ...curr,
                messages: curr.messages.map(m => m.timestamp === narratorPlaceholder.timestamp ? {...m, content: fullResponse} : m)
            }));
        }
    );
     setCurrentSession(curr => {
        const finalMessages = curr.messages.map(m => m.timestamp === narratorPlaceholder.timestamp ? {...m, content: fullResponse} : m);
        onSessionUpdate({ ...curr, messages: finalMessages });
        return { ...curr, messages: finalMessages };
    });
  };

  const handleImageButtonClick = () => {
    if (imageClickTimeout.current) { // Double click
      clearTimeout(imageClickTimeout.current);
      imageClickTimeout.current = null;
      const context = currentSession.messages.slice(-5).map(m => `${m.role}: ${m.content}`).join('\n');
      handleImageGeneration(context, 'summary');
    } else { // Single click
      imageClickTimeout.current = window.setTimeout(() => {
        const prompt = window.prompt("Enter a prompt for the image:");
        if (prompt) handleImageGeneration(prompt, 'direct');
        imageClickTimeout.current = null;
      }, 250);
    }
  };

  const handleNarratorButtonClick = () => {
    if (narratorClickTimeout.current) { // Double click
      clearTimeout(narratorClickTimeout.current);
      narratorClickTimeout.current = null;
      const context = currentSession.messages.slice(-5).map(m => `${m.role}: ${m.content}`).join('\n');
      handleNarration(context, 'summary');
    } else { // Single click
      narratorClickTimeout.current = window.setTimeout(() => {
        const prompt = window.prompt("Enter a narration instruction (e.g., 'Describe the weather changing'):");
        if (prompt) handleNarration(prompt, 'direct');
        narratorClickTimeout.current = null;
      }, 250);
    }
  };
  
  const renderMessageContent = (message: Message) => {
    if (message.attachment?.type === 'image') {
        switch(message.attachment.status) {
            case 'loading': return <div className="p-4 text-center">Generating image...</div>;
            case 'done': return <img src={message.attachment.url} alt={message.attachment.prompt || 'Generated Image'} className="rounded-lg max-w-sm" />;
            case 'error': return null; // Error message is rendered in the main content
        }
    }
    return message.content.split('\n').map((line, index) => (
        <React.Fragment key={index}>{line}<br /></React.Fragment>
    ));
  };
  
  const getCharacterById = (id: string) => allCharacters.find(c => c.id === id);

  return (
    <div className="flex flex-col h-full bg-nexus-gray-light-200 dark:bg-nexus-gray-900">
      {isMemoryModalVisible && (
        <MemoryImportModal 
            allSessions={allChatSessions}
            currentSessionId={currentSession.id}
            onClose={() => setIsMemoryModalVisible(false)}
            onImport={(fromSessionId) => {
                onMemoryImport(fromSessionId, currentSession.id);
                setIsMemoryModalVisible(false);
            }}
        />
      )}
      <header className="flex items-center p-4 border-b border-nexus-gray-light-300 dark:border-nexus-gray-700">
        <div className="flex -space-x-4">
            {participants.slice(0, 3).map(p => (
                <img key={p.id} src={p.avatarUrl || `https://picsum.photos/seed/${p.id}/40/40`} alt={p.name} className="w-10 h-10 rounded-full border-2 border-nexus-gray-light-200 dark:border-nexus-gray-900"/>
            ))}
        </div>
        <div className="ml-4 flex-1 min-w-0">
          <h2 className="text-xl font-bold text-nexus-gray-900 dark:text-white truncate">{session.name}</h2>
          <p className="text-sm text-nexus-gray-700 dark:text-nexus-gray-400 truncate">{participants.map(p=>p.name).join(', ')}</p>
        </div>
        <div className="ml-4">
            <button 
                onClick={() => setIsTtsEnabled(!isTtsEnabled)} 
                title={isTtsEnabled ? "Disable Auto-TTS" : "Enable Auto-TTS for AI Responses"} 
                className={`p-2 rounded-full transition-colors ${isTtsEnabled ? 'bg-nexus-blue-600 text-white' : 'text-nexus-gray-600 dark:text-nexus-gray-400 hover:bg-nexus-gray-light-300 dark:hover:bg-nexus-gray-700'}`}
            >
                <SpeakerIcon className="w-5 h-5" />
            </button>
        </div>
      </header>

      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {currentSession.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-nexus-gray-700 dark:text-nexus-gray-500">
            <ChatBubbleIcon className="w-16 h-16 mb-4" />
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          currentSession.messages.map((msg, index) => {
            if (msg.role === 'narrator') {
              return (
                <div key={index} className="text-center my-2 group relative">
                  <p className="text-sm text-nexus-gray-700 dark:text-nexus-gray-400 italic px-4">{renderMessageContent(msg)}</p>
                  <div className="absolute top-1/2 -translate-y-1/2 right-0 flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                     <button onClick={() => ttsService.speak(msg.content)} title="Read Aloud" className="p-1 rounded-full text-nexus-gray-600 dark:text-nexus-gray-400 hover:bg-nexus-gray-light-400 dark:hover:bg-nexus-gray-600">
                        <SpeakerIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            }
            const msgCharacter = msg.characterId ? getCharacterById(msg.characterId) : null;
            const isUser = msg.role === 'user';
            const characterVoiceURI = msg.role === 'model' && msgCharacter ? msgCharacter.voiceURI : undefined;
            return (
              <div key={index} className={`flex items-start gap-3 group ${isUser ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'model' && msgCharacter && (
                  <img src={msgCharacter.avatarUrl || `https://picsum.photos/seed/${msgCharacter.id}/40/40`} alt={msgCharacter.name} className="w-8 h-8 rounded-full flex-shrink-0" title={msgCharacter.name}/>
                )}
                <div className={`relative max-w-xl p-3 rounded-lg ${
                    isUser
                      ? 'bg-nexus-blue-600 text-white'
                      : 'bg-nexus-gray-light-100 dark:bg-nexus-gray-800 text-nexus-gray-900 dark:text-nexus-gray-200'
                  }`}>
                  <div className="absolute top-0 -translate-y-1/2 flex items-center opacity-0 group-hover:opacity-100 transition-opacity" style={isUser ? {left: '-2rem'} : {right: '-2rem'}}>
                     <button onClick={() => ttsService.speak(msg.content, characterVoiceURI)} title="Read Aloud" className="p-1 rounded-full text-nexus-gray-600 dark:text-nexus-gray-400 bg-nexus-gray-light-300 dark:bg-nexus-gray-700 hover:bg-nexus-gray-light-400 dark:hover:bg-nexus-gray-600">
                        <SpeakerIcon className="w-4 h-4" />
                    </button>
                  </div>
                  {msg.role === 'model' && msgCharacter && <p className="font-bold text-sm mb-1">{msgCharacter.name}</p>}
                  {renderMessageContent(msg)}
                  {msg.signature && (
                    <div className="absolute -bottom-2 -right-2 bg-nexus-gray-light-200 dark:bg-nexus-gray-800 rounded-full p-0.5">
                        {verifiedSignatures[msg.timestamp] === true && <CheckCircleIcon className="w-4 h-4 text-green-400" title="Signature Verified" />}
                        {verifiedSignatures[msg.timestamp] === false && <ExclamationTriangleIcon className="w-4 h-4 text-yellow-400" title="Signature Invalid" />}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-nexus-gray-light-300 dark:border-nexus-gray-700">
        <div className="flex items-center bg-nexus-gray-light-100 dark:bg-nexus-gray-800 rounded-lg p-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
            placeholder={isAutoConversing ? "Guide the conversation... (or type /end)" : `Message ${session.name}... (/help)`}
            className="flex-1 bg-transparent resize-none focus:outline-none px-2 text-nexus-gray-900 dark:text-white"
            rows={1}
            disabled={isStreaming && !isAutoConversing}
          />
          <button onClick={() => setIsMemoryModalVisible(true)} title="Import Memory From Another Chat" className="p-2 text-nexus-gray-600 dark:text-nexus-gray-400 hover:text-nexus-gray-900 dark:hover:text-white disabled:opacity-50" disabled={isStreaming}>
            <BrainIcon className="w-6 h-6" />
          </button>
          <button onClick={handleNarratorButtonClick} title="Narrate (Single-click for prompt, double-click for auto)" className="p-2 text-nexus-gray-600 dark:text-nexus-gray-400 hover:text-nexus-gray-900 dark:hover:text-white disabled:opacity-50" disabled={isStreaming}>
            <BookIcon className="w-6 h-6" />
          </button>
          <button onClick={handleImageButtonClick} title="Generate Image (Single-click for prompt, double-click for auto)" className="p-2 text-nexus-gray-600 dark:text-nexus-gray-400 hover:text-nexus-gray-900 dark:hover:text-white disabled:opacity-50" disabled={isStreaming}>
            <ImageIcon className="w-6 h-6" />
          </button>
          <button onClick={handleSendMessage} disabled={!input.trim() || (isStreaming && !isAutoConversing)} className="p-2 text-nexus-gray-600 dark:text-nexus-gray-400 hover:text-nexus-gray-900 dark:hover:text-white disabled:opacity-50" title="Send message">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
};