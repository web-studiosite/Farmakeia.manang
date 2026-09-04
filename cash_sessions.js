/**
 * FARMAKEIA — Cash Sessions, Sangrias & Closings Module
 * Opening, blind cash counts, reconciliation, sangrias, and history.
 */

import { db } from './database.js';
import { state } from './state.js';
import { auth } from './auth.js';
import { formatCurrency, formatDateTime, escapeHtml } from './utils.js';
import { notify } from './notifications.js';
import { modal } from './modal.js';

export const cashSessionsView = {
  async render(container) {
    if (!state.activeStore) {
      container.innerHTML = `<div class="empty-state"><h3>Selecione uma farmácia.</h3></div>`;
      return;
    }

    const session = state.activeCashSession;

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
        <div>
          <h2 style="font-size: 1.5rem; font-weight: 700;">Controle de Caixa & Sangrias</h2>
          <p style="font-size: 0.875rem; color: var(--text-muted);">
            Abertura de turnos, retiradas para cofre/banco (sangrias) e conciliação de fechamento cego.
          </p>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          ${!session ? `
            <button class="btn btn-primary" id="btn-open-new-session">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="12" x="2" y="6" rx="2"></rect><circle cx="12" cy="12" r="2"></circle><path d="M6 12h.01M18 12h.01"></path></svg>
              Abrir Nova Sessão de Caixa
            </button>
          ` : `
            <button class="btn btn-secondary" id="btn-perform-sangria">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"></path><path d="m17 5-5-3-5 3"></path><path d="m17 19-5 3-5-3"></path></svg>
              Registrar Sangria
            </button>
            <button class="btn btn-danger" id="btn-close-active-session">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
              Fechar Caixa (Contagem Cega)
            </button>
          `}
        </div>
      </div>

      <!-- Active Session Summary Card -->
      ${session ? `
        <div class="card" style="margin-bottom: 1.5rem; border-color: rgba(16, 185, 129, 0.4);">
          <div class="card-header">
            <div class="card-title">
              <span class="cash-dot"></span>
              Sessão em Andamento #${session.id.substring(0, 8)} (${escapeHtml(session.cash_registers?.name || 'Terminal Padrão')})
            </div>
            <span class="badge badge-success">CAIXA ABERTO</span>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 0.5rem;">
            <div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">Aberto em:</div>
              <strong>${formatDateTime(session.opened_at)}</strong>
            </div>
            <div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">Fundo de Troco Inicial:</div>
              <strong>${formatCurrency(session.initial_cash)}</strong>
            </div>
            <div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">Dinheiro Esperado em Gaveta:</div>
              <strong style="color: var(--color-primary); font-size: 1.1rem;">${formatCurrency(session.expected_cash)}</strong>
            </div>
            <div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">Aberto por:</div>
              <strong>${escapeHtml(session.profiles?.full_name || session.profiles?.email || state.profile?.full_name || 'Operador')}</strong>
            </div>
          </div>
        </div>
      ` : `
        <div class="empty-state" style="margin-bottom: 1.5rem;">
          <p>Nenhuma sessão de caixa está aberta nesta farmácia no momento. Abra uma nova sessão para iniciar as vendas.</p>
        </div>
      `}

      <!-- Recent Cash Movements (Sangrias e Entradas) -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">Movimentações de Caixa & Sangrias</div>
        </div>
        <div class="table-responsive">
          <table class="data-table" id="movements-table">
            <thead>
              <tr>
                <th>Horário</th>
                <th>Tipo</th>
                <th>Forma</th>
                <th>Valor</th>
                <th>Destino / Motivo</th>
                <th>Operador</th>
              </tr>
            </thead>
            <tbody id="movements-tbody">
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

    await this.loadMovements(container, session?.id);
    this.initEvents(container);
  },

  async loadMovements(container, sessionId) {
    try {
      const movements = await db.getCashMovements(sessionId);
      const tbody = container.querySelector('#movements-tbody');
      if (!tbody) return;

      if (movements.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">
              Nenhuma movimentação avulsa registrada.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = movements.map(m => `
        <tr>
          <td>${formatDateTime(m.created_at)}</td>
          <td>
            <span class="badge ${m.movement_type === 'SANGRIA' ? 'badge-danger' : m.movement_type === 'SUPPLY' ? 'badge-success' : 'badge-info'}">
              ${m.movement_type}
            </span>
          </td>
          <td>${m.payment_method}</td>
          <td><strong style="color: ${m.movement_type === 'SANGRIA' ? 'var(--color-danger)' : 'inherit'};">${formatCurrency(m.amount)}</strong></td>
          <td>${escapeHtml(m.destination ? `[${m.destination}] ${m.reason || ''}` : m.reason || '—')}</td>
          <td>${escapeHtml(m.profiles?.full_name || 'Operador')}</td>
        </tr>
      `).join('');
    } catch (e) {
      console.error('Error loading movements:', e);
    }
  },

  initEvents(container) {
    const openBtn = container.querySelector('#btn-open-new-session');
    const sangriaBtn = container.querySelector('#btn-perform-sangria');
    const closeBtn = container.querySelector('#btn-close-active-session');

    if (openBtn) {
      openBtn.addEventListener('click', () => this.openSessionModal(container));
    }
    if (sangriaBtn) {
      sangriaBtn.addEventListener('click', () => this.openSangriaModal(container));
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.openCloseSessionModal(container));
    }
  },

  async openSessionModal(container) {
    try {
      const registers = await db.getCashRegisters();

      const modalContent = `
        <div class="form-group">
          <label class="form-label">Terminal de Caixa *</label>
          <select id="m-open-register" class="form-select">
            ${registers.map(r => `<option value="${r.id}">${escapeHtml(r.name)} (${r.code})</option>`).join('')}
            ${registers.length === 0 ? `<option value="">Caixa Principal</option>` : ''}
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Fundo de Troco Inicial (MT) *</label>
          <input type="number" id="m-open-initial-cash" class="form-control" step="0.50" min="0" value="100.00" />
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">Valor em notas e moedas presente na gaveta para troco.</div>
        </div>

        <div class="form-group">
          <label class="form-label">Observações da Abertura</label>
          <input type="text" id="m-open-notes" class="form-control" placeholder="Observações opcionais..." />
        </div>
      `;

      const footerHtml = `
        <button class="btn btn-secondary" id="m-btn-cancel-open">Cancelar</button>
        <button class="btn btn-primary" id="m-btn-confirm-open">Abrir Caixa</button>
      `;

      const overlay = modal.open({
        title: 'Abertura de Sessão de Caixa',
        contentHtml: modalContent,
        footerHtml,
        size: 'sm'
      });

      overlay.querySelector('#m-btn-cancel-open')?.addEventListener('click', () => modal.close());

      overlay.querySelector('#m-btn-confirm-open')?.addEventListener('click', async () => {
        const regId = overlay.querySelector('#m-open-register').value;
        const initialCash = Number(overlay.querySelector('#m-open-initial-cash').value) || 0;
        const notes = overlay.querySelector('#m-open-notes').value.trim();

        try {
          const newSession = await db.openCashSession(regId, initialCash, notes);
          state.setActiveCashSession(newSession);
          modal.close();
          notify.success('Caixa aberto com sucesso! Boas vendas.');
          await this.render(container);
        } catch (err) {
          notify.error(err.message || 'Erro ao abrir sessão de caixa.');
        }
      });
    } catch (e) {
      notify.error('Erro ao consultar terminais de caixa.');
    }
  },

  openSangriaModal(container) {
    const session = state.activeCashSession;
    if (!session) return;

    const modalContent = `
      <p style="color: var(--text-muted); margin-bottom: 1rem;">
        Registre uma retirada física de dinheiro da gaveta do caixa para cofre ou depósito bancário.
      </p>

      <div class="form-group">
        <label class="form-label">Valor da Sangria (MT) *</label>
        <input type="number" id="m-sangria-amount" class="form-control" step="1.00" min="1" placeholder="0.00" />
      </div>

      <div class="form-group">
        <label class="form-label">Destino do Dinheiro *</label>
        <select id="m-sangria-destination" class="form-select">
          <option value="COFRE">Cofre / Proprietário (Sócio)</option>
          <option value="BANCO">Depósito em Conta Bancária</option>
          <option value="OUTRO">Outro Destino</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Motivo / Justificativa *</label>
        <input type="text" id="m-sangria-reason" class="form-control" placeholder="Ex: Excesso de numerário em gaveta" required />
      </div>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" id="m-btn-cancel-sangria">Cancelar</button>
      <button class="btn btn-danger" id="m-btn-confirm-sangria">Efetuar Sangria</button>
    `;

    const overlay = modal.open({
      title: 'Registrar Sangria de Caixa',
      contentHtml: modalContent,
      footerHtml,
      size: 'sm'
    });

    overlay.querySelector('#m-btn-cancel-sangria')?.addEventListener('click', () => modal.close());

    overlay.querySelector('#m-btn-confirm-sangria')?.addEventListener('click', async () => {
      const amount = Number(overlay.querySelector('#m-sangria-amount').value) || 0;
      const destination = overlay.querySelector('#m-sangria-destination').value;
      const reason = overlay.querySelector('#m-sangria-reason').value.trim();

      if (amount <= 0) {
        notify.error('Informe um valor válido.');
        return;
      }
      if (!reason) {
        notify.error('Informe o motivo da sangria.');
        return;
      }

      try {
        await db.registerSangria(session.id, amount, destination, reason, '');
        modal.close();
        notify.success(`Sangria de ${formatCurrency(amount)} registrada com sucesso!`);
        await auth.syncActiveCashSession(state.activeStore.id);
        await this.render(container);
      } catch (err) {
        notify.error(err.message || 'Erro ao registrar sangria.');
      }
    });
  },

  openCloseSessionModal(container) {
    const session = state.activeCashSession;
    if (!session) return;

    const modalContent = `
      <div class="badge badge-warning" style="margin-bottom: 1rem; width: 100%; text-align: center; padding: 0.5rem;">
        Fechamento Cego: Conte o dinheiro físico na gaveta e insira o valor apurado.
      </div>

      <div class="form-group">
        <label class="form-label">Total Físico Contado em Dinheiro (MT) *</label>
        <input type="number" id="m-close-counted-cash" class="form-control" step="0.50" min="0" placeholder="0.00" autofocus />
      </div>

      <div class="form-group">
        <label class="form-label">Observações Finais do Fechamento</label>
        <textarea id="m-close-notes" class="form-control" rows="2" placeholder="Observações sobre eventuais divergências..."></textarea>
      </div>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" id="m-btn-cancel-close">Cancelar</button>
      <button class="btn btn-danger" id="m-btn-confirm-close">Encerrar Sessão e Conciliar</button>
    `;

    const overlay = modal.open({
      title: 'Fechamento de Sessão de Caixa',
      contentHtml: modalContent,
      footerHtml,
      size: 'md'
    });

    overlay.querySelector('#m-btn-cancel-close')?.addEventListener('click', () => modal.close());

    overlay.querySelector('#m-btn-confirm-close')?.addEventListener('click', async () => {
      const counted = Number(overlay.querySelector('#m-close-counted-cash').value) || 0;
      const notes = overlay.querySelector('#m-close-notes').value.trim();

      try {
        const closingResult = await db.closeCashSession(session.id, counted, notes);
        modal.close();

        // Show detailed closing reconciliation report
        const diff = Number(closingResult.difference) || 0;
        const diffClass = diff === 0 ? 'badge-success' : diff > 0 ? 'badge-info' : 'badge-danger';
        const diffText = diff === 0 ? 'Exato (Sem divergência)' : diff > 0 ? `Sobra de ${formatCurrency(diff)}` : `Falta de ${formatCurrency(Math.abs(diff))}`;

        modal.open({
          title: 'Resumo de Fechamento de Caixa',
          contentHtml: `
            <div style="display: flex; flex-direction: column; gap: 0.75rem; padding: 0.5rem 0;">
              <div style="display: flex; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">
                <span>Dinheiro Esperado:</span>
                <strong>${formatCurrency(closingResult.expected_cash)}</strong>
              </div>
              <div style="display: flex; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">
                <span>Dinheiro Contado:</span>
                <strong>${formatCurrency(closingResult.counted_cash)}</strong>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Resultado da Conciliação:</span>
                <span class="badge ${diffClass}">${diffText}</span>
              </div>
            </div>
          `,
          footerHtml: `<button class="btn btn-primary" onclick="location.hash='#dashboard'">Concluir</button>`
        });

        state.setActiveCashSession(null);
        await this.render(container);
      } catch (err) {
        notify.error(err.message || 'Erro ao encerrar sessão de caixa.');
      }
    });
  }
};
