import React, { useState, useMemo } from 'react';
import { Character } from '../types';

interface ChatSelectionModalProps {
  characters: Character[];
  onClose: () => void;
  onCreateChat: (name: string, characterIds: string[]) => void;
}

export const ChatSelectionModal: React.FC<ChatSelectionModalProps> = ({ characters, onClose, onCreateChat }) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [chatName, setChatName] = useState('');

  const handleToggleCharacter = (id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  useMemo(() => {
    const selectedChars = characters.filter(c => selectedIds.has(c.id));
    if (selectedChars.length === 1) {
      setChatName(`Chat with ${selectedChars[0].name}`);
    } else if (selectedChars.length > 1) {
      setChatName(selectedChars.map(c => c.name).join(', '));
    } else {
      setChatName('');
    }
  }, [selectedIds, characters]);

  const handleSubmit = () => {
    if (selectedIds.size === 0) {
      alert('Please select at least one character.');
      return;
    }
    if (!chatName.trim()) {
      alert('Please enter a name for the chat.');
      return;
    }
    onCreateChat(chatName.trim(), Array.from(selectedIds));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-nexus-gray-800 rounded-lg shadow-xl w-full max-w-lg flex flex-col" onClick={e => e.stopPropagation()}>
        <header className="p-4 border-b border-nexus-gray-700 flex justify-between items-center flex-shrink-0">
          <h2 className="text-xl font-bold text-white">Start a New Chat</h2>
          <button onClick={onClose} className="text-nexus-gray-400 hover:text-white transition-colors text-2xl font-bold leading-none p-1">&times;</button>
        </header>
        
        <div className="p-6 space-y-4">
            <div>
                <label htmlFor="chat-name" className="block text-sm font-medium text-nexus-gray-300">Chat Name</label>
                <input
                    id="chat-name"
                    type="text"
                    value={chatName}
                    onChange={(e) => setChatName(e.target.value)}
                    required
                    className="mt-1 block w-full bg-nexus-gray-900 border border-nexus-gray-700 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
                />
            </div>

            <div>
                 <label className="block text-sm font-medium text-nexus-gray-300">Select Characters ({selectedIds.size})</label>
                 <div className="mt-2 max-h-60 overflow-y-auto border border-nexus-gray-700 rounded-md p-2 space-y-2">
                    {characters.length === 0 ? (
                        <p className="text-nexus-gray-400 text-center p-4">No characters found. Please create one first.</p>
                    ) : characters.map(character => (
                        <div key={character.id} onClick={() => handleToggleCharacter(character.id)} className={`flex items-center p-2 rounded-md cursor-pointer transition-colors ${selectedIds.has(character.id) ? 'bg-nexus-blue-600/50' : 'hover:bg-nexus-gray-700'}`}>
                            <input
                                type="checkbox"
                                checked={selectedIds.has(character.id)}
                                readOnly
                                className="h-4 w-4 rounded border-nexus-gray-600 bg-nexus-gray-900 text-nexus-blue-500 focus:ring-nexus-blue-500 pointer-events-none"
                            />
                            <img src={character.avatarUrl || `https://picsum.photos/seed/${character.id}/40/40`} alt={character.name} className="w-8 h-8 rounded-full mx-3"/>
                            <span className="font-medium text-white">{character.name}</span>
                        </div>
                    ))}
                 </div>
            </div>
        </div>

        <footer className="p-4 border-t border-nexus-gray-700 flex justify-end space-x-3">
            <button onClick={onClose} className="py-2 px-4 rounded-md text-white bg-nexus-gray-600 hover:bg-nexus-gray-500">Cancel</button>
            <button onClick={handleSubmit} className="py-2 px-4 rounded-md text-white bg-nexus-blue-600 hover:bg-nexus-blue-500 disabled:opacity-50" disabled={selectedIds.size === 0 || !chatName.trim()}>Create Chat</button>
        </footer>
      </div>
    </div>
  );
};
