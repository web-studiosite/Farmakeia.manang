/**
 * FARMAKEIA — Sales History & Reversals Module
 * View past sales, print receipts, and perform atomic inventory reversals.
 */

import { db } from './database.js';
import { state } from './state.js';
import { formatCurrency, formatDateTime, escapeHtml } from './utils.js';
import { receipts } from './receipts.js';
import { notify } from './notifications.js';
import { modal } from './modal.js';

export const salesHistoryView = {
  sales: [],

  async render(container) {
    if (!state.activeStore) {
      container.innerHTML = `<div class="empty-state"><h3>Selecione uma farmácia.</h3></div>`;
      return;
    }

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
        <div>
          <h2 style="font-size: 1.5rem; font-weight: 700;">Histórico de Vendas & Comprovantes</h2>
          <p style="font-size: 0.875rem; color: var(--text-muted);">
            Consulta de vendas realizadas, reimpressão de recibos e cancelamentos/estornos.
          </p>
        </div>
      </div>

      <!-- Sales Table -->
      <div class="card">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Recibo</th>
                <th>Data / Hora</th>
                <th>Cliente</th>
                <th>Operador</th>
                <th>Pagamento</th>
                <th>Status</th>
                <th>Total Líquido</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody id="sales-table-body">
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

    await this.loadSales(container);
  },

  async loadSales(container) {
    try {
      const sales = await db.getSales({ limit: 100 });
      this.sales = sales;
      const tbody = container.querySelector('#sales-table-body');
      if (!tbody) return;

      if (sales.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 3rem;">
              Nenhuma venda registrada até o momento.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = sales.map(s => {
        const isCancelled = s.status === 'CANCELLED';

        return `
          <tr style="${isCancelled ? 'opacity: 0.6; text-decoration: line-through;' : ''}">
            <td><strong>${escapeHtml(s.receipt_number)}</strong></td>
            <td>${formatDateTime(s.created_at)}</td>
            <td>${escapeHtml(s.customer_name || 'Consumidor Final')}</td>
            <td>${escapeHtml(s.profiles?.full_name || 'Operador')}</td>
            <td><span class="badge badge-info">${s.payment_method}</span></td>
            <td>
              <span class="badge ${isCancelled ? 'badge-danger' : 'badge-success'}">
                ${isCancelled ? 'CANCELADA / ESTORNADA' : 'CONCLUÍDA'}
              </span>
            </td>
            <td><strong>${formatCurrency(s.total_net)}</strong></td>
            <td style="text-decoration: none;">
              <div style="display: flex; gap: 0.35rem;">
                <button class="btn btn-secondary btn-sm btn-view-sale" data-sale-id="${s.id}" title="Ver Recibo">
                  Recibo
                </button>
                ${(state.isAdmin() && !isCancelled) ? `
                  <button class="btn btn-danger btn-sm btn-reverse-sale" data-sale-id="${s.id}" title="Estornar e Devolver Estoque">
                    Estornar
                  </button>
                ` : ''}
              </div>
            </td>
          </tr>
        `;
      }).join('');

      tbody.querySelectorAll('.btn-view-sale').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-sale-id');
          try {
            const sale = await db.getSaleById(id);
            modal.open({
              title: `Comprovante #${sale.receipt_number}`,
              contentHtml: receipts.generateReceiptHtml(sale, state.activeStore),
              footerHtml: `
                <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: flex-end; width: 100%;">
                  <button class="btn btn-secondary" id="btn-m-close">Fechar</button>
                  <button class="btn btn-secondary" id="btn-m-copy" title="Copiar recibo para colar onde quiser">📋 Copiar Recibo</button>
                  <button class="btn btn-secondary" id="btn-m-sms" title="Partilhar por SMS">💬 Partilhar por SMS</button>
                  <button class="btn btn-secondary" id="btn-m-wa" title="Enviar pelo WhatsApp">📱 WhatsApp</button>
                  <button class="btn btn-primary" id="btn-m-print">🖨️ Imprimir</button>
                </div>
              `
            });

            document.getElementById('btn-m-close')?.addEventListener('click', () => modal.close());
            document.getElementById('btn-m-copy')?.addEventListener('click', () => {
              receipts.copyReceipt(sale, state.activeStore);
            });
            document.getElementById('btn-m-sms')?.addEventListener('click', () => {
              receipts.shareSMS(sale, state.activeStore);
            });
            document.getElementById('btn-m-wa')?.addEventListener('click', () => {
              receipts.shareWhatsApp(sale, state.activeStore);
            });
            document.getElementById('btn-m-print')?.addEventListener('click', () => {
              receipts.printReceipt(sale, state.activeStore);
            });
          } catch (e) {
            notify.error('Erro ao abrir recibo.');
          }
        });
      });

      tbody.querySelectorAll('.btn-reverse-sale').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-sale-id');
          const sale = this.sales.find(s => s.id === id);
          if (sale) {
            this.openReverseSaleModal(sale, container);
          }
        });
      });
    } catch (e) {
      console.error('Error loading sales:', e);
      notify.error('Erro ao consultar vendas.');
    }
  },

  openReverseSaleModal(sale, container) {
    const modalContent = `
      <div class="badge badge-danger" style="margin-bottom: 1rem; width: 100%; text-align: center; padding: 0.5rem;">
        Atenção: O cancelamento desta venda devolverá automaticamente os itens aos seus respectivos lotes de origem.
      </div>

      <p style="margin-bottom: 1rem;">
        Deseja estornar a venda <strong>#${escapeHtml(sale.receipt_number)}</strong> no valor de <strong>${formatCurrency(sale.total_net)}</strong>?
      </p>

      <div class="form-group">
        <label class="form-label">Motivo do Estorno / Cancelamento *</label>
        <textarea id="m-reverse-reason" class="form-control" rows="3" placeholder="Ex: Desistência do cliente, produto incorreto..." required></textarea>
      </div>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" id="m-btn-cancel-rev">Voltar</button>
      <button class="btn btn-danger" id="m-btn-confirm-rev">Confirmar Estorno e Devolução ao Estoque</button>
    `;

    const overlay = modal.open({
      title: 'Estorno de Venda (Reversão de Estoque)',
      contentHtml: modalContent,
      footerHtml,
      size: 'md'
    });

    overlay.querySelector('#m-btn-cancel-rev')?.addEventListener('click', () => modal.close());

    overlay.querySelector('#m-btn-confirm-rev')?.addEventListener('click', async () => {
      const reason = overlay.querySelector('#m-reverse-reason').value.trim();
      if (!reason) {
        notify.error('Informe o motivo do estorno.');
        return;
      }

      try {
        await db.reverseSale(sale.id, reason);
        modal.close();
        notify.success(`Venda #${sale.receipt_number} estornada com sucesso. Estoque recomposto.`);
        await this.loadSales(container);
      } catch (err) {
        notify.error(err.message || 'Erro ao estornar venda.');
      }
    });
  }
};
