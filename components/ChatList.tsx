import React from 'react';
import { ChatSession, Character } from '../types';
import { TrashIcon } from './icons/TrashIcon';
import { UsersIcon } from './icons/UsersIcon';
import { DownloadIcon } from './icons/DownloadIcon';

interface ChatListProps {
  chatSessions: ChatSession[];
  characters: Character[];
  selectedChatId?: string | null;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onExportChat: (id: string) => void;
}

export const ChatList: React.FC<ChatListProps> = ({
  chatSessions,
  characters,
  selectedChatId,
  onSelectChat,
  onDeleteChat,
  onExportChat,
}) => {
  const getCharacter = (id: string) => characters.find(c => c.id === id);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto pr-2">
      <div className="space-y-2">
        {chatSessions.length === 0 ? (
          <p className="text-nexus-gray-400 text-sm text-center py-4">
            No chats yet. Click '+' to start a new conversation.
          </p>
        ) : (
          chatSessions.map((session) => {
            const participants = session.characterIds.map(getCharacter).filter(Boolean) as Character[];
            
            return (
              <div
                key={session.id}
                onClick={() => onSelectChat(session.id)}
                className={`group flex items-center p-3 rounded-lg cursor-pointer transition-colors ${
                  selectedChatId === session.id
                    ? 'bg-nexus-blue-600 text-white'
                    : 'bg-nexus-gray-900 hover:bg-nexus-gray-700'
                }`}
              >
                <div className="flex-shrink-0 mr-3">
                  {participants.length === 1 ? (
                    <img
                      src={participants[0].avatarUrl || `https://picsum.photos/seed/${participants[0].id}/40/40`}
                      alt={participants[0].name}
                      className="w-10 h-10 rounded-full"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-nexus-gray-700 flex items-center justify-center">
                        <UsersIcon className="w-6 h-6 text-nexus-gray-300" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{session.name}</p>
                  <p className="text-sm text-nexus-gray-400 truncate group-hover:text-nexus-gray-300">
                    {participants.length > 0 ? participants.map(p => p.name).join(', ') : 'Empty Chat'}
                  </p>
                </div>
                 <div className="ml-2 flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={(e) => { e.stopPropagation(); onExportChat(session.id); }}
                        className="p-1 rounded text-nexus-gray-400 hover:text-white hover:bg-nexus-gray-600"
                        title="Export Chat"
                    >
                        <DownloadIcon className="w-4 h-4" />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onDeleteChat(session.id); }}
                        className="p-1 rounded text-nexus-gray-400 hover:text-red-400 hover:bg-nexus-gray-600"
                        title="Delete Chat"
                    >
                        <TrashIcon className="w-4 h-4" />
                    </button>
                 </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
