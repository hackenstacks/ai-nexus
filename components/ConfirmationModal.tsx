import React from 'react';
import { WarningIcon } from './icons/WarningIcon';

interface ConfirmationModalProps {
  message: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ message, onConfirm, onCancel }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-nexus-gray-light-100 dark:bg-nexus-gray-800 rounded-lg shadow-xl w-full max-w-md flex flex-col" onClick={e => e.stopPropagation()}>
        <header className="p-4 flex items-center space-x-3 border-b border-nexus-gray-light-300 dark:border-nexus-gray-700">
          <WarningIcon className="w-8 h-8 text-yellow-500 dark:text-yellow-400 flex-shrink-0" />
          <h2 className="text-xl font-bold text-nexus-gray-900 dark:text-white">Please Confirm</h2>
        </header>
        <div className="p-6">
            <div className="text-nexus-gray-800 dark:text-nexus-gray-300">{message}</div>
        </div>
        <footer className="p-4 bg-nexus-gray-light-200 dark:bg-nexus-gray-900/50 flex justify-end space-x-3 rounded-b-lg">
            <button onClick={onCancel} className="py-2 px-4 rounded-md text-nexus-gray-900 dark:text-white bg-nexus-gray-light-400 dark:bg-nexus-gray-600 hover:bg-nexus-gray-light-500 dark:hover:bg-nexus-gray-500 font-medium">
                Cancel
            </button>
            <button onClick={onConfirm} className="py-2 px-4 rounded-md text-white bg-red-600 hover:bg-red-700 font-medium">
                Confirm
            </button>
        </footer>
      </div>
    </div>
  );
};
