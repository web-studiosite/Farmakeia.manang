/**
 * FARMAKEIA — Batches & FEFO Expiry Management Module
 * Comprehensive FEFO tracking, expiration alerts, discard/loss management.
 */

import { db } from './database.js';
import { state } from './state.js';
import { formatDate, formatCurrency, getFefoStatus, escapeHtml } from './utils.js';
import { notify } from './notifications.js';
import { modal } from './modal.js';

export const batchesView = {
  batches: [],

  async render(container) {
    if (!state.activeStore) {
      container.innerHTML = `<div class="empty-state"><h3>Selecione uma farmácia.</h3></div>`;
      return;
    }

    const urlParams = new URLSearchParams(location.hash.split('?')[1] || '');
    const initialFilter = urlParams.get('filter') || 'all';

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
        <div>
          <h2 style="font-size: 1.5rem; font-weight: 700;">Gestão de Lotes & Validades (FEFO)</h2>
          <p style="font-size: 0.875rem; color: var(--text-muted);">
            Controle de validade FEFO (First Expired, First Out) e registro de descarte de medicamentos vencidos.
          </p>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn btn-secondary" id="btn-view-losses-history">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
            Histórico de Perdas / Descartes
          </button>
        </div>
      </div>

      <!-- Filter Tabs -->
      <div class="card" style="margin-bottom: 1.5rem; padding: 1rem;">
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;" id="batch-filter-buttons">
          <button class="btn btn-sm ${initialFilter === 'all' ? 'btn-primary' : 'btn-secondary'}" data-filter="all">Todos os Lotes</button>
          <button class="btn btn-sm ${initialFilter === 'expired' ? 'btn-primary' : 'btn-secondary'}" data-filter="expired">Vencidos (Descarte)</button>
          <button class="btn btn-sm ${initialFilter === '30' ? 'btn-primary' : 'btn-secondary'}" data-filter="30">Vence em até 30d</button>
          <button class="btn btn-sm ${initialFilter === '60' ? 'btn-primary' : 'btn-secondary'}" data-filter="60">Vence em 31 a 60d</button>
          <button class="btn btn-sm ${initialFilter === '90' ? 'btn-primary' : 'btn-secondary'}" data-filter="90">Vence em 61 a 90d</button>
        </div>
      </div>

      <!-- Batches Table -->
      <div class="card">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Status FEFO</th>
                <th>Medicamento / Produto</th>
                <th>Número do Lote</th>
                <th>Data de Validade</th>
                <th>Saldo no Lote</th>
                ${state.isAdmin() ? `<th>Custo Unit.</th>` : ''}
                <th>Ações</th>
              </tr>
            </thead>
            <tbody id="batches-table-body">
              <tr>
                <td colspan="7" style="text-align: center; padding: 2rem;">
                  <div class="skeleton" style="height: 30px;"></div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    await this.loadBatches(container, initialFilter);
    this.initEvents(container);
  },

  async loadBatches(container, filter = 'all') {
    try {
      const data = await db.getBatches();
      this.batches = data;
      this.renderTable(container, filter);
    } catch (e) {
      console.error('Error loading batches:', e);
      notify.error('Erro ao consultar lotes.');
    }
  },

  renderTable(container, filter) {
    const tbody = container.querySelector('#batches-table-body');
    if (!tbody) return;

    let filtered = this.batches;

    if (filter === 'expired') {
      filtered = filtered.filter(b => getFefoStatus(b.expiry_date).status === 'EXPIRED');
    } else if (filter === '30') {
      filtered = filtered.filter(b => getFefoStatus(b.expiry_date).status === 'CRITICAL_30');
    } else if (filter === '60') {
      filtered = filtered.filter(b => getFefoStatus(b.expiry_date).status === 'WARNING_60');
    } else if (filter === '90') {
      filtered = filtered.filter(b => getFefoStatus(b.expiry_date).status === 'ATTENTION_90');
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 3rem;">
            Nenhum lote correspondente ao filtro selecionado.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered.map(b => {
      const fefo = getFefoStatus(b.expiry_date);
      const stock = Number(b.quantity_remaining_base) || 0;
      const unitSym = b.products?.product_units?.symbol || 'un';

      return `
        <tr>
          <td><span class="badge ${fefo.badgeClass}">${fefo.label}</span></td>
          <td>
            <strong>${escapeHtml(b.products?.name || 'Item')}</strong>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(b.products?.code || '')}</div>
          </td>
          <td><strong>${escapeHtml(b.batch_number)}</strong></td>
          <td>${formatDate(b.expiry_date)}</td>
          <td>
            <strong>${stock} ${unitSym}</strong>
          </td>
          ${state.isAdmin() ? `<td>${formatCurrency(b.unit_cost_base)}</td>` : ''}
          <td>
            <div style="display: flex; gap: 0.35rem;">
              <button class="btn btn-danger btn-sm btn-discard-batch" data-batch-id="${b.id}" title="Registrar Perda / Descarte">
                Descartar / Baixa
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-discard-batch').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-batch-id');
        const batch = this.batches.find(b => b.id === id);
        if (batch) {
          this.openDiscardModal(batch, container, filter);
        }
      });
    });
  },

  initEvents(container) {
    const filterBtns = container.querySelectorAll('#batch-filter-buttons button');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => {
          b.classList.remove('btn-primary');
          b.classList.add('btn-secondary');
        });
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary');
        const filter = btn.getAttribute('data-filter');
        this.renderTable(container, filter);
      });
    });

    const lossesHistoryBtn = container.querySelector('#btn-view-losses-history');
    if (lossesHistoryBtn) {
      lossesHistoryBtn.addEventListener('click', () => this.openLossesHistoryModal());
    }
  },

  openDiscardModal(batch, container, currentFilter) {
    const unitSym = batch.products?.product_units?.symbol || 'un';
    const maxQty = Number(batch.quantity_remaining_base) || 0;

    const modalContent = `
      <p style="color: var(--text-muted); margin-bottom: 1rem;">
        Registrar perda/descarte do lote <strong>${escapeHtml(batch.batch_number)}</strong> de <strong>${escapeHtml(batch.products?.name)}</strong>:
      </p>

      <div class="form-group">
        <label class="form-label">Tipo de Perda *</label>
        <select id="m-loss-type" class="form-select">
          <option value="EXPIRY">Medicamento Vencido</option>
          <option value="DAMAGE">Avaria / Quebra de Frasco</option>
          <option value="THEFT">Extravio / Furto</option>
          <option value="INVENTORY_ADJUSTMENT">Ajuste de Inventário</option>
          <option value="OTHER">Outro Motivo</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Quantidade a Descartar (${unitSym}) *</label>
        <input type="number" id="m-loss-qty" class="form-control" min="1" max="${maxQty}" value="${maxQty}" />
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">Saldo disponível no lote: ${maxQty} ${unitSym}</div>
      </div>

      <div class="form-group">
        <label class="form-label">Motivo Detalhado / Justificativa</label>
        <input type="text" id="m-loss-reason" class="form-control" placeholder="Justificativa do descarte..." />
      </div>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" id="m-btn-cancel-loss">Cancelar</button>
      <button class="btn btn-danger" id="m-btn-confirm-loss">Confirmar Descarte e Baixa no Estoque</button>
    `;

    const overlay = modal.open({
      title: 'Descarte / Baixa de Lote de Medicamento',
      contentHtml: modalContent,
      footerHtml,
      size: 'md'
    });

    overlay.querySelector('#m-btn-cancel-loss')?.addEventListener('click', () => modal.close());

    overlay.querySelector('#m-btn-confirm-loss')?.addEventListener('click', async () => {
      const lossType = overlay.querySelector('#m-loss-type').value;
      const qty = Number(overlay.querySelector('#m-loss-qty').value) || 0;
      const reason = overlay.querySelector('#m-loss-reason').value.trim();

      if (qty <= 0 || qty > maxQty) {
        notify.error('Informe uma quantidade válida.');
        return;
      }

      try {
        await db.registerLoss(batch.product_id, batch.id, qty, lossType, reason);
        modal.close();
        notify.success('Descarte registrado e estoque baixado com sucesso!');
        await this.loadBatches(container, currentFilter);
      } catch (err) {
        notify.error(err.message || 'Erro ao registrar descarte.');
      }
    });
  },

  async openLossesHistoryModal() {
    try {
      const losses = await db.getLossesHistory();

      const modalContent = `
        ${losses.length === 0 ? `
          <div class="empty-state"><p>Nenhum descarte ou perda registrado.</p></div>
        ` : `
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Produto</th>
                  <th>Lote</th>
                  <th>Tipo</th>
                  <th>Qtd</th>
                  <th>Custo Total</th>
                  <th>Responsável</th>
                </tr>
              </thead>
              <tbody>
                ${losses.map(l => `
                  <tr>
                    <td>${formatDate(l.created_at)}</td>
                    <td><strong>${escapeHtml(l.products?.name)}</strong></td>
                    <td>${escapeHtml(l.batches?.batch_number || '—')}</td>
                    <td><span class="badge badge-danger">${l.loss_type}</span></td>
                    <td><strong>${l.quantity_base} un</strong></td>
                    <td>${formatCurrency(l.total_cost)}</td>
                    <td>${escapeHtml(l.profiles?.full_name || 'Admin')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      `;

      modal.open({
        title: 'Histórico de Perdas e Descartes Farmacêuticos',
        contentHtml: modalContent,
        size: 'lg'
      });
    } catch (e) {
      notify.error('Erro ao carregar histórico de perdas.');
    }
  }
};
