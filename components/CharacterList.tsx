import React from 'react';
import { Character } from '../types';
import { PlusIcon } from './icons/PlusIcon';
import { TrashIcon } from './icons/TrashIcon';
import { EditIcon } from './icons/EditIcon';
import { DownloadIcon } from './icons/DownloadIcon';
import { ArchiveBoxIcon } from './icons/ArchiveBoxIcon';
import { RestoreIcon } from './icons/RestoreIcon';

interface CharacterListProps {
  characters: Character[];
  onDeleteCharacter: (id: string) => void;
  onEditCharacter: (character: Character) => void;
  onAddNew: () => void;
  onExportCharacter: (id: string) => void;
  showArchived: boolean;
  onToggleArchiveView: () => void;
  onRestoreCharacter: (id: string) => void;
  onPermanentlyDeleteCharacter: (id: string) => void;
}

export const CharacterList: React.FC<CharacterListProps> = ({
  characters,
  onDeleteCharacter,
  onEditCharacter,
  onAddNew,
  onExportCharacter,
  showArchived,
  onToggleArchiveView,
  onRestoreCharacter,
  onPermanentlyDeleteCharacter
}) => {
  return (
    <div className="flex-1 flex flex-col min-h-0">
       <div className="flex justify-between items-center mb-2 border-t border-nexus-gray-light-300 dark:border-nexus-gray-700 pt-4">
        <h2 className="text-lg font-semibold text-nexus-gray-900 dark:text-white">{showArchived ? 'Archived Characters' : 'Characters'}</h2>
        <button
          onClick={onAddNew}
          className="p-2 rounded-md text-nexus-gray-600 dark:text-nexus-gray-400 hover:bg-nexus-gray-light-300 dark:hover:bg-nexus-gray-700 hover:text-nexus-gray-900 dark:hover:text-white transition-colors"
          title="Add New Character"
        >
          <PlusIcon className="w-5 h-5" />
        </button>
      </div>
       <button 
        onClick={onToggleArchiveView}
        className="w-full flex items-center justify-center space-x-2 mb-2 text-sm py-2 px-3 rounded-md text-nexus-gray-800 dark:text-nexus-gray-300 bg-nexus-gray-light-300 dark:bg-nexus-gray-700 hover:bg-nexus-gray-light-400 dark:hover:bg-nexus-gray-600 transition-colors"
      >
        <ArchiveBoxIcon className="w-5 h-5" />
        <span>{showArchived ? 'View Active Characters' : 'View Archived Characters'}</span>
      </button>

      <div className="space-y-2 overflow-y-auto pr-2">
        {characters.length === 0 ? (
           <p className="text-nexus-gray-600 dark:text-nexus-gray-400 text-sm text-center py-4">
            {showArchived ? 'No archived characters.' : "No characters yet. Click '+' to create one."}
           </p>
        ) : (
          characters.map((char) => (
            <div
              key={char.id}
              className="group flex items-center p-2 rounded-lg bg-nexus-gray-light-100 dark:bg-nexus-gray-900 hover:bg-nexus-gray-light-300 dark:hover:bg-nexus-gray-700"
            >
              <div className="flex-1 flex items-center min-w-0">
                <img
                  src={char.avatarUrl || `https://picsum.photos/seed/${char.id}/40/40`}
                  alt={char.name}
                  className="w-8 h-8 rounded-full mr-3 flex-shrink-0"
                />
                <div className="min-w-0">
                  <p className="font-semibold truncate text-sm">{char.name}</p>
                </div>
              </div>
              <div className="ml-2 flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {showArchived ? (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); onRestoreCharacter(char.id); }}
                      className="p-1 rounded text-nexus-gray-600 dark:text-nexus-gray-400 hover:text-nexus-gray-900 dark:hover:text-white hover:bg-nexus-gray-light-400 dark:hover:bg-nexus-gray-600"
                      title="Restore Character"
                    >
                      <RestoreIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onPermanentlyDeleteCharacter(char.id); }}
                      className="p-1 rounded text-nexus-gray-600 dark:text-nexus-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-nexus-gray-light-400 dark:hover:bg-nexus-gray-600"
                      title="Delete Permanently"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); onExportCharacter(char.id); }}
                      className="p-1 rounded text-nexus-gray-600 dark:text-nexus-gray-400 hover:text-nexus-gray-900 dark:hover:text-white hover:bg-nexus-gray-light-400 dark:hover:bg-nexus-gray-600"
                      title="Export Character"
                    >
                      <DownloadIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onEditCharacter(char); }}
                      className="p-1 rounded text-nexus-gray-600 dark:text-nexus-gray-400 hover:text-nexus-gray-900 dark:hover:text-white hover:bg-nexus-gray-light-400 dark:hover:bg-nexus-gray-600"
                      title="Edit Character"
                    >
                      <EditIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteCharacter(char.id); }}
                      className="p-1 rounded text-nexus-gray-600 dark:text-nexus-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-nexus-gray-light-400 dark:hover:bg-nexus-gray-600"
                      title="Archive Character"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};