// This string contains the code that will be executed inside the Web Worker.
// It creates a sandboxed environment for the plugin code.
const workerCode = `
  let userHooks = {};

  // The 'nexus' object is the only global API available to the plugin code.
  // It provides a safe, limited interface to interact with the main application.
  const nexus = {
    log: (...args) => {
      // Allows plugins to log to the main console for debugging, prefixed for clarity.
      self.postMessage({ type: 'LOG', payload: args });
    },
    hooks: {
      // Plugins use this function to register their logic for specific events (hooks).
      register: (hookName, callback) => {
        if (typeof callback === 'function') {
          userHooks[hookName] = callback;
        } else {
          console.error('Invalid callback provided for hook:', hookName);
        }
      },
    },
  };

  self.onmessage = (e) => {
    const { type, payload } = e.data;

    switch (type) {
      // 'LOAD_CODE': Receives the plugin code from the main thread and executes it.
      case 'LOAD_CODE':
        try {
          // The plugin code is executed in a restricted scope with only 'nexus' available.
          const pluginFunction = new Function('nexus', payload.code);
          pluginFunction(nexus);
          self.postMessage({ type: 'LOAD_SUCCESS' });
        } catch (error) {
          self.postMessage({ type: 'LOAD_ERROR', error: error.message });
        }
        break;

      // 'EXECUTE_HOOK': Triggered by the main app to run a registered hook.
      case 'EXECUTE_HOOK':
        const hook = userHooks[payload.hookName];
        if (hook) {
          try {
            const result = hook(payload.data);
            self.postMessage({ type: 'HOOK_RESULT', ticket: payload.ticket, result: result });
          } catch (error) {
            self.postMessage({ type: 'HOOK_ERROR', ticket: payload.ticket, error: error.message });
          }
        } else {
          // If no hook is registered, resolve immediately with the original data.
          self.postMessage({ type: 'HOOK_RESULT', ticket: payload.ticket, result: payload.data });
        }
        break;
    }
  };
`;

/**
 * Manages a secure Web Worker sandbox for running a single plugin's code.
 */
export class PluginSandbox {
  private worker: Worker;
  private ticketCounter = 0;
  private pendingHooks = new Map<number, { resolve: (value: any) => void; reject: (reason?: any) => void }>();

  constructor() {
    // The worker is created from a Blob URL containing the worker code string.
    // This makes the worker self-contained and avoids needing a separate file.
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    this.worker = new Worker(URL.createObjectURL(blob));

    this.worker.onmessage = (e) => {
      const { type, payload, ticket, result, error } = e.data;
      if (type === 'LOG') {
        console.log('[Plugin Sandbox]', ...payload);
      } else if (ticket !== undefined && this.pendingHooks.has(ticket)) {
        const promise = this.pendingHooks.get(ticket)!;
        if (type === 'HOOK_RESULT') {
          promise.resolve(result);
        } else if (type === 'HOOK_ERROR') {
          console.error(`[Plugin Sandbox] Error executing hook:`, error);
          promise.reject(new Error(error));
        }
        this.pendingHooks.delete(ticket);
      }
    };
  }

  /**
   * Loads and executes the plugin code inside the sandbox.
   * @param code The JavaScript code of the plugin.
   * @returns A promise that resolves on successful load or rejects on error.
   */
  loadCode(code: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const loadListener = (e: MessageEvent) => {
        if (e.data.type === 'LOAD_SUCCESS') {
          this.worker.removeEventListener('message', loadListener);
          resolve();
        } else if (e.data.type === 'LOAD_ERROR') {
          this.worker.removeEventListener('message', loadListener);
          reject(new Error(e.data.error));
        }
      };
      this.worker.addEventListener('message', loadListener);
      this.worker.postMessage({ type: 'LOAD_CODE', payload: { code } });
    });
  }

  /**
   * Executes a registered hook within the plugin's sandbox.
   * @param hookName The name of the hook to execute (e.g., 'beforeMessageSend').
   * @param data The payload to send to the hook.
   * @returns A promise that resolves with the data returned by the plugin's hook function.
   */
  executeHook<T>(hookName: string, data: T): Promise<T> {
    return new Promise((resolve, reject) => {
      const ticket = this.ticketCounter++;
      this.pendingHooks.set(ticket, { resolve, reject });
      this.worker.postMessage({
        type: 'EXECUTE_HOOK',
        payload: { hookName, data, ticket },
      });
    });
  }

  /**
   * Terminates the worker to clean up resources.
   */
  terminate() {
    this.worker.terminate();
  }
}
