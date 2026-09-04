/**
 * FARMAKEIA — Configuration Module
 * Manages Supabase URL, Anon Key, default system settings and persistence.
 */

const STORAGE_KEY_SUPABASE_URL = 'farmakeia_supabase_url';
const STORAGE_KEY_SUPABASE_ANON_KEY = 'farmakeia_supabase_anon_key';
const STORAGE_KEY_ACTIVE_STORE_ID = 'farmakeia_active_store_id';
const STORAGE_KEY_THEME = 'farmakeia_theme';

// Default Supabase project credentials (can be overridden via Settings or localStorage)
export const config = {
  appName: 'FARMAKEIA',
  appSubtitle: 'Pharmacy Management System',
  version: '2.5.0',
  defaultCurrency: 'MT',
  
  // Retrieve saved credentials or environment fallbacks
  getSupabaseUrl() {
    return localStorage.getItem(STORAGE_KEY_SUPABASE_URL) || 
           (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
           (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_URL) || 
           'https://ripxgzxgyztmqqufbvpe.supabase.co';
  },

  getSupabaseAnonKey() {
    return localStorage.getItem(STORAGE_KEY_SUPABASE_ANON_KEY) || 
           (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
           (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_ANON_KEY) || 
           'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJpcHhnenhneXp0bXFxdWZidnBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzODUwOTUsImV4cCI6MjEwMzk2MTA5NX0.JeV1ycmsEz0ZYjxkIQOTPMcguXMF7iFUgjCIqL7AOm0';
  },

  setSupabaseCredentials(url, key) {
    if (url) localStorage.setItem(STORAGE_KEY_SUPABASE_URL, url.trim());
    if (key) localStorage.setItem(STORAGE_KEY_SUPABASE_ANON_KEY, key.trim());
  },

  getActiveStoreId() {
    return localStorage.getItem(STORAGE_KEY_ACTIVE_STORE_ID) || null;
  },

  setActiveStoreId(storeId) {
    if (storeId) {
      localStorage.setItem(STORAGE_KEY_ACTIVE_STORE_ID, storeId);
    } else {
      localStorage.removeItem(STORAGE_KEY_ACTIVE_STORE_ID);
    }
  },

  getTheme() {
    return localStorage.getItem(STORAGE_KEY_THEME) || 'dark';
  },

  setTheme(theme) {
    localStorage.setItem(STORAGE_KEY_THEME, theme);
    document.documentElement.setAttribute('data-theme', theme);
  },

  isConfigured() {
    const url = this.getSupabaseUrl();
    const key = this.getSupabaseAnonKey();
    return Boolean(url && key && url.startsWith('http'));
  }
};
