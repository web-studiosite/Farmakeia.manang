/**
 * FARMAKEIA — Client-Side Hash Router
 * Handles secure navigation, view mounting, and role permission guards.
 */

import { state } from './state.js';
import { permissions } from './permissions.js';
import { notify } from './notifications.js';

// View Modules
import { dashboardView } from './dashboard.js';
import { cashierView } from './cashier.js';
import { warehouseView } from './warehouse.js';
import { batchesView } from './batches.js';
import { cashSessionsView } from './cash_sessions.js';
import { salesHistoryView } from './sales_history.js';
import { productsView } from './products.js';
import { capitalView } from './capital.js';
import { closingsView } from './closings.js';
import { auditLogsView } from './audit_logs.js';
import { settingsView } from './settings.js';

const routes = {
  dashboard: dashboardView,
  pos: cashierView,
  warehouse: warehouseView,
  batches: batchesView,
  'cash-sessions': cashSessionsView,
  'cash-movements': cashSessionsView,
  'sales-history': salesHistoryView,
  products: productsView,
  'products-lookup': productsView,
  capital: capitalView,
  closings: closingsView,
  'audit-logs': auditLogsView,
  settings: settingsView
};

export const router = {
  currentRoute: '',

  init() {
    window.addEventListener('hashchange', () => this.handleRoute());
    this.handleRoute();
  },

  handleRoute() {
    const rawHash = location.hash.replace(/^#\/?/, '') || 'dashboard';
    const [routeName] = rawHash.split('?');
    const targetRoute = routeName || 'dashboard';

    // If not authenticated, let app.js render login screen
    if (!state.user) {
      this.currentRoute = 'login';
      return;
    }

    // Role permission check
    if (!permissions.canAccessView(targetRoute)) {
      notify.warning('Acesso não autorizado para o seu perfil.');
      location.hash = '#pos';
      return;
    }

    this.currentRoute = targetRoute;
    this.updateActiveNavLinks(targetRoute);

    const mainContainer = document.getElementById('main-content-area');
    if (!mainContainer) return;

    const view = routes[targetRoute] || dashboardView;
    try {
      view.render(mainContainer);
    } catch (err) {
      console.error('Error mounting view:', err);
      mainContainer.innerHTML = `<div class="card"><p style="color:var(--color-danger);">Erro ao carregar a tela.</p></div>`;
    }
  },

  updateActiveNavLinks(activeRoute) {
    document.querySelectorAll('.nav-link').forEach(link => {
      const href = link.getAttribute('href') || '';
      const target = href.replace(/^#\/?/, '');
      if (target === activeRoute) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }
};
