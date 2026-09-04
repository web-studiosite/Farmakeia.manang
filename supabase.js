/**
 * FARMAKEIA — Supabase Client Wrapper
 * High-reliability wrapper for Supabase JS Client with auto-initialization,
 * connection tests, and query safety.
 */

import { config } from './config.js';

let supabaseInstance = null;
let supabaseModule = null;

/**
 * Loads Supabase JS library dynamically via ESM CDN or local window
 */
async function loadSupabaseLib() {
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    return window.supabase;
  }
  if (!supabaseModule) {
    try {
      supabaseModule = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    } catch (err) {
      console.error('Failed to import Supabase from CDN:', err);
      throw new Error('Não foi possível carregar a biblioteca do Supabase.');
    }
  }
  return supabaseModule;
}

/**
 * Initializes and returns the Supabase client
 */
export async function getSupabase() {
  const url = config.getSupabaseUrl();
  const key = config.getSupabaseAnonKey();

  if (!url || !key) {
    return null;
  }

  if (supabaseInstance) {
    return supabaseInstance;
  }

  try {
    const lib = await loadSupabaseLib();
    supabaseInstance = lib.createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    return supabaseInstance;
  } catch (error) {
    console.error('Error initializing Supabase client:', error);
    return null;
  }
}

/**
 * Tests connection to Supabase database
 */
export async function testSupabaseConnection(customUrl, customKey) {
  try {
    const url = customUrl || config.getSupabaseUrl();
    const key = customKey || config.getSupabaseAnonKey();

    if (!url || !key) {
      return { success: false, message: 'URL ou Chave Anônima ausentes.' };
    }

    const lib = await loadSupabaseLib();
    const testClient = lib.createClient(url, key);
    
    // Quick probe to check connectivity
    const { error } = await testClient.from('stores').select('id').limit(1);
    
    if (error && error.code !== 'PGRST116' && !error.message.includes('permission')) {
      // Table might not exist yet if schema was not run, check auth health
      const { error: authErr } = await testClient.auth.getSession();
      if (authErr) {
        return { success: false, message: authErr.message };
      }
    }

    return { success: true, message: 'Conexão com o Supabase estabelecida com sucesso!' };
  } catch (err) {
    return { success: false, message: err.message || 'Falha de comunicação com o Supabase.' };
  }
}

/**
 * Resets the active client when credentials change
 */
export function resetSupabaseClient() {
  supabaseInstance = null;
}
