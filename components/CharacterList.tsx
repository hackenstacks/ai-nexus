
import React from 'react';
import { Character } from '../types';
import { PlusIcon } from './icons/PlusIcon';
import { TrashIcon } from './icons/TrashIcon';
import { EditIcon } from './icons/EditIcon';

interface CharacterListProps {
  characters: Character[];
  selectedCharacterId?: string;
  onSelectCharacter: (character: Character) => void;
  onDeleteCharacter: (id: string) => void;
  onEditCharacter: (character: Character) => void;
  onAddNew: () => void;
}

export const CharacterList: React.FC<CharacterListProps> = ({
  characters,
  selectedCharacterId,
  onSelectCharacter,
  onDeleteCharacter,
  onEditCharacter,
  onAddNew
}) => {
  return (
    <div className="flex-1 flex flex-col overflow-y-auto pr-2">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-white">Characters</h2>
        <button
          onClick={onAddNew}
          className="p-2 rounded-md text-nexus-gray-400 hover:bg-nexus-gray-700 hover:text-white transition-colors"
          title="Add New Character"
        >
          <PlusIcon className="w-5 h-5" />
        </button>
      </div>
      <div className="space-y-2">
        {characters.length === 0 ? (
           <p className="text-nexus-gray-400 text-sm text-center py-4">No characters yet. Click '+' to create one.</p>
        ) : (
          characters.map((char) => (
            <div
              key={char.id}
              className={`group flex items-center p-3 rounded-lg cursor-pointer transition-colors ${
                selectedCharacterId === char.id
                  ? 'bg-nexus-blue-600 text-white'
                  : 'bg-nexus-gray-900 hover:bg-nexus-gray-700'
              }`}
            >
              <div className="flex-1 flex items-center min-w-0" onClick={() => onSelectCharacter(char)}>
                <img
                  src={char.avatarUrl || `https://picsum.photos/seed/${char.id}/40/40`}
                  alt={char.name}
                  className="w-10 h-10 rounded-full mr-3 flex-shrink-0"
                />
                <div className="min-w-0">
                  <p className="font-semibold truncate">{char.name}</p>
                  <p className="text-sm text-nexus-gray-400 truncate group-hover:text-nexus-gray-300">{char.description}</p>
                </div>
              </div>
              <div className="ml-2 flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); onEditCharacter(char); }}
                  className="p-1 rounded text-nexus-gray-400 hover:text-white hover:bg-nexus-gray-600"
                  title="Edit Character"
                >
                  <EditIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteCharacter(char.id); }}
                  className="p-1 rounded text-nexus-gray-400 hover:text-red-400 hover:bg-nexus-gray-600"
                  title="Delete Character"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
