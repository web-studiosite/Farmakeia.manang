/**
 * FARMAKEIA — Role Based Access Control (RBAC) & Permissions Guard
 */

import { state } from './state.js';

export const permissions = {
  /**
   * Checks if current user is an Admin
   */
  isAdmin() {
    return state.isAdmin();
  },

  /**
   * Cashier permission check for allowed operational views
   */
  canAccessView(viewName) {
    if (this.isAdmin()) return true;

    // Cashier allowed views
    const cashierViews = [
      'pos',
      'dashboard',
      'cash-sessions',
      'cash-movements',
      'products-lookup',
      'sales-history',
      'settings'
    ];

    return cashierViews.includes(viewName);
  },

  /**
   * Guard for financial and strategic data
   */
  canViewFinancials() {
    return this.isAdmin();
  },

  canViewCostPrices() {
    return this.isAdmin();
  },

  canManageInventory() {
    return this.isAdmin();
  },

  canManageSuppliers() {
    return this.isAdmin();
  }
};
