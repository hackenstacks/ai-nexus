import React from 'react';

interface HelpModalProps {
  onClose: () => void;
}

const HelpSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="mb-6">
    <h2 className="text-2xl font-bold text-nexus-blue-500 border-b-2 border-nexus-gray-700 pb-2 mb-3">{title}</h2>
    <div className="space-y-3 text-nexus-gray-300">{children}</div>
  </section>
);

const HelpSubSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="mt-4 pl-4 border-l-4 border-nexus-gray-700">
        <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
        <div className="space-y-2 text-nexus-gray-400">{children}</div>
    </div>
);


export const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-nexus-gray-800 rounded-lg shadow-xl w-full max-w-4xl h-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <header className="p-4 border-b border-nexus-gray-700 flex justify-between items-center flex-shrink-0">
          <h2 className="text-xl font-bold text-white">AI Nexus Help Center</h2>
          <button onClick={onClose} className="text-nexus-gray-400 hover:text-white transition-colors text-2xl font-bold leading-none p-1">&times;</button>
        </header>
        <div className="flex-1 p-6 overflow-y-auto">
            
            <HelpSection title="Getting Started">
                <p>Welcome to AI Nexus! This guide will help you understand all the features of the application.</p>
                <HelpSubSection title="The Master Password">
                    <p>On your first visit, AI Nexus prompts you to create a Master Password. This password is crucial as it encrypts all your application data (characters, chats, plugins) before saving it to your browser's local database (IndexedDB).</p>
                    <p className="font-bold text-yellow-400">This is a zero-knowledge system. If you forget your password, there is no way to recover it. Your data will be inaccessible.</p>
                </HelpSubSection>
            </HelpSection>

            <HelpSection title="Managing Characters">
                 <p>Characters are the heart of AI Nexus. You can create, edit, and chat with unique AI personalities.</p>
                <HelpSubSection title="Creating & Editing Characters">
                    <p>Click the `+` icon in the character list to create a new character. The form is divided into sections:</p>
                    <ul className="list-disc list-inside space-y-2">
                        <li><strong>Core Identity:</strong> Basic information like name, avatar, a short description, and searchable tags.</li>
                        <li><strong>Persona & Prompting:</strong> Define the AI's personality. The `Role Instruction / System Prompt` is the most important field, acting as the primary instruction set for the AI.</li>
                        <li><strong>Memory & Lore:</strong> These fields give your character continuity. `Lore` contains key facts that don't change, while `Memory` is an auto-summarized log of important conversation points.</li>
                        <li><strong>API Configuration:</strong> Assign a specific AI model or API key to this character, overriding the default settings. This is useful for connecting to local models like Ollama.</li>
                    </ul>
                </HelpSubSection>
            </HelpSection>
            
            <HelpSection title="The Chat Interface">
                 <p>Select a character from the list to begin a conversation.</p>
                 <HelpSubSection title="Special Commands">
                    <p>You can use slash commands in the chat input to directly interact with your character's data:</p>
                    <ul className="list-disc list-inside">
                        <li><code className="bg-nexus-dark px-1 rounded">/lore [your fact here]</code> - Adds a new line to the character's Lore sheet.</li>
                        <li><code className="bg-nexus-dark px-1 rounded">/memory [your memory here]</code> - Manually adds a new line to the character's Memory.</li>
                    </ul>
                 </HelpSubSection>
                 <HelpSubSection title="Action Buttons">
                    <div className="flex items-start space-x-4">
                        <p>Next to the input field, you'll find powerful action buttons:</p>
                        <ul className="list-disc list-inside flex-1">
                           <li><strong>Narrator (Book Icon):</strong>
                                <br/>- **Single-Click:** Prompts you to enter a narration instruction (e.g., "Describe the weather changing").
                                <br/>- **Double-Click:** The AI narrates the current situation based on the last few messages.
                           </li>
                           <li className="mt-2"><strong>Image Generation (Image Icon):</strong>
                                <br/>- **Single-Click:** Prompts you to enter a prompt for image generation.
                                <br/>- **Double-Click:** The AI creates an image prompt by summarizing the recent chat context.
                           </li>
                        </ul>
                    </div>
                 </HelpSubSection>
            </HelpSection>

            <HelpSection title="Plugin System">
                <p>Plugins are custom JavaScript snippets that can extend AI Nexus's functionality. They run in a secure, sandboxed environment.</p>
                <HelpSubSection title="Managing Plugins">
                    <p>In the Plugin Manager, you can create new plugins, edit existing ones, or import/export them as JSON files. You must enable a plugin using the power icon for it to run.</p>
                </HelpSubSection>
                <HelpSubSection title="Configuring the Image Generator">
                    <p>The default "Image Generation" plugin can be configured by clicking its edit icon. Here you can:</p>
                    <ul className="list-disc list-inside">
                        <li>Select a preset art style to apply to all generations.</li>
                        <li>Add a global "Negative Prompt" to exclude unwanted elements from images.</li>
                        <li>Set a specific API (e.g., DALL-E via an OpenAI-compatible endpoint) just for image generation.</li>
                    </ul>
                </HelpSubSection>
            </HelpSection>
            
            <HelpSection title="Data Management">
                <p>Your data is yours. The sidebar provides tools for complete data management.</p>
                <ul className="list-disc list-inside">
                    <li><strong>Export:</strong> Downloads a single JSON file containing all your characters, chat sessions, and plugins. It's a full backup of your application state.</li>
                    <li><strong>Import:</strong> Upload a previously exported JSON file to overwrite your current data. This is useful for migrating between browsers or devices.</li>
                </ul>
            </HelpSection>

        </div>
      </div>
    </div>
  );
};
