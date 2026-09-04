/**
 * FARMAKEIA — Central Application State
 * Reactive state store for authenticated user, role, active store,
 * active cash register session, and cart.
 */

class AppState {
  constructor() {
    this.user = null;
    this.profile = null;
    this.userStores = [];
    this.activeStore = null;
    this.activeCashSession = null;
    this.isDemoMode = false;
    this.listeners = new Set();
  }

  setDemoMode(isDemo) {
    this.isDemoMode = !!isDemo;
  }

  setUser(user, profile) {
    this.user = user;
    this.profile = profile;
    this.notify();
  }

  setUserStores(stores) {
    this.userStores = stores || [];
    this.notify();
  }

  setActiveStore(store) {
    this.activeStore = store;
    if (store?.id) {
      import('./config.js').then(m => m.config.setActiveStoreId(store.id));
    }
    this.notify();
  }

  setActiveCashSession(session) {
    this.activeCashSession = session;
    this.notify();
  }

  getRole() {
    return this.profile?.role || 'CASHIER';
  }

  isAdmin() {
    return this.getRole() === 'ADMIN';
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify() {
    this.listeners.forEach(cb => {
      try { cb(this); } catch (e) { console.error('State listener error:', e); }
    });
  }

  clear() {
    this.user = null;
    this.profile = null;
    this.userStores = [];
    this.activeStore = null;
    this.activeCashSession = null;
    this.notify();
  }
}

export const state = new AppState();
