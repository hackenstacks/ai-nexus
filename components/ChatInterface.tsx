import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Character, ChatSession, Message, CryptoKeys } from '../types';
import { streamChatResponse, streamGenericResponse, generateContent } from '../services/geminiService';
import * as cryptoService from '../services/cryptoService';
import { logger } from '../services/loggingService';
import { ChatBubbleIcon } from './icons/ChatBubbleIcon';
import { ImageIcon } from './icons/ImageIcon';
import { BookIcon } from './icons/BookIcon';
import { BrainIcon } from './icons/BrainIcon';
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
  const [verifiedSignatures, setVerifiedSignatures] = useState<Record<string, boolean>>({});
  const nextSpeakerIndex = useRef(0);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const clickTimeout = useRef<number | null>(null);
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
    }
  }, []);

  const addMessage = useCallback((message: Message) => {
    setCurrentSession(prevSession => {
      const updatedSession = { ...prevSession, messages: [...prevSession.messages, message] };
      onSessionUpdate(updatedSession);
      return updatedSession;
    });
  }, [onSessionUpdate]);

  const addSystemMessage = useCallback((content: string) => {
    const systemMessage: Message = {
      role: 'narrator',
      content,
      timestamp: new Date().toISOString()
    };
    addMessage(systemMessage);
  }, [addMessage]);
  
  const triggerAIResponse = useCallback(async (character: Character, history: Message[]) => {
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
            }
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

        setCurrentSession(current => {
            const updatedMessages = current.messages.map(msg =>
                msg.timestamp === modelPlaceholder.timestamp ? finalMessage : msg
            );
            const finalSession = { ...current, messages: updatedMessages };
            onSessionUpdate(finalSession);
            return finalSession;
        });
    }
}, [currentSession, onSessionUpdate, participants]);


  const handleAutoConversationTurn = useCallback(async () => {
    if (autoConverseTimeout.current) clearTimeout(autoConverseTimeout.current);

    if (!isAutoConversing || participants.length < 2) {
      setIsAutoConversing(false);
      return;
    }
    
    const speaker = participants[nextSpeakerIndex.current % participants.length];
    nextSpeakerIndex.current += 1;

    await triggerAIResponse(speaker, currentSession.messages);
    
    if (isAutoConversing) {
       autoConverseTimeout.current = window.setTimeout(handleAutoConversationTurn, 1500);
    }

  }, [isAutoConversing, participants, currentSession.messages, triggerAIResponse]);
  
  const handleSendMessage = useCallback(async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isStreaming) return;

    if (autoConverseTimeout.current) clearTimeout(autoConverseTimeout.current);
    const wasAutoConversing = isAutoConversing;
    setIsAutoConversing(false);
    
    if (trimmedInput.startsWith('/')) {
        const [command, ...args] = trimmedInput.substring(1).split(' ');
        const content = args.join(' ');
        
        if (command === 'converse' && participants.length > 1) {
            setInput('');
            addSystemMessage(`Conversation topic: "${content || 'Anything at all.'}" AIs will now converse with each other. Type /end to stop.`);
            setIsAutoConversing(true);
            autoConverseTimeout.current = window.setTimeout(handleAutoConversationTurn, 500);
            return;
        }
        if (command === 'end') {
            setInput('');
            addSystemMessage('AI conversation ended by user.');
            return;
        }
    }
    
    if (wasAutoConversing) {
        addSystemMessage(`[User Guidance]: ${trimmedInput}`);
        setIsAutoConversing(true);
        autoConverseTimeout.current = window.setTimeout(handleAutoConversationTurn, 500);
        setInput('');
        return;
    }

    let userMessage: Message = { role: 'user', content: trimmedInput, timestamp: new Date().toISOString() };
    
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

    const newHistory = [...currentSession.messages, userMessage];
    addMessage(userMessage);
    setInput('');

    if (participants.length > 0) {
        const respondent = participants[nextSpeakerIndex.current % participants.length];
        nextSpeakerIndex.current += 1;
        await triggerAIResponse(respondent, newHistory);
    }

  }, [input, isStreaming, isAutoConversing, participants, currentSession.messages, addMessage, addSystemMessage, handleAutoConversationTurn, triggerAIResponse, userKeys]);
  
  const renderMessageContent = (message: Message) => {
    return message.content.split('\n').map((line, index) => (
        <React.Fragment key={index}>{line}<br /></React.Fragment>
    ));
  };
  
  const getCharacterById = (id: string) => allCharacters.find(c => c.id === id);

  return (
    <div className="flex flex-col h-full bg-nexus-gray-900">
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
      <header className="flex items-center p-4 border-b border-nexus-gray-700">
        <div className="flex -space-x-4">
            {participants.slice(0, 3).map(p => (
                <img key={p.id} src={p.avatarUrl || `https://picsum.photos/seed/${p.id}/40/40`} alt={p.name} className="w-10 h-10 rounded-full border-2 border-nexus-gray-900"/>
            ))}
        </div>
        <div className="ml-4">
          <h2 className="text-xl font-bold text-white">{session.name}</h2>
          <p className="text-sm text-nexus-gray-400 truncate">{participants.map(p=>p.name).join(', ')}</p>
        </div>
      </header>

      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {currentSession.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-nexus-gray-500">
            <ChatBubbleIcon className="w-16 h-16 mb-4" />
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          currentSession.messages.map((msg, index) => {
            if (msg.role === 'narrator') {
              return (
                <div key={index} className="text-center my-2">
                  <p className="text-sm text-nexus-gray-400 italic px-4">{renderMessageContent(msg)}</p>
                </div>
              );
            }
            const msgCharacter = msg.characterId ? getCharacterById(msg.characterId) : null;
            return (
              <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'model' && msgCharacter && (
                  <img src={msgCharacter.avatarUrl || `https://picsum.photos/seed/${msgCharacter.id}/40/40`} alt={msgCharacter.name} className="w-8 h-8 rounded-full flex-shrink-0" title={msgCharacter.name}/>
                )}
                <div className={`relative max-w-xl p-3 rounded-lg ${
                    msg.role === 'user'
                      ? 'bg-nexus-blue-600 text-white'
                      : 'bg-nexus-gray-800 text-nexus-gray-200'
                  }`}>
                  {msg.role === 'model' && msgCharacter && <p className="font-bold text-sm mb-1">{msgCharacter.name}</p>}
                  {renderMessageContent(msg)}
                  {msg.signature && (
                    <div className="absolute -bottom-2 -right-2 bg-nexus-gray-800 rounded-full p-0.5">
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

      <div className="p-4 border-t border-nexus-gray-700">
        <div className="flex items-center bg-nexus-gray-800 rounded-lg p-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
            placeholder={isAutoConversing ? "Guide the conversation... (or type /end)" : `Message ${session.name}... (/converse)`}
            className="flex-1 bg-transparent resize-none focus:outline-none px-2 text-white"
            rows={1}
            disabled={isStreaming && !isAutoConversing}
          />
          <button onClick={() => setIsMemoryModalVisible(true)} title="Import Memory From Another Chat" className="p-2 text-nexus-gray-400 hover:text-white disabled:opacity-50" disabled={isStreaming}>
            <BrainIcon className="w-6 h-6" />
          </button>
          <button title="Narrate" className="p-2 text-nexus-gray-400 hover:text-white disabled:opacity-50" disabled={isStreaming}>
            <BookIcon className="w-6 h-6" />
          </button>
          <button title="Generate Image" className="p-2 text-nexus-gray-400 hover:text-white disabled:opacity-50" disabled={isStreaming}>
            <ImageIcon className="w-6 h-6" />
          </button>
          <button onClick={handleSendMessage} disabled={!input.trim() || (isStreaming && !isAutoConversing)} className="p-2 text-nexus-gray-400 hover:text-white disabled:opacity-50" title="Send message">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
};
