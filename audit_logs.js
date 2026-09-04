/**
 * FARMAKEIA — Security Audit Logs Module
 */

import { db } from './database.js';
import { state } from './state.js';
import { formatDateTime, escapeHtml } from './utils.js';
import { notify } from './notifications.js';

export const auditLogsView = {
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
          <h2 style="font-size: 1.5rem; font-weight: 700;">Trilha de Auditoria & Segurança</h2>
          <p style="font-size: 0.875rem; color: var(--text-muted);">
            Registro inviolável de todas as ações operacionais, financeiras e alterações no sistema.
          </p>
        </div>
      </div>

      <!-- Audit Logs Table -->
      <div class="card">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Data / Hora</th>
                <th>Usuário</th>
                <th>Papel</th>
                <th>Ação</th>
                <th>Entidade</th>
                <th>Detalhes / Justificativa</th>
              </tr>
            </thead>
            <tbody id="audit-logs-tbody">
              <tr>
                <td colspan="6" style="text-align: center; padding: 2rem;">
                  <div class="skeleton" style="height: 30px;"></div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    await this.loadLogs(container);
  },

  async loadLogs(container) {
    try {
      const logs = await db.getAuditLogs({ limit: 100 });
      const tbody = container.querySelector('#audit-logs-tbody');
      if (!tbody) return;

      if (logs.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 3rem;">
              Nenhum registro de auditoria encontrado.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = logs.map(l => `
        <tr>
          <td>${formatDateTime(l.created_at)}</td>
          <td><strong>${escapeHtml(l.profiles?.full_name || l.user_email || 'Sistema')}</strong></td>
          <td><span class="badge ${l.user_role === 'ADMIN' ? 'badge-primary' : 'badge-gray'}">${l.user_role}</span></td>
          <td><code>${escapeHtml(l.action)}</code></td>
          <td>${escapeHtml(l.entity)}</td>
          <td><div style="font-size: 0.8rem; max-width: 350px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(l.details || '')}">${escapeHtml(l.details || '—')}</div></td>
        </tr>
      `).join('');
    } catch (e) {
      console.error('Error loading audit logs:', e);
      notify.error('Erro ao consultar logs de auditoria.');
    }
  }
};
