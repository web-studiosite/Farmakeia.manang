/**
 * FARMAKEIA — Authentication Service
 * Manages Supabase Auth, User Profiles, Store Associations and Permissions.
 */

import { getSupabase } from './supabase.js';
import { state } from './state.js';
import { config } from './config.js';
import { notify } from './notifications.js';

const DEMO_STORAGE_KEY = 'farmakeia_demo_session';

export const auth = {
  /**
   * Initializes auth state listener and auto-recovers user session
   */
  async initAuth(onStateChange) {
    // 1. Check if demo/offline session is active
    const savedDemo = localStorage.getItem(DEMO_STORAGE_KEY);
    if (savedDemo) {
      try {
        const demoData = JSON.parse(savedDemo);
        state.setDemoMode(true);
        state.setUser(demoData.user, demoData.profile);
        state.setUserStores(demoData.stores || []);
        state.setActiveStore(demoData.activeStore || demoData.stores?.[0] || null);
        state.setActiveCashSession(demoData.activeCashSession || null);
        onStateChange(state.user);
        return;
      } catch (e) {
        localStorage.removeItem(DEMO_STORAGE_KEY);
      }
    }

    const supabase = await getSupabase();
    if (!supabase) {
      onStateChange(null);
      return;
    }

    // Get current session
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;

      if (session?.user) {
        await this.loadUserData(session.user);
      } else {
        state.clear();
      }

      onStateChange(state.user);

      // Listen to auth changes
      supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          state.setDemoMode(false);
          localStorage.removeItem(DEMO_STORAGE_KEY);
          await this.loadUserData(session.user);
          onStateChange(state.user);
        } else if (event === 'SIGNED_OUT') {
          state.clear();
          onStateChange(null);
        }
      });
    } catch (err) {
      console.warn('Notice: Supabase unreachable during initAuth:', err?.message || err);
      state.clear();
      onStateChange(null);
    }
  },

  /**
   * Log in immediately as local Demo / Offline user without network dependencies
   */
  async loginDemoUser(role = 'ADMIN', email = 'admin@farmakeia.com') {
    const isPt = localStorage.getItem('farmakeia_lang') !== 'en';
    const demoUser = {
      id: 'demo-user-admin-01',
      email: email.trim(),
      user_metadata: { full_name: isPt ? 'Dr. Farmacêutico (Admin)' : 'Pharmacist (Admin)', role }
    };
    const demoProfile = {
      id: 'demo-user-admin-01',
      full_name: isPt ? 'Dr. Farmacêutico (Admin)' : 'Pharmacist (Admin)',
      email: email.trim(),
      role: role
    };
    const demoStore = {
      id: 'demo-store-01',
      name: 'FARMAKEIA — Drogaria Central',
      cnpj_nif: '100234567',
      phone: '+258 84 123 4567',
      address: 'Av. Eduardo Mondlane, 123 - Maputo',
      receipt_header: 'FARMAKEIA - Drogaria & Farmácia Central',
      receipt_footer: 'Obrigado pela sua preferência! Volte sempre.',
      active: true
    };
    const demoSession = {
      id: 'demo-session-01',
      store_id: 'demo-store-01',
      user_id: 'demo-user-admin-01',
      status: 'OPEN',
      opened_at: new Date().toISOString(),
      initial_cash: 2500,
      cash_registers: { name: 'Caixa 01 (Principal)', code: 'CX-01' },
      profiles: { full_name: demoProfile.full_name, email: demoUser.email }
    };

    const sessionPayload = {
      user: demoUser,
      profile: demoProfile,
      stores: [demoStore],
      activeStore: demoStore,
      activeCashSession: demoSession
    };

    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(sessionPayload));
    state.setDemoMode(true);
    state.setUser(demoUser, demoProfile);
    state.setUserStores([demoStore]);
    state.setActiveStore(demoStore);
    state.setActiveCashSession(demoSession);

    return sessionPayload;
  },

  /**
   * Loads profile, stores, and active cash session for user
   */
  async loadUserData(authUser) {
    const supabase = await getSupabase();
    if (!supabase) return;

    try {
      // 1. Fetch Profile
      let { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();

      if (!profile) {
        // Create initial profile if missing
        const { data: newProf } = await supabase
          .from('profiles')
          .insert({
            id: authUser.id,
            full_name: authUser.user_metadata?.full_name || authUser.email.split('@')[0],
            email: authUser.email,
            role: authUser.user_metadata?.role || 'ADMIN'
          })
          .select()
          .single();
        profile = newProf;
      }

      state.setUser(authUser, profile);

      // 2. Fetch accessible Stores
      let stores = [];
      if (profile.role === 'ADMIN') {
        const { data: allStores } = await supabase
          .from('stores')
          .select('*')
          .eq('active', true)
          .order('name');
        stores = allStores || [];
      } else {
        const { data: userStoreLinks } = await supabase
          .from('store_users')
          .select('store_id, role, stores (*)')
          .eq('user_id', authUser.id)
          .eq('active', true);
        stores = (userStoreLinks || []).map(link => link.stores).filter(Boolean);
      }

      state.setUserStores(stores);

      // 3. Set Active Store (from saved preference or first available)
      const savedStoreId = config.getActiveStoreId();
      let activeStore = stores.find(s => s.id === savedStoreId) || stores[0] || null;
      
      // If no store exists and user is admin, we will prompt store creation
      state.setActiveStore(activeStore);

      // 4. Fetch active cash session for user in this store
      if (activeStore) {
        await this.syncActiveCashSession(activeStore.id, authUser.id);
      }
    } catch (err) {
      console.error('Error loading user data:', err);
    }
  },

  /**
   * Syncs active cash register session for the store
   * If a cashier or admin opens the register, it is open for everyone in the pharmacy.
   */
  async syncActiveCashSession(storeId) {
    const supabase = await getSupabase();
    if (!supabase || !storeId) return;

    try {
      const { data: session } = await supabase
        .from('cash_sessions')
        .select('*, cash_registers(name, code), profiles:user_id(full_name, email)')
        .eq('store_id', storeId)
        .eq('status', 'OPEN')
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      state.setActiveCashSession(session || null);
    } catch (e) {
      console.error('Error syncing cash session:', e);
    }
  },

  /**
   * Sign In with Email and Password
   */
  async signIn(email, password) {
    const cleanEmail = email.trim();
    if (cleanEmail === 'admin@farmakeia.com' && !config.isConfigured()) {
      return await this.loginDemoUser('ADMIN', cleanEmail);
    }

    const supabase = await getSupabase();
    if (!supabase) {
      if (cleanEmail === 'admin@farmakeia.com') {
        return await this.loginDemoUser('ADMIN', cleanEmail);
      }
      throw new Error('Supabase não está configurado.');
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password
      });

      if (error) throw error;
      state.setDemoMode(false);
      localStorage.removeItem(DEMO_STORAGE_KEY);
      await this.loadUserData(data.user);
      return data;
    } catch (err) {
      if (cleanEmail === 'admin@farmakeia.com' && (err?.message?.includes('fetch') || err?.name === 'TypeError')) {
        console.warn('Network unreachable for admin@farmakeia.com, activating Demo Mode fallback.');
        return await this.loginDemoUser('ADMIN', cleanEmail);
      }
      throw err;
    }
  },

  /**
   * Sign Up new account
   */
  async signUp(email, password, fullName, role = 'CASHIER') {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('Supabase não está configurado.');

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          role: role
        }
      }
    });

    if (error) throw error;

    // Create profile
    if (data?.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        full_name: fullName.trim(),
        email: email.trim(),
        role: role
      });
    }

    return data;
  },

  /**
   * Sign Out
   */
  async signOut() {
    localStorage.removeItem(DEMO_STORAGE_KEY);
    state.setDemoMode(false);
    try {
      const supabase = await getSupabase();
      if (supabase) {
        await supabase.auth.signOut();
      }
    } catch (e) {
      console.warn('Supabase signOut notice:', e);
    }
    state.clear();
  }
};
