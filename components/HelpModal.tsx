import React from 'react';

interface HelpModalProps {
  onClose: () => void;
}

const HelpSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="mb-6">
    <h2 className="text-2xl font-bold text-nexus-blue-500 border-b-2 border-nexus-gray-light-300 dark:border-nexus-gray-700 pb-2 mb-3">{title}</h2>
    <div className="space-y-3 text-nexus-gray-800 dark:text-nexus-gray-300">{children}</div>
  </section>
);

const HelpSubSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="mt-4 pl-4 border-l-4 border-nexus-gray-light-300 dark:border-nexus-gray-700">
        <h3 className="text-xl font-semibold text-nexus-gray-900 dark:text-white mb-2">{title}</h3>
        <div className="space-y-2 text-nexus-gray-700 dark:text-nexus-gray-400">{children}</div>
    </div>
);


export const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-nexus-gray-light-100 dark:bg-nexus-gray-800 rounded-lg shadow-xl w-full max-w-4xl h-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <header className="p-4 border-b border-nexus-gray-light-300 dark:border-nexus-gray-700 flex justify-between items-center flex-shrink-0">
          <h2 className="text-xl font-bold text-nexus-gray-900 dark:text-white">AI Nexus Help Center</h2>
          <button onClick={onClose} className="text-nexus-gray-700 dark:text-nexus-gray-400 hover:text-nexus-gray-900 dark:hover:text-white transition-colors text-2xl font-bold leading-none p-1">&times;</button>
        </header>
        <div className="flex-1 p-6 overflow-y-auto">
            
            <HelpSection title="Getting Started">
                <p>Welcome to AI Nexus! This guide will help you understand all the features of the application.</p>
                <HelpSubSection title="The Master Password">
                    <p>On your first visit, AI Nexus prompts you to create a Master Password. This password is crucial as it encrypts all your application data (characters, chats, plugins) before saving it to your browser's local database (IndexedDB).</p>
                    <p className="font-bold text-yellow-500 dark:text-yellow-400">This is a zero-knowledge system. If you forget your password, there is no way to recover it. Your data will be inaccessible.</p>
                </HelpSubSection>
            </HelpSection>

            <HelpSection title="Data Management & Compatibility">
                 <p>AI Nexus is designed to be open and compatible. You have full control over your data.</p>
                <HelpSubSection title="Smart Import">
                    <p>Click the `Import` button in the sidebar to open a file picker. AI Nexus automatically detects what you are importing:</p>
                    <ul className="list-disc list-inside space-y-2">
                        <li><strong>Character Card (.json):</strong> Imports a character from another platform (like SillyTavern, Chub, etc.). This will add the character to your list without overwriting other data.</li>
                        <li><strong>Chat Session (.json):</strong> Imports a chat history file that was exported from AI Nexus.</li>
                        <li><strong>Full Backup (.json):</strong> A full backup file from AI Nexus. Importing this will ask for confirmation before overwriting all your current data.</li>
                    </ul>
                </HelpSubSection>
                 <HelpSubSection title="Granular Export">
                    <p>You can export data in several ways:</p>
                    <ul className="list-disc list-inside space-y-2">
                        <li><strong>Export Character:</strong> Click the download icon next to any character's name to save them as a universal `.json` character card.</li>
                        <li><strong>Export Chat:</strong> Click the download icon next to any chat's name to save the conversation history as a `.json` file.</li>
                        <li><strong>Export Backup:</strong> Click the `Export Backup` button in the sidebar to save a full backup of your entire instance.</li>
                    </ul>
                 </HelpSubSection>
            </HelpSection>
            
            <HelpSection title="The Chat Interface">
                 <p>Select or create a chat to begin a conversation. You can create chats with a single character or a group of characters for complex interactions.</p>
                 <HelpSubSection title="Slash Commands">
                    <p>Use slash commands in the chat input for special actions:</p>
                    <ul className="list-disc list-inside space-y-1">
                        <li><code className="bg-nexus-gray-light-200 dark:bg-nexus-dark px-1 rounded">/image [prompt]</code> - Generates an image.</li>
                        <li><code className="bg-nexus-gray-light-200 dark:bg-nexus-dark px-1 rounded">/narrate [prompt]</code> - Adds a narrative description to the scene.</li>
                        <li><code className="bg-nexus-gray-light-200 dark:bg-nexus-dark px-1 rounded">/save</code> - Summarizes recent events and saves them to the characters' long-term memory.</li>
                        <li><code className="bg-nexus-gray-light-200 dark:bg-nexus-dark px-1 rounded">/sys [instruction]</code> - Provides a one-time system instruction for the AI's next response.</li>
                        <li><code className="bg-nexus-gray-light-200 dark:bg-nexus-dark px-1 rounded">/character [name] [prompt]</code> - Address a specific character in a group chat.</li>
                        <li><code className="bg-nexus-gray-light-200 dark:bg-nexus-dark px-1 rounded">/converse [optional topic]</code> - (Group chats only) AIs will start talking to each other.</li>
                        <li><code className="bg-nexus-gray-light-200 dark:bg-nexus-dark px-1 rounded">/pause</code> - Pauses an ongoing AI conversation.</li>
                        <li><code className="bg-nexus-gray-light-200 dark:bg-nexus-dark px-1 rounded">/resume</code> - Resumes a paused AI conversation.</li>
                        <li><code className="bg-nexus-gray-light-200 dark:bg-nexus-dark px-1 rounded">/end</code> or <code className="bg-nexus-dark px-1 rounded">/quit</code> - Stops an ongoing AI conversation.</li>
                    </ul>
                 </HelpSubSection>
                 <HelpSubSection title="Action Buttons">
                    <p>Next to the input field, you'll find powerful action buttons:</p>
                    <ul className="list-disc list-inside space-y-2">
                       <li><strong>Import Memory (Brain Icon):</strong> Allows a character to "remember" things from other chats. Click it, select another chat session, and any shared characters will have their memories from that session appended to their current memory. Great for continuity across different scenarios.</li>
                       <li><strong>Narrator (Book Icon):</strong>
                           <br/>- **Single-Click:** Prompts you to enter a narration instruction (e.g., "Describe the weather changing").
                           <br/>- **Double-Click:** The AI narrates the current situation based on the last few messages.
                       </li>
                       <li><strong>Image Generation (Image Icon):</strong>
                           <br/>- **Single-Click:** Prompts you to enter a prompt for image generation.
                           <br/>- **Double-Click:** The AI creates an image prompt by summarizing the recent chat context.
                       </li>
                       <li><strong>Text-to-Speech (Speaker Icon):</strong>
                           <br/>- A speaker icon appears on every message; click it to read that message aloud.
                           <br/>- In the chat header, a master TTS toggle will automatically read new AI responses as they arrive.
                       </li>
                    </ul>
                 </HelpSubSection>
            </HelpSection>

            <HelpSection title="Plugin System">
                <p>Plugins are custom JavaScript snippets that can extend AI Nexus's functionality. They run in a secure, sandboxed environment.</p>
                <HelpSubSection title="Configuring the Image Generator">
                    <p>The default "Image Generation" plugin is highly configurable. Go to `Plugins` and click its edit icon to:</p>
                    <ul className="list-disc list-inside">
                        <li>Select a preset art style to apply to all generations.</li>
                        <li>Add a global "Negative Prompt" to exclude unwanted elements from images.</li>
                        <li>Set a specific API (e.g., DALL-E via an OpenAI-compatible endpoint) just for image generation, separate from your chat characters.</li>
                    </ul>
                </HelpSubSection>
            </HelpSection>

        </div>
      </div>
    </div>
  );
};
