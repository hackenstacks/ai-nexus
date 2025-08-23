
import React, { useState, useEffect } from 'react';
import { Character } from '../types';

interface CharacterFormProps {
  character: Character | null;
  onSave: (character: Character) => void;
  onCancel: () => void;
}

export const CharacterForm: React.FC<CharacterFormProps> = ({ character, onSave, onCancel }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [personality, setPersonality] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [tags, setTags] = useState('');

  useEffect(() => {
    if (character) {
      setName(character.name);
      setDescription(character.description);
      setPersonality(character.personality);
      setAvatarUrl(character.avatarUrl);
      setTags(character.tags.join(', '));
    } else {
        setName('');
        setDescription('');
        setPersonality('');
        setAvatarUrl('');
        setTags('');
    }
  }, [character]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const newCharacter: Character = {
      id: character?.id || crypto.randomUUID(),
      name,
      description,
      personality,
      avatarUrl,
      tags: tags.split(',').map(tag => tag.trim()).filter(Boolean),
      createdAt: character?.createdAt || new Date().toISOString()
    };
    onSave(newCharacter);
  };
  
  const handleGenerateAvatar = () => {
    const seed = name || crypto.randomUUID();
    setAvatarUrl(`https://picsum.photos/seed/${seed}/200/200`);
  };

  return (
    <div className="flex-1 flex flex-col p-8 bg-nexus-gray-900 overflow-y-auto">
      <h2 className="text-3xl font-bold text-white mb-6">
        {character ? 'Edit Character' : 'Create New Character'}
      </h2>
      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-nexus-gray-300">Name</label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="mt-1 block w-full bg-nexus-gray-800 border border-nexus-gray-700 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
          />
        </div>
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-nexus-gray-300">Description</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="mt-1 block w-full bg-nexus-gray-800 border border-nexus-gray-700 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
            placeholder="A brief description of the character."
          />
        </div>
        <div>
          <label htmlFor="personality" className="block text-sm font-medium text-nexus-gray-300">Personality & System Prompt</label>
          <textarea
            id="personality"
            value={personality}
            onChange={(e) => setPersonality(e.target.value)}
            rows={6}
            className="mt-1 block w-full bg-nexus-gray-800 border border-nexus-gray-700 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
            placeholder="Describe the character's personality, quirks, and conversation style. This will be used as a system prompt."
          />
        </div>
        <div>
          <label htmlFor="avatarUrl" className="block text-sm font-medium text-nexus-gray-300">Avatar URL</label>
          <div className="mt-1 flex rounded-md shadow-sm">
            <input
              id="avatarUrl"
              type="text"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              className="flex-1 block w-full min-w-0 bg-nexus-gray-800 border border-nexus-gray-700 rounded-none rounded-l-md py-2 px-3 text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
              placeholder="https://example.com/avatar.png"
            />
             <button type="button" onClick={handleGenerateAvatar} className="relative -ml-px inline-flex items-center space-x-2 px-4 py-2 border border-nexus-gray-700 text-sm font-medium rounded-r-md text-nexus-gray-300 bg-nexus-gray-700 hover:bg-nexus-gray-600 focus:outline-none focus:ring-1 focus:ring-nexus-blue-500 focus:border-nexus-blue-500">
                <span>Generate</span>
             </button>
          </div>
        </div>
        <div>
          <label htmlFor="tags" className="block text-sm font-medium text-nexus-gray-300">Tags</label>
          <input
            id="tags"
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="mt-1 block w-full bg-nexus-gray-800 border border-nexus-gray-700 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
            placeholder="Comma-separated, e.g., sci-fi, assistant, funny"
          />
        </div>
        <div className="flex justify-end space-x-4">
          <button
            type="button"
            onClick={onCancel}
            className="py-2 px-4 border border-nexus-gray-600 rounded-md shadow-sm text-sm font-medium text-nexus-gray-300 bg-nexus-gray-700 hover:bg-nexus-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-nexus-gray-900 focus:ring-nexus-gray-500"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-nexus-blue-600 hover:bg-nexus-blue-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-nexus-gray-900 focus:ring-nexus-blue-500"
          >
            Save Character
          </button>
        </div>
      </form>
    </div>
  );
};
