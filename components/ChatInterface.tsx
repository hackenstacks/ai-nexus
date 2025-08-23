import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Character, ChatSession, Message } from '../types';
import { streamChatResponse } from '../services/geminiService';
import { ChatBubbleIcon } from './icons/ChatBubbleIcon';

interface ChatInterfaceProps {
  character: Character;
  chatSession?: ChatSession;
  onSessionUpdate: (session: ChatSession) => void;
  onTriggerHook: <T>(hookName: string, data: T) => Promise<T>;
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session.messages]);

  const handleSendMessage = useCallback(async () => {
    if (!input.trim() || isStreaming) return;

    // --- Plugin Hook: beforeMessageSend ---
    // Plugins can modify the message content before it's processed.
    const processedInput = await onTriggerHook('beforeMessageSend', { content: input });

    const userMessage: Message = {
      role: 'user',
      content: processedInput.content,
      timestamp: new Date().toISOString(),
    };

    const updatedHistoryForAPI = [...session.messages, userMessage];

    const modelMessagePlaceholder: Message = {
      role: 'model',
      content: '',
      timestamp: new Date().toISOString(),
    };
    
    setSession(prev => ({...prev, messages: [...prev.messages, userMessage, modelMessagePlaceholder]}));
    setInput('');
    setIsStreaming(true);

    let fullResponse = '';
    
    await streamChatResponse(character, updatedHistoryForAPI, (chunk) => {
        fullResponse += chunk;
        setSession(prev => {
            const updatedMessages = [...prev.messages];
            const lastMsgIndex = updatedMessages.length - 1;
            
            if(lastMsgIndex >= 0 && prev.messages[lastMsgIndex].role === 'model'){
                updatedMessages[lastMsgIndex] = { ...updatedMessages[lastMsgIndex], content: fullResponse };
                return {...prev, messages: updatedMessages};
            }
            return prev;
        });
    });

    setIsStreaming(false);

    // After streaming is complete, get the most recent session state
    // and pass it to the parent for persistence.
    setSession(currentSession => {
        onSessionUpdate(currentSession);
        return currentSession;
    });

  }, [input, isStreaming, character, session.messages, onSessionUpdate, onTriggerHook]);

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-nexus-gray-900">
      <header className="flex items-center p-4 border-b border-nexus-gray-700 bg-nexus-gray-800 shadow-md z-10">
        <img
          src={character.avatarUrl || `https://picsum.photos/seed/${character.id}/40/40`}
          alt={character.name}
          className="w-10 h-10 rounded-full mr-4"
        />
        <div>
          <h2 className="text-xl font-bold text-white">{character.name}</h2>
          <p className="text-sm text-nexus-gray-400">{character.description}</p>
        </div>
      </header>
      
      <div className="flex-1 overflow-y-auto p-6">
        {session.messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-nexus-gray-500">
                <ChatBubbleIcon className="w-16 h-16 mb-4"/>
                <p>No messages yet.</p>
                <p>Start the conversation with {character.name}.</p>
            </div>
        ) : (
            <div className="space-y-6">
                {session.messages.map((message, index) => (
                    <div key={index} className={`flex items-start gap-4 ${message.role === 'user' ? 'justify-end' : ''}`}>
                         {message.role === 'model' && <img src={character.avatarUrl || `https://picsum.photos/seed/${character.id}/40/40`} alt="avatar" className="w-8 h-8 rounded-full" />}
                        <div className={`max-w-xl p-4 rounded-xl ${message.role === 'user' ? 'bg-nexus-blue-600 text-white' : 'bg-nexus-gray-800 text-nexus-gray-200'}`}>
                           <p className="whitespace-pre-wrap">{message.content}{isStreaming && index === session.messages.length - 1 ? '...' : ''}</p>
                        </div>
                    </div>
                ))}
            </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <footer className="p-4 bg-nexus-gray-900 border-t border-nexus-gray-700">
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={`Message ${character.name}...`}
            rows={1}
            className="w-full bg-nexus-gray-800 text-nexus-gray-200 border-nexus-gray-700 rounded-lg p-3 pr-20 resize-none focus:ring-2 focus:ring-nexus-blue-500 focus:outline-none"
            disabled={isStreaming}
          />
          <button
            onClick={handleSendMessage}
            disabled={!input.trim() || isStreaming}
            className="absolute right-3 top-1/2 -translate-y-1/2 px-4 py-2 text-sm font-semibold text-white bg-nexus-blue-600 rounded-md hover:bg-nexus-blue-500 disabled:bg-nexus-gray-600 disabled:cursor-not-allowed"
          >
            {isStreaming ? '...' : 'Send'}
          </button>
        </div>
      </footer>
    </div>
  );
};
