import React, { useState, useEffect } from 'react';
import { Plugin } from '../types';
import { PlusIcon } from './icons/PlusIcon';
import { TrashIcon } from './icons/TrashIcon';
import { EditIcon } from './icons/EditIcon';
import { PowerIcon } from './icons/PowerIcon';

interface PluginManagerProps {
  plugins: Plugin[];
  onPluginsUpdate: (plugins: Plugin[]) => void;
}

const examplePluginCode = `// Example Plugin: UPPERCASE every message
// This plugin intercepts every message sent by the user and converts it to uppercase.

// Use nexus.hooks.register to listen for specific events in the application.
// 'beforeMessageSend' is triggered right before a user's message is sent to the AI.
nexus.hooks.register('beforeMessageSend', (payload) => {
  // payload is an object like { content: "some message" }
  // Use nexus.log for safe debugging from the sandbox.
  nexus.log('Plugin transforming message:', payload.content);

  const modifiedContent = payload.content.toUpperCase();

  // The hook must return an object with the same structure as the payload.
  return { content: modifiedContent };
});

nexus.log('UPPERCASE plugin loaded and ready.');
`;

export const PluginManager: React.FC<PluginManagerProps> = ({ plugins, onPluginsUpdate }) => {
  const [editingPlugin, setEditingPlugin] = useState<Plugin | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formState, setFormState] = useState<Omit<Plugin, 'id' | 'enabled'>>({ name: '', description: '', code: '' });

  useEffect(() => {
    if (editingPlugin) {
      setFormState({
        name: editingPlugin.name,
        description: editingPlugin.description,
        code: editingPlugin.code,
      });
      setIsCreating(false);
    } else if (isCreating) {
      setFormState({
        name: '',
        description: '',
        code: examplePluginCode
      });
    }
  }, [editingPlugin, isCreating]);

  const handleSave = () => {
    if (!formState.name.trim()) {
      alert('Plugin name cannot be empty.');
      return;
    }
    
    let updatedPlugins;
    if (editingPlugin) {
      // Editing existing plugin
      updatedPlugins = plugins.map(p => p.id === editingPlugin.id ? { ...editingPlugin, ...formState } : p);
    } else {
      // Creating new plugin
      const newPlugin: Plugin = { ...formState, id: crypto.randomUUID(), enabled: false };
      updatedPlugins = [...plugins, newPlugin];
    }
    onPluginsUpdate(updatedPlugins);
    setEditingPlugin(null);
    setIsCreating(false);
  };
  
  const handleDelete = (pluginId: string) => {
    if (window.confirm('Are you sure you want to delete this plugin?')) {
        const updatedPlugins = plugins.filter(p => p.id !== pluginId);
        onPluginsUpdate(updatedPlugins);
    }
  };

  const handleToggle = (pluginId: string) => {
    const updatedPlugins = plugins.map(p => p.id === pluginId ? { ...p, enabled: !p.enabled } : p);
    onPluginsUpdate(updatedPlugins);
  };
  
  const handleCancel = () => {
    setEditingPlugin(null);
    setIsCreating(false);
  };
  
  if (editingPlugin || isCreating) {
    return (
      <div className="flex-1 flex flex-col p-8 bg-nexus-gray-900 overflow-y-auto">
        <h2 className="text-3xl font-bold text-white mb-6">{editingPlugin ? 'Edit Plugin' : 'Create New Plugin'}</h2>
        <div className="space-y-6">
          <input
            type="text"
            placeholder="Plugin Name"
            value={formState.name}
            onChange={(e) => setFormState(s => ({...s, name: e.target.value}))}
            className="w-full bg-nexus-gray-800 border border-nexus-gray-700 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
          />
          <input
            type="text"
            placeholder="Plugin Description"
            value={formState.description}
            onChange={(e) => setFormState(s => ({...s, description: e.target.value}))}
            className="w-full bg-nexus-gray-800 border border-nexus-gray-700 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500"
          />
          <div className="flex flex-col h-96">
            <label className="block text-sm font-medium text-nexus-gray-300 mb-1">Plugin Code (JavaScript)</label>
            <textarea
              placeholder="Enter your plugin code here..."
              value={formState.code}
              onChange={(e) => setFormState(s => ({...s, code: e.target.value}))}
              className="flex-1 w-full bg-nexus-dark border border-nexus-gray-700 rounded-md py-2 px-3 text-white font-mono text-sm focus:outline-none focus:ring-nexus-blue-500 focus:border-nexus-blue-500 resize-none"
              spellCheck="false"
            />
          </div>
          <div className="flex justify-end space-x-4">
            <button onClick={handleCancel} className="py-2 px-4 rounded-md text-white bg-nexus-gray-600 hover:bg-nexus-gray-500">Cancel</button>
            <button onClick={handleSave} className="py-2 px-4 rounded-md text-white bg-nexus-blue-600 hover:bg-nexus-blue-500">Save Plugin</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-8 bg-nexus-gray-900">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-white">Plugin Manager</h2>
        <button onClick={() => setIsCreating(true)} className="flex items-center space-x-2 py-2 px-4 rounded-md text-white bg-nexus-blue-600 hover:bg-nexus-blue-500">
          <PlusIcon className="w-5 h-5" />
          <span>New Plugin</span>
        </button>
      </div>
      <div className="space-y-4">
        {plugins.length === 0 ? (
          <p className="text-nexus-gray-400 text-center py-8">No plugins installed. Click 'New Plugin' to create one.</p>
        ) : (
          plugins.map(plugin => (
            <div key={plugin.id} className="bg-nexus-gray-800 p-4 rounded-lg flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-lg font-semibold text-white truncate">{plugin.name}</p>
                <p className="text-sm text-nexus-gray-400 truncate">{plugin.description}</p>
              </div>
              <div className="flex items-center space-x-3 ml-4">
                <button onClick={() => handleToggle(plugin.id)} title={plugin.enabled ? 'Disable' : 'Enable'}>
                  <PowerIcon className={`w-6 h-6 ${plugin.enabled ? 'text-nexus-green-500' : 'text-nexus-gray-500 hover:text-white'}`}/>
                </button>
                <button onClick={() => setEditingPlugin(plugin)} title="Edit Plugin" className="text-nexus-gray-400 hover:text-white"><EditIcon className="w-5 h-5" /></button>
                <button onClick={() => handleDelete(plugin.id)} title="Delete Plugin" className="text-nexus-gray-400 hover:text-red-400"><TrashIcon className="w-5 h-5" /></button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
