/**
 * FARMAKEIA — Daily Closings & Reconciliation Module
 */

import { db } from './database.js';
import { state } from './state.js';
import { formatCurrency, formatDate, formatDateTime, escapeHtml } from './utils.js';
import { notify } from './notifications.js';
import { modal } from './modal.js';

export const closingsView = {
  async render(container) {
    if (!state.activeStore) {
      container.innerHTML = `<div class="empty-state"><h3>Selecione uma farmácia.</h3></div>`;
      return;
    }

    if (!state.isAdmin()) {
      container.innerHTML = `<div class="empty-state" style="color:var(--color-danger);"><h3>Acesso restrito a administradores.</h3></div>`;
      return;
    }

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
        <div>
          <h2 style="font-size: 1.5rem; font-weight: 700;">Fechamentos & Relatórios Consolidados</h2>
          <p style="font-size: 0.875rem; color: var(--text-muted);">
            Histórico de fechamentos diários consolidados, conciliação e conferência financeira.
          </p>
        </div>
      </div>

      <!-- Past Sessions & Closings Table -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">Sessões de Caixa Encerradas</div>
        </div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Data / Hora Fechamento</th>
                <th>Caixa / Terminal</th>
                <th>Operador</th>
                <th>Fundo Inicial</th>
                <th>Esperado</th>
                <th>Contado</th>
                <th>Divergência</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody id="closings-tbody">
              <tr>
                <td colspan="8" style="text-align: center; padding: 2rem;">
                  <div class="skeleton" style="height: 30px;"></div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    await this.loadClosings(container);
  },

  async loadClosings(container) {
    try {
      const tbody = container.querySelector('#closings-tbody');
      if (!tbody) return;

      const sessions = await db.getClosedCashSessions(50);

      if (!sessions || sessions.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 3rem;">
              Nenhum fechamento de caixa registrado.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = sessions.map(s => {
        const diff = Number(s.difference) || 0;
        const diffBadge = diff === 0 ? 'badge-success' : diff > 0 ? 'badge-info' : 'badge-danger';
        const diffLabel = diff === 0 ? 'Exato' : diff > 0 ? `+${formatCurrency(diff)}` : formatCurrency(diff);

        return `
          <tr>
            <td>${formatDateTime(s.closed_at)}</td>
            <td><strong>${escapeHtml(s.cash_registers?.name || 'Caixa Principal')}</strong></td>
            <td>${escapeHtml(s.profiles?.full_name || state.profile?.full_name || 'Operador')}</td>
            <td>${formatCurrency(s.initial_cash)}</td>
            <td>${formatCurrency(s.expected_cash)}</td>
            <td><strong>${formatCurrency(s.counted_cash)}</strong></td>
            <td><span class="badge ${diffBadge}">${diffLabel}</span></td>
            <td><span class="badge badge-gray">${s.reconciliation_status || 'CLOSED'}</span></td>
          </tr>
        `;
      }).join('');
    } catch (e) {
      console.error('Error loading closings:', e);
      const tbody = container.querySelector('#closings-tbody');
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2rem;">
              Nenhum histórico disponível no momento.
            </td>
          </tr>
        `;
      }
    }
  }
};
