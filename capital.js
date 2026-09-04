/**
 * FARMAKEIA — Invested Capital & Pharmaceutical Patrimony Module
 * Tracks partner contributions, withdrawals, real stock valuation, and total equity.
 */

import { db } from './database.js';
import { state } from './state.js';
import { formatCurrency, formatDate, escapeHtml } from './utils.js';
import { notify } from './notifications.js';
import { modal } from './modal.js';

export const capitalView = {
  transactions: [],

  async render(container) {
    if (!state.activeStore) {
      container.innerHTML = `<div class="empty-state"><h3>Selecione uma farmácia.</h3></div>`;
      return;
    }

    if (!state.isAdmin()) {
      container.innerHTML = `<div class="empty-state" style="color:var(--color-danger);"><h3>Acesso restrito a administradores.</h3></div>`;
      return;
    }

    const metrics = await db.getAdminDashboardMetrics();

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
        <div>
          <h2 style="font-size: 1.5rem; font-weight: 700;">Estrutura de Capital & Patrimônio</h2>
          <p style="font-size: 0.875rem; color: var(--text-muted);">
            Gestão de aportes de sócios, retiradas de lucros e avaliação patrimonial real da farmácia.
          </p>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn btn-primary" id="btn-new-capital-tx">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"></path><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
            Registrar Aporte / Retirada
          </button>
        </div>
      </div>

      <!-- Equity & Valuation Cards -->
      <div class="metrics-grid" style="margin-bottom: 1.5rem;">
        <div class="metric-card" style="--metric-color: var(--color-primary);">
          <div class="metric-info">
            <h4>Capital Líquido Investido</h4>
            <div class="metric-value">${formatCurrency(metrics?.net_invested_capital || 0)}</div>
            <div class="metric-sub">Total de Aportes - Retiradas</div>
          </div>
          <div class="metric-icon-box">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
          </div>
        </div>

        <div class="metric-card" style="--metric-color: #8b5cf6;">
          <div class="metric-info">
            <h4>Estoque Físico a Custo</h4>
            <div class="metric-value">${formatCurrency(metrics?.stock_cost_valuation || 0)}</div>
            <div class="metric-sub">Mercadorias em Prateleiras</div>
          </div>
          <div class="metric-icon-box">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path></svg>
          </div>
        </div>

        <div class="metric-card" style="--metric-color: var(--color-secondary);">
          <div class="metric-info">
            <h4>Patrimônio Total Estimado</h4>
            <div class="metric-value">${formatCurrency(metrics?.estimated_patrimony || 0)}</div>
            <div class="metric-sub">Capital + Estoque + Caixa</div>
          </div>
          <div class="metric-icon-box">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          </div>
        </div>
      </div>

      <!-- Transactions History -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">Histórico de Transações de Capital</div>
        </div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Sócio / Favorecido</th>
                <th>Valor</th>
                <th>Descrição / Justificativa</th>
                <th>Responsável</th>
              </tr>
            </thead>
            <tbody id="capital-tbody">
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

    await this.loadTransactions(container);
    this.initEvents(container);
  },

  async loadTransactions(container) {
    try {
      const txs = await db.getCapitalTransactions();
      this.transactions = txs;
      const tbody = container.querySelector('#capital-tbody');
      if (!tbody) return;

      if (txs.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 3rem;">
              Nenhum aporte ou retirada de capital registrado.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = txs.map(t => {
        const isContribution = t.transaction_type === 'CONTRIBUTION';

        return `
          <tr>
            <td>${formatDate(t.reference_date)}</td>
            <td>
              <span class="badge ${isContribution ? 'badge-success' : 'badge-danger'}">
                ${isContribution ? 'APORTE DE CAPITAL (+)' : 'RETIRADA DE CAPITAL (-)'}
              </span>
            </td>
            <td><strong>${escapeHtml(t.partner_name || 'Sócio')}</strong></td>
            <td><strong style="color: ${isContribution ? 'var(--color-primary)' : 'var(--color-danger)'};">${formatCurrency(t.amount)}</strong></td>
            <td>${escapeHtml(t.description || '—')}</td>
            <td>${escapeHtml(t.profiles?.full_name || 'Admin')}</td>
          </tr>
        `;
      }).join('');
    } catch (e) {
      console.error('Error loading capital transactions:', e);
    }
  },

  initEvents(container) {
    const newBtn = container.querySelector('#btn-new-capital-tx');
    if (newBtn) {
      newBtn.addEventListener('click', () => this.openTransactionModal(container));
    }
  },

  openTransactionModal(container) {
    const modalContent = `
      <div class="form-group">
        <label class="form-label">Tipo de Movimentação *</label>
        <select id="m-cap-type" class="form-select">
          <option value="CONTRIBUTION">Aporte de Capital (Investimento / Entrada de Recursos)</option>
          <option value="WITHDRAWAL">Retirada de Capital (Pró-labore / Distribuição de Lucros)</option>
        </select>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Valor (MT) *</label>
          <input type="number" id="m-cap-amount" class="form-control" step="10.00" min="1" placeholder="0.00" required />
        </div>
        <div class="form-group">
          <label class="form-label">Data de Referência</label>
          <input type="date" id="m-cap-date" class="form-control" value="${new Date().toISOString().split('T')[0]}" />
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Nome do Sócio / Investidor</label>
        <input type="text" id="m-cap-partner" class="form-control" placeholder="Nome do sócio ou titular..." />
      </div>

      <div class="form-group">
        <label class="form-label">Descrição / Justificativa</label>
        <textarea id="m-cap-desc" class="form-control" rows="2" placeholder="Detalhes do aporte ou retirada..."></textarea>
      </div>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" id="m-btn-cancel-cap">Cancelar</button>
      <button class="btn btn-primary" id="m-btn-confirm-cap">Registrar Transação</button>
    `;

    const overlay = modal.open({
      title: 'Registrar Movimentação de Capital',
      contentHtml: modalContent,
      footerHtml,
      size: 'md'
    });

    overlay.querySelector('#m-btn-cancel-cap')?.addEventListener('click', () => modal.close());

    overlay.querySelector('#m-btn-confirm-cap')?.addEventListener('click', async () => {
      const type = overlay.querySelector('#m-cap-type').value;
      const amount = Number(overlay.querySelector('#m-cap-amount').value) || 0;
      const date = overlay.querySelector('#m-cap-date').value;
      const partner = overlay.querySelector('#m-cap-partner').value.trim();
      const desc = overlay.querySelector('#m-cap-desc').value.trim();

      if (amount <= 0) {
        notify.error('Informe um valor válido.');
        return;
      }

      try {
        await db.createCapitalTransaction({
          transaction_type: type,
          amount,
          reference_date: date,
          partner_name: partner || null,
          description: desc || null
        });

        modal.close();
        notify.success('Transação de capital registrada com sucesso!');
        await this.render(container);
      } catch (err) {
        notify.error(err.message || 'Erro ao registrar capital.');
      }
    });
  }
};
