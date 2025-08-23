
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Character, ChatSession, Message } from '../types';
import { streamChatResponse } from '../services/geminiService';
import { logger } from '../services/loggingService';
import { ChatBubbleIcon } from './icons/ChatBubbleIcon';
import { ImageIcon } from './icons/ImageIcon';

interface ChatInterfaceProps {
  character: Character;
  chatSession?: ChatSession;
  onSessionUpdate: (session: ChatSession) => void;
  onTriggerHook: <T, R>(hookName: string, data: T) => Promise<R>;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ character, chatSession, onSessionUpdate, onTriggerHook }) => {
  const [session, setSession] = useState<ChatSession>(
    chatSession || {
      id: crypto.randomUUID(),
      characterId: character.id,
      messages: [],
    }
  );
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const clickTimeout = useRef<number | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session.messages, isStreaming]);

  const handleImageGeneration = useCallback(async (type: 'prompt' | 'summary', value: string) => {
    const tempId = crypto.randomUUID(); // Used for finding the message later
    const imageMessage: Message = {
      role: 'model',
      content: '',
      timestamp: new Date().toISOString() + tempId, // Add tempId to ensure uniqueness
      attachment: { type: 'image', status: 'loading', prompt: type === 'prompt' ? value : "Generating from chat context..." }
    };

    const newSessionWithLoading = { ...session, messages: [...session.messages, imageMessage] };
    setSession(newSessionWithLoading);
    
    try {
        logger.log(`Triggering image generation hook`, { type, value });
        const result: { url?: string; error?: string } = await onTriggerHook('generateImage', { type, value });
        
        if (result.url) {
            logger.log("Image generation successful.");
            const finalSession: ChatSession = {
                ...newSessionWithLoading,
                messages: newSessionWithLoading.messages.map(m => m.timestamp === imageMessage.timestamp ? { ...m, attachment: { ...m.attachment!, status: 'done', url: result.url }} : m)
            };
            setSession(finalSession);
            onSessionUpdate(finalSession);
        } else {
            throw new Error(result.error || 'Plugin failed to return an image URL.');
        }

    } catch (error) {
        logger.error("Image generation failed:", error);
        const finalSession: ChatSession = {
            ...newSessionWithLoading,
            messages: newSessionWithLoading.messages.map(m => m.timestamp === imageMessage.timestamp ? { ...m, attachment: { ...m.attachment!, status: 'error' }} : m)
        };
        setSession(finalSession);
        onSessionUpdate(finalSession);
    }

  }, [onTriggerHook, session, onSessionUpdate]);

  const handleImageClick = useCallback(() => {
    const prompt = window.prompt("Enter a prompt for the image:");
    if (prompt) {
      handleImageGeneration('prompt', prompt);
    }
  }, [handleImageGeneration]);

  const handleImageDoubleClick = useCallback(() => {
    const lastMessages = session.messages.slice(-4).map(m => `${m.role}: ${m.content}`).join('\n');
    if (lastMessages.trim().length === 0) {
        alert("Not enough conversation context to generate an image. Please type a message first.");
        return;
    }
    handleImageGeneration('summary', lastMessages);
  }, [session.messages, handleImageGeneration]);
  
  const handleImageButtonClick = useCallback(() => {
    if (clickTimeout.current) {
      // Double click
      clearTimeout(clickTimeout.current);
      clickTimeout.current = null;
      handleImageDoubleClick();
    } else {
      // Single click
      clickTimeout.current = window.setTimeout(() => {
        clickTimeout.current = null;
        handleImageClick();
      }, 300); // 300ms delay to wait for a potential double click
    }
  }, [handleImageClick, handleImageDoubleClick]);

  const handleSendMessage = useCallback(async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isStreaming) return;

    const userMessage: Message = {
      role: 'user',
      content: trimmedInput,
      timestamp: new Date().toISOString(),
    };
    
    // Use a function for setting state to ensure we have the latest messages
    setSession(prevSession => {
        const updatedMessages = [...prevSession.messages, userMessage];
        const updatedSession = { ...prevSession, messages: updatedMessages };
        onSessionUpdate(updatedSession); // Persist user message immediately

        // The streaming logic starts here
        (async () => {
            setIsStreaming(true);
            setInput('');
            
            // Give the model a placeholder to start filling
            const modelPlaceholder: Message = { role: 'model', content: '', timestamp: new Date().toISOString() };
            setSession(currentSession => ({...currentSession, messages: [...currentSession.messages, modelPlaceholder]}));

            let fullResponse = '';
            
            try {
                // Let plugins modify the message before sending
                const processedPayload = await onTriggerHook('beforeMessageSend', { content: trimmedInput });
                const finalUserMessage = { ...userMessage, content: (processedPayload as { content: string }).content || trimmedInput };
                
                await streamChatResponse(
                    character,
                    [...updatedMessages.slice(0, -1), finalUserMessage],
                    (chunk) => {
                        fullResponse += chunk;
                        // Update the last message (the placeholder) in the stream
                        setSession(currentSession => ({
                            ...currentSession,
                            messages: currentSession.messages.map((msg, index) =>
                                index === currentSession.messages.length - 1
                                    ? { ...msg, content: fullResponse }
                                    : msg
                            ),
                        }));
                    }
                );
            } catch (error) {
                 logger.error("Streaming failed:", error);
                 setSession(currentSession => ({
                    ...currentSession,
                    messages: currentSession.messages.map((msg, index) =>
                        index === currentSession.messages.length - 1
                            ? { ...msg, content: "Sorry, an error occurred while responding." }
                            : msg
                    ),
                }));
            } finally {
                setIsStreaming(false);
                // Final persistence after stream is complete
                setSession(currentSession => {
                    onSessionUpdate(currentSession);
                    return currentSession;
                });
            }
        })();
        
        return updatedSession;
    });

  }, [input, isStreaming, character, onSessionUpdate, onTriggerHook]);

  const renderMessageContent = (message: Message) => {
    if (message.attachment?.type === 'image') {
        const { status, url, prompt } = message.attachment;
        if (status === 'loading') {
            return (
                <div className="p-4 bg-nexus-gray-700 rounded-lg animate-pulse">
                    <p className="text-sm text-nexus-gray-300">Generating image...</p>
                    <p className="text-xs text-nexus-gray-400 truncate">Prompt: {prompt}</p>
                </div>
            );
        }
        if (status === 'done' && url) {
            return <img src={url} alt={prompt} className="rounded-lg max-w-sm" />;
        }
        if (status === 'error') {
            return <p className="text-red-400">Failed to generate image. Check logs for details.</p>;
        }
    }
    // Render text with line breaks
    return message.content.split('\n').map((line, index) => (
        <React.Fragment key={index}>
            {line}
            <br />
        </React.Fragment>
    ));
  };

  return (
    <div className="flex flex-col h-full bg-nexus-gray-900">
      <header className="flex items-center p-4 border-b border-nexus-gray-700">
        <img src={character.avatarUrl || `https://picsum.photos/seed/${character.id}/40/40`} alt={character.name} className="w-10 h-10 rounded-full mr-4"/>
        <div>
          <h2 className="text-xl font-bold text-white">{character.name}</h2>
          <p className="text-sm text-nexus-gray-400">{character.description}</p>
        </div>
      </header>

      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {session.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-nexus-gray-500">
            <ChatBubbleIcon className="w-16 h-16 mb-4" />
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          session.messages.map((msg, index) => (
            <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'model' && (
                <img src={character.avatarUrl || `https://picsum.photos/seed/${character.id}/40/40`} alt="model avatar" className="w-8 h-8 rounded-full flex-shrink-0" />
              )}
              <div className={`max-w-xl p-3 rounded-lg ${
                  msg.role === 'user'
                    ? 'bg-nexus-blue-600 text-white'
                    : 'bg-nexus-gray-800 text-nexus-gray-200'
                }`}>
                {renderMessageContent(msg)}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-nexus-gray-700">
        <div className="flex items-center bg-nexus-gray-800 rounded-lg p-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
            placeholder={`Message ${character.name}...`}
            className="flex-1 bg-transparent resize-none focus:outline-none px-2 text-white"
            rows={1}
            disabled={isStreaming}
          />
          <button onClick={handleImageButtonClick} title="Generate Image (single-click for prompt, double-click for context)" className="p-2 text-nexus-gray-400 hover:text-white disabled:opacity-50" disabled={isStreaming}>
            <ImageIcon className="w-6 h-6" />
          </button>
          <button onClick={handleSendMessage} disabled={!input.trim() || isStreaming} className="p-2 text-nexus-gray-400 hover:text-white disabled:opacity-50">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
};
