class SafeLocalStorage {
  private inMemoryStorage: Record<string, string> = {};

  getItem(key: string): string | null {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch (e) {
      console.warn(`[STORAGE] Error reading key "${key}" from localStorage, using memory fallback:`, e);
    }
    return this.inMemoryStorage[key] !== undefined ? this.inMemoryStorage[key] : null;
  }

  setItem(key: string, value: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
        return;
      }
    } catch (e) {
      console.warn(`[STORAGE] Error writing key "${key}" to localStorage, using memory fallback:`, e);
    }
    this.inMemoryStorage[key] = String(value);
  }

  removeItem(key: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
        return;
      }
    } catch (e) {
      console.warn(`[STORAGE] Error removing key "${key}" from localStorage, using memory fallback:`, e);
    }
    delete this.inMemoryStorage[key];
  }

  clear(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.clear();
        return;
      }
    } catch (e) {
      console.warn('[STORAGE] Error clearing localStorage, using memory fallback:', e);
    }
    this.inMemoryStorage = {};
  }
}

export const safeStorage = new SafeLocalStorage();
