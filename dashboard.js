/**
 * FARMAKEIA — Unified Dashboard Module
 * Dynamic rendering for Administrator (Strategic & Financial) vs Cashier (Operational)
 */

import { db } from './database.js';
import { state } from './state.js';
import { formatCurrency, formatDate, formatDateTime, escapeHtml } from './utils.js';
import { notify } from './notifications.js';
import { receipts } from './receipts.js';
import { modal } from './modal.js';
import { t } from './i18n.js';

export const dashboardView = {
  async render(container) {
    container.innerHTML = `
      <div class="card" style="padding: 2rem; text-align: center;">
        <div class="skeleton" style="height: 32px; width: 200px; margin: 0 auto 1.5rem;"></div>
        <div class="metrics-grid">
          <div class="skeleton" style="height: 110px;"></div>
          <div class="skeleton" style="height: 110px;"></div>
          <div class="skeleton" style="height: 110px;"></div>
          <div class="skeleton" style="height: 110px;"></div>
        </div>
      </div>
    `;

    if (!state.activeStore) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"></path><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"></path><path d="M2 7h20"></path></svg>
          </div>
          <h3>${t('no_pharmacy_title')}</h3>
          <p>${t('no_pharmacy_desc')}</p>
          ${state.isAdmin() ? `<button class="btn btn-primary" id="btn-create-first-store">${t('create_first_store')}</button>` : ''}
        </div>
      `;

      const createBtn = container.querySelector('#btn-create-first-store');
      if (createBtn) {
        createBtn.addEventListener('click', () => {
          location.hash = '#settings';
        });
      }
      return;
    }

    try {
      if (state.isAdmin()) {
        await this.renderAdminDashboard(container);
      } else {
        await this.renderCashierDashboard(container);
      }
    } catch (err) {
      console.error('Error rendering dashboard:', err);
      container.innerHTML = `
        <div class="card" style="border-color: var(--color-danger);">
          <div class="card-title" style="color: var(--color-danger);">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            ${t('dash_error_title')}
          </div>
          <p style="margin-top: 0.5rem; color: var(--text-muted);">${escapeHtml(err.message || t('dash_error_desc'))}</p>
          <button class="btn btn-secondary btn-sm" style="margin-top: 1rem;" onclick="location.reload()">${t('retry')}</button>
        </div>
      `;
    }
  },

  /**
   * Renders Comprehensive Administrator Dashboard
   */
  async renderAdminDashboard(container) {
    const [metrics, topSelling] = await Promise.all([
      db.getAdminDashboardMetrics(),
      db.getTopSellingProducts({ limit: 8 })
    ]);
    const store = state.activeStore;

    const todayRev = Number(metrics?.today_sales_revenue) || 0;
    const todayProf = Number(metrics?.today_profit) || 0;
    const todayMargin = todayRev > 0 ? ((todayProf / todayRev) * 100).toFixed(1) : '0.0';

    const monthRev = Number(metrics?.month_sales_revenue) || 0;
    const monthProf = Number(metrics?.month_profit) || 0;
    const monthMargin = monthRev > 0 ? ((monthProf / monthRev) * 100).toFixed(1) : '0.0';

    container.innerHTML = `
      <!-- Dashboard Header & Quick Action Bar -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
        <div>
          <h2 style="font-size: 1.5rem; font-weight: 700;">${t('dash_admin_title')}</h2>
          <p style="font-size: 0.875rem; color: var(--text-muted);">${escapeHtml(store.name)} • ${formatDate(new Date().toISOString())}</p>
        </div>
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <a href="#pos" class="btn btn-primary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
            ${t('open_pos')}
          </a>
          <a href="#warehouse" class="btn btn-secondary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path><polyline points="3.29 7 12 12 20.71 7"></polyline><line x1="12" y1="22" x2="12" y2="12"></line></svg>
            ${t('new_entry')}
          </a>
          <a href="#products" class="btn btn-secondary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
            ${t('products_costs')}
          </a>
        </div>
      </div>

      <!-- Financial Metrics Grid -->
      <div class="metrics-grid">
        <div class="metric-card" style="--metric-color: var(--color-primary);">
          <div class="metric-info">
            <h4>${t('today_sales')} (${metrics?.today_sales_count || 0})</h4>
            <div class="metric-value">${formatCurrency(todayRev)}</div>
            <div class="metric-sub" style="color: var(--color-primary); font-weight: 600;">
              ${t('gross_profit')}: ${formatCurrency(todayProf)} (${todayMargin}%)
            </div>
          </div>
          <div class="metric-icon-box">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
          </div>
        </div>

        <div class="metric-card" style="--metric-color: var(--color-secondary);">
          <div class="metric-info">
            <h4>${t('month_revenue')}</h4>
            <div class="metric-value">${formatCurrency(monthRev)}</div>
            <div class="metric-sub" style="color: var(--color-secondary); font-weight: 600;">
              ${t('gross_profit')}: ${formatCurrency(monthProf)} (${monthMargin}%)
            </div>
          </div>
          <div class="metric-icon-box">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          </div>
        </div>

        <div class="metric-card" style="--metric-color: #8b5cf6;">
          <div class="metric-info">
            <h4>${t('stock_cost_valuation')}</h4>
            <div class="metric-value">${formatCurrency(metrics?.stock_cost_valuation || 0)}</div>
            <div class="metric-sub">
              ${t('stock_sale_valuation')}: ${formatCurrency(metrics?.stock_sale_valuation || 0)}
            </div>
          </div>
          <div class="metric-icon-box">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path></svg>
          </div>
        </div>

        <div class="metric-card" style="--metric-color: #ec4899;">
          <div class="metric-info">
            <h4>${t('cash_in_drawer')}</h4>
            <div class="metric-value">${formatCurrency(metrics?.cash_in_open_drawers || 0)}</div>
            <div class="metric-sub">
              ${t('est_patrimony')}: ${formatCurrency(metrics?.estimated_patrimony || 0)}
            </div>
          </div>
          <div class="metric-icon-box">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="12" x="2" y="6" rx="2"></rect><circle cx="12" cy="12" r="2"></circle><path d="M6 12h.01M18 12h.01"></path></svg>
          </div>
        </div>
      </div>

      <!-- Top Selling Products & Profitability Analysis Card -->
      <div class="card" style="margin-bottom: 1.5rem;">
        <div class="card-header">
          <div class="card-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect><path d="m9 14 2 2 4-4"></path></svg>
            ${t('top_selling_title')}
          </div>
          <div style="display: flex; gap: 0.5rem;">
            <a href="#pos" class="btn btn-primary btn-sm">${t('open_pos')}</a>
            <a href="#products" class="btn btn-secondary btn-sm">${t('view_all')}</a>
          </div>
        </div>

        ${(topSelling && topSelling.length > 0) ? `
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>${t('table_prod')}</th>
                  <th>${t('table_cost')}</th>
                  <th>${t('table_sale')}</th>
                  <th>${t('table_margin')}</th>
                  <th>${t('table_sold_qty')}</th>
                  <th>${t('table_total_rev')}</th>
                  <th>${t('table_profit_gen')}</th>
                  <th>${t('table_curr_stock')}</th>
                  <th>${t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                ${topSelling.map(p => {
                  const cost = Number(p.cost_price_base) || 0;
                  const sale = Number(p.sale_price_base) || 0;
                  const unitMargin = sale > 0 ? (((sale - cost) / sale) * 100).toFixed(1) : '0.0';
                  const totalSold = Number(p.total_sold_qty) || 0;
                  const totalRev = Number(p.total_sold_revenue) || (totalSold * sale);
                  const totalCost = Number(p.total_sold_cost) || (totalSold * cost);
                  const totalProfit = totalRev - totalCost;
                  const stock = Number(p.current_stock_base) || 0;
                  const unitSym = p.product_units?.symbol || 'un';

                  return `
                    <tr>
                      <td>
                        <strong>${escapeHtml(p.name)}</strong>
                        ${p.dosage || p.presentation ? `
                          <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(p.dosage || '')} ${escapeHtml(p.presentation || '')}</div>
                        ` : ''}
                      </td>
                      <td>${formatCurrency(cost)}</td>
                      <td><strong>${formatCurrency(sale)}</strong></td>
                      <td>
                        <span class="badge ${Number(unitMargin) >= 30 ? 'badge-success' : Number(unitMargin) > 0 ? 'badge-info' : 'badge-danger'}">
                          ${unitMargin}%
                        </span>
                      </td>
                      <td><strong>${totalSold}</strong> ${unitSym}</td>
                      <td>${formatCurrency(totalRev)}</td>
                      <td style="color: var(--color-primary); font-weight: 700;">${formatCurrency(totalProfit)}</td>
                      <td>
                        <span class="badge ${stock > 0 ? 'badge-success' : 'badge-danger'}">
                          ${stock} ${unitSym}
                        </span>
                      </td>
                      <td>
                        <a href="#pos" class="btn btn-secondary btn-sm" title="${t('btn_sell')}">
                          ${t('btn_sell')}
                        </a>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        ` : `
          <div class="empty-state" style="padding: 2rem;">
            <p>${t('no_products_yet')}</p>
          </div>
        `}
      </div>

      <!-- FEFO Expiry Matrix & Alerts -->
      <div class="card" style="margin-bottom: 1.5rem;">
        <div class="card-header">
          <div class="card-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            ${t('fefo_matrix')}
          </div>
          <a href="#batches" class="btn btn-secondary btn-sm">${t('view_all_batches')}</a>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem;">
          <a href="#batches?filter=expired" style="text-decoration:none;" class="card" style="background: rgba(239, 68, 68, 0.08); border-color: rgba(239, 68, 68, 0.3);">
            <div style="font-size: 0.75rem; color: #ef4444; font-weight: 700; text-transform: uppercase;">${t('expired_batches')}</div>
            <div style="font-size: 1.75rem; font-weight: 800; color: #ef4444; margin-top: 0.25rem;">${metrics?.expired_batches_count || 0}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">${t('alert_active_pos')}</div>
          </a>
          <a href="#batches?filter=30" style="text-decoration:none;" class="card" style="background: rgba(249, 115, 22, 0.08); border-color: rgba(249, 115, 22, 0.3);">
            <div style="font-size: 0.75rem; color: #f97316; font-weight: 700; text-transform: uppercase;">${t('expiring_30')}</div>
            <div style="font-size: 1.75rem; font-weight: 800; color: #f97316; margin-top: 0.25rem;">${metrics?.expiring_30_count || 0}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">${t('max_priority_fefo')}</div>
          </a>
          <a href="#batches?filter=60" style="text-decoration:none;" class="card" style="background: rgba(234, 179, 8, 0.08); border-color: rgba(234, 179, 8, 0.3);">
            <div style="font-size: 0.75rem; color: #eab308; font-weight: 700; text-transform: uppercase;">${t('expiring_60')}</div>
            <div style="font-size: 1.75rem; font-weight: 800; color: #eab308; margin-top: 0.25rem;">${metrics?.expiring_60_count || 0}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">${t('monitoring_active')}</div>
          </a>
          <a href="#batches?filter=90" style="text-decoration:none;" class="card" style="background: rgba(59, 130, 246, 0.08); border-color: rgba(59, 130, 246, 0.3);">
            <div style="font-size: 0.75rem; color: #3b82f6; font-weight: 700; text-transform: uppercase;">${t('expiring_90')}</div>
            <div style="font-size: 1.75rem; font-weight: 800; color: #3b82f6; margin-top: 0.25rem;">${metrics?.expiring_90_count || 0}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">${t('preventive_alert')}</div>
          </a>
        </div>
      </div>

      <!-- Capital & Patrimony Card -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; flex-wrap: wrap;">
        <div class="card">
          <div class="card-header">
            <div class="card-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"></path><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
              ${t('capital_structure')}
            </div>
            <a href="#capital" class="btn btn-secondary btn-sm">${t('manage_capital')}</a>
          </div>
          <div style="display: flex; flex-direction: column; gap: 0.75rem;">
            <div style="display:flex; justify-content:space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--border-color);">
              <span style="color: var(--text-muted);">${t('capital_net')}:</span>
              <strong style="color: var(--color-primary); font-size: 1.1rem;">${formatCurrency(metrics?.net_invested_capital || 0)}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--border-color);">
              <span style="color: var(--text-muted);">${t('total_patrimony')}:</span>
              <strong style="font-size: 1.1rem;">${formatCurrency(metrics?.estimated_patrimony || 0)}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; padding: 0.5rem 0;">
              <span style="color: var(--text-muted);">${t('monthly_losses')}:</span>
              <strong style="color: var(--color-danger);">${formatCurrency(metrics?.total_losses_month || 0)}</strong>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
              ${t('closings_and_audit')}
            </div>
            <a href="#closings" class="btn btn-secondary btn-sm">${t('history')}</a>
          </div>
          <p style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 1rem;">
            ${t('audit_compliance_desc')}
          </p>
          <div style="display: flex; gap: 0.5rem;">
            <a href="#closings" class="btn btn-secondary btn-sm" style="flex:1;">${t('btn_consolidate')}</a>
            <a href="#audit-logs" class="btn btn-secondary btn-sm" style="flex:1;">${t('btn_audit_logs')}</a>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * Renders Operational Cashier Dashboard
   * NEVER displays cost prices, COGS, margins, capital or strategic financial metrics.
   */
  async renderCashierDashboard(container) {
    const session = state.activeCashSession;
    const [metrics, topSelling] = await Promise.all([
      db.getCashierDashboardMetrics(session?.id),
      db.getTopSellingProducts({ limit: 6 })
    ]);
    const store = state.activeStore;

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
        <div>
          <h2 style="font-size: 1.5rem; font-weight: 700;">${t('dash_cashier_title')}</h2>
          <p style="font-size: 0.875rem; color: var(--text-muted);">${escapeHtml(store.name)} • ${escapeHtml(state.profile?.full_name || state.user?.email)}</p>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <a href="#pos" class="btn btn-primary btn-lg">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
            ${t('open_pos')}
          </a>
        </div>
      </div>

      <!-- Session Status Banner -->
      <div class="card" style="margin-bottom: 1.5rem; border-color: ${session ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}; background: ${session ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)'};">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
          <div>
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
              <span class="cash-dot" style="background-color: ${session ? 'var(--color-primary)' : 'var(--color-danger)'};"></span>
              <h3 style="font-size: 1.15rem; font-weight: 700;">${session ? t('cash_open') : t('cash_closed')}</h3>
            </div>
            <p style="font-size: 0.85rem; color: var(--text-muted);">
              ${session ? `${t('opened_at_lbl')} ${formatDateTime(session.opened_at)} • ${t('initial_float_lbl')}: ${formatCurrency(session.initial_cash)}` : t('open_session_to_start')}
            </p>
          </div>
          <div style="display: flex; gap: 0.5rem;">
            ${session ? `
              <a href="#cash-movements" class="btn btn-secondary btn-sm">${t('btn_sangria')}</a>
              <a href="#cash-sessions" class="btn btn-danger btn-sm">${t('btn_close_session')}</a>
            ` : `
              <a href="#cash-sessions" class="btn btn-primary">${t('btn_open_session')}</a>
            `}
          </div>
        </div>
      </div>

      <!-- Cashier Operational Metrics -->
      <div class="metrics-grid" style="margin-bottom: 1.5rem;">
        <div class="metric-card" style="--metric-color: var(--color-primary);">
          <div class="metric-info">
            <h4>${t('expected_drawer_cash')}</h4>
            <div class="metric-value">${formatCurrency(metrics?.expected_cash || 0)}</div>
            <div class="metric-sub">${t('cash_formula_sub')}</div>
          </div>
          <div class="metric-icon-box">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="12" x="2" y="6" rx="2"></rect><circle cx="12" cy="12" r="2"></circle><path d="M6 12h.01M18 12h.01"></path></svg>
          </div>
        </div>

        <div class="metric-card" style="--metric-color: var(--color-secondary);">
          <div class="metric-info">
            <h4>${t('my_session_sales')}</h4>
            <div class="metric-value">${metrics?.session_sales_count || 0}</div>
            <div class="metric-sub">${t('total_lbl')}: ${formatCurrency(metrics?.session_sales_amount || 0)}</div>
          </div>
          <div class="metric-icon-box">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
          </div>
        </div>

        <div class="metric-card" style="--metric-color: #f59e0b;">
          <div class="metric-info">
            <h4>${t('total_sangrias')}</h4>
            <div class="metric-value">${formatCurrency(metrics?.total_sangrias || 0)}</div>
            <div class="metric-sub">${t('registered_withdrawals')}</div>
          </div>
          <div class="metric-icon-box">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"></path><path d="m17 5-5-3-5 3"></path><path d="m17 19-5 3-5-3"></path></svg>
          </div>
        </div>
      </div>

      <!-- Quick Access Best Sellers Grid for Cashier -->
      <div class="card" style="margin-bottom: 1.5rem;">
        <div class="card-header">
          <div class="card-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>
            ${t('top_selling_cashier')}
          </div>
          <a href="#pos" class="btn btn-primary btn-sm">${t('open_catalog_search')}</a>
        </div>
        
        ${(topSelling && topSelling.length > 0) ? `
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.75rem;">
            ${topSelling.map(prod => {
              const stock = Number(prod.current_stock_base) || 0;
              const unitSym = prod.product_units?.symbol || 'un';
              const hasStock = stock > 0;

              return `
                <div class="card" style="padding: 0.75rem; display: flex; flex-direction: column; justify-content: space-between; border-color: ${hasStock ? 'var(--border-color)' : 'rgba(239, 68, 68, 0.3)'};">
                  <div>
                    <strong style="font-size: 0.85rem; display: block; margin-bottom: 0.2rem;">${escapeHtml(prod.name)}</strong>
                    ${prod.dosage || prod.presentation ? `
                      <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.35rem;">
                        ${escapeHtml(prod.dosage || '')} ${escapeHtml(prod.presentation || '')}
                      </div>
                    ` : ''}
                    ${prod.total_sold_qty ? `
                      <div style="font-size: 0.7rem; color: var(--color-primary); margin-bottom: 0.25rem;">
                        🔥 ${prod.total_sold_qty} ${t('units_sold_lbl')}
                      </div>
                    ` : ''}
                  </div>

                  <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid rgba(255,255,255,0.05);">
                    <span class="badge ${hasStock ? 'badge-success' : 'badge-danger'}" style="font-size: 0.7rem;">
                      ${stock} ${unitSym}
                    </span>
                    <strong style="color: var(--color-primary); font-size: 0.95rem;">
                      ${formatCurrency(prod.sale_price_base)}
                    </strong>
                  </div>

                  <a href="#pos" class="btn btn-secondary btn-sm" style="width: 100%; margin-top: 0.5rem; font-size: 0.75rem; text-align: center;">
                    ${t('btn_sell')}
                  </a>
                </div>
              `;
            }).join('')}
          </div>
        ` : `
          <div class="empty-state" style="padding: 1.5rem;">
            <p>${t('no_products_yet')}</p>
          </div>
        `}
      </div>

      <!-- Recent Session Sales -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">${t('recent_sales')}</div>
          <a href="#sales-history" class="btn btn-secondary btn-sm">${t('view_all')}</a>
        </div>
        ${(metrics?.recent_sales && metrics.recent_sales.length > 0) ? `
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>${t('receipt_col')}</th>
                  <th>${t('time_col')}</th>
                  <th>${t('customer_col')}</th>
                  <th>${t('pay_method_col')}</th>
                  <th>${t('amount_col')}</th>
                  <th>${t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                ${metrics.recent_sales.map(s => `
                  <tr>
                    <td><strong>${escapeHtml(s.receipt_number)}</strong></td>
                    <td>${formatDateTime(s.created_at)}</td>
                    <td>${escapeHtml(s.customer_name || 'Consumidor Final')}</td>
                    <td><span class="badge badge-info">${s.payment_method}</span></td>
                    <td><strong>${formatCurrency(s.total_net)}</strong></td>
                    <td>
                      <button class="btn btn-secondary btn-sm btn-print-recent" data-sale-id="${s.id}">
                        ${t('btn_print_receipt')}
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : `
          <div class="empty-state" style="padding: 2rem;">
            <p>${t('no_sales_session')}</p>
          </div>
        `}
      </div>
    `;

    // Hook print buttons
    container.querySelectorAll('.btn-print-recent').forEach(btn => {
      btn.addEventListener('click', async () => {
        const saleId = btn.getAttribute('data-sale-id');
        try {
          const sale = await db.getSaleById(saleId);
          modal.open({
            title: `${t('receipt_modal_title')} #${sale.receipt_number}`,
            contentHtml: receipts.generateReceiptHtml(sale, state.activeStore),
            footerHtml: `
              <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: flex-end; width: 100%;">
                <button class="btn btn-secondary" id="btn-modal-close">${t('btn_close')}</button>
                <button class="btn btn-secondary" id="btn-modal-copy" title="Copiar recibo para colar onde quiser">📋 ${t('copy_receipt') || 'Copiar Recibo'}</button>
                <button class="btn btn-secondary" id="btn-modal-sms" title="Partilhar por SMS">💬 ${t('share_sms') || 'Partilhar por SMS'}</button>
                <button class="btn btn-secondary" id="btn-modal-wa" title="Enviar pelo WhatsApp">📱 ${t('btn_share_wa')}</button>
                <button class="btn btn-primary" id="btn-modal-print">🖨️ ${t('btn_print_receipt')}</button>
              </div>
            `
          });

          document.getElementById('btn-modal-close')?.addEventListener('click', () => modal.close());
          document.getElementById('btn-modal-copy')?.addEventListener('click', () => {
            receipts.copyReceipt(sale, state.activeStore);
          });
          document.getElementById('btn-modal-sms')?.addEventListener('click', () => {
            receipts.shareSMS(sale, state.activeStore);
          });
          document.getElementById('btn-modal-print')?.addEventListener('click', () => {
            receipts.printReceipt(sale, state.activeStore);
          });
          document.getElementById('btn-modal-wa')?.addEventListener('click', () => {
            receipts.shareWhatsApp(sale, state.activeStore);
          });
        } catch (e) {
          notify.error(t('err_load_receipt'));
        }
      });
    });
  }
};
