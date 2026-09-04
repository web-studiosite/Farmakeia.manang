/**
 * FARMAKEIA — System Settings & Multi-Store Management Module
 */

import { config } from './config.js';
import { testSupabaseConnection, resetSupabaseClient } from './supabase.js';
import { db } from './database.js';
import { state } from './state.js';
import { auth } from './auth.js';
import { escapeHtml } from './utils.js';
import { notify } from './notifications.js';
import { modal } from './modal.js';

export const settingsView = {
  async render(container) {
    const store = state.activeStore;
    const currentUrl = config.getSupabaseUrl();
    const currentKey = config.getSupabaseAnonKey();

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
        <div>
          <h2 style="font-size: 1.5rem; font-weight: 700;">Configurações & Conexão Supabase</h2>
          <p style="font-size: 0.875rem; color: var(--text-muted);">
            Configurações da farmácia ativa, dados fiscais, comprovantes térmicos e chaves do banco de dados.
          </p>
        </div>
      </div>

      <!-- Supabase Connection Card -->
      <div class="card" style="margin-bottom: 1.5rem;">
        <div class="card-header">
          <div class="card-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
            Credenciais do Supabase (Banco de Dados em Nuvem)
          </div>
          <span class="badge ${config.isConfigured() ? 'badge-success' : 'badge-danger'}">
            ${config.isConfigured() ? 'CONFIGURADO' : 'NÃO CONFIGURADO'}
          </span>
        </div>

        <div class="form-group">
          <label class="form-label">Supabase Project URL</label>
          <input type="text" id="cfg-supabase-url" class="form-control" value="${escapeHtml(currentUrl)}" placeholder="https://xyzcompany.supabase.co" />
        </div>

        <div class="form-group">
          <label class="form-label">Supabase Anon Public Key</label>
          <input type="password" id="cfg-supabase-anon-key" class="form-control" value="${escapeHtml(currentKey)}" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." />
        </div>

        <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
          <button class="btn btn-secondary" id="btn-test-supabase">Testar Conexão</button>
          <button class="btn btn-primary" id="btn-save-supabase">Salvar e Reiniciar Cliente</button>
        </div>
      </div>

      <!-- Store & Receipt Settings (Admin only) -->
      ${state.isAdmin() ? `
        <div class="card" style="margin-bottom: 1.5rem;">
          <div class="card-header">
            <div class="card-title">Dados da Farmácia & Impressão Térmica</div>
            ${store ? `<span class="badge badge-info">ID: ${store.id.substring(0, 8)}</span>` : ''}
          </div>

          <div class="form-row">
            <div class="form-group" style="grid-column: span 2;">
              <label class="form-label">Nome Fantasia da Farmácia *</label>
              <input type="text" id="cfg-store-name" class="form-control" value="${escapeHtml(store?.name || '')}" placeholder="FARMAKEIA - Drogaria Central" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">CNPJ / NIF</label>
              <input type="text" id="cfg-store-tax" class="form-control" value="${escapeHtml(store?.cnpj_nif || '')}" placeholder="00.000.000/0001-00" />
            </div>
            <div class="form-group">
              <label class="form-label">Telefone / WhatsApp</label>
              <input type="text" id="cfg-store-phone" class="form-control" value="${escapeHtml(store?.phone || '')}" placeholder="(11) 99999-9999" />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Endereço Completo</label>
            <input type="text" id="cfg-store-address" class="form-control" value="${escapeHtml(store?.address || '')}" placeholder="Av. Principal, 100 - Centro" />
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Cabeçalho do Recibo Térmico</label>
              <input type="text" id="cfg-store-header" class="form-control" value="${escapeHtml(store?.receipt_header || 'Drogaria & Manipulação')}" />
            </div>
            <div class="form-group">
              <label class="form-label">Rodapé do Recibo Térmico</label>
              <input type="text" id="cfg-store-footer" class="form-control" value="${escapeHtml(store?.receipt_footer || 'Obrigado pela preferência!')}" />
            </div>
          </div>

          <div style="margin-top: 1rem; text-align: right;">
            <button class="btn btn-primary" id="btn-save-store-details">Salvar Informações da Farmácia</button>
          </div>
        </div>

        <!-- Multi-store Branches -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">Filiais & Unidades (Multi-loja)</div>
            <button class="btn btn-secondary btn-sm" id="btn-create-store-branch">+ Nova Filial</button>
          </div>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Nome da Unidade</th>
                  <th>CNPJ / NIF</th>
                  <th>Telefone</th>
                  <th>Status</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                ${state.userStores.map(s => `
                  <tr>
                    <td><strong>${escapeHtml(s.name)}</strong> ${s.id === store?.id ? '<span class="badge badge-success">ATIVA</span>' : ''}</td>
                    <td>${escapeHtml(s.cnpj_nif || '—')}</td>
                    <td>${escapeHtml(s.phone || '—')}</td>
                    <td><span class="badge ${s.active ? 'badge-success' : 'badge-gray'}">${s.active ? 'Ativa' : 'Inativa'}</span></td>
                    <td>
                      ${s.id !== store?.id ? `
                        <button class="btn btn-secondary btn-sm btn-switch-store" data-store-id="${s.id}">Alternar para esta</button>
                      ` : `
                        <span style="font-size:0.8rem; color:var(--text-muted);">Unidade Selecionada</span>
                      `}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}
    `;

    this.initEvents(container);
  },

  initEvents(container) {
    const testBtn = container.querySelector('#btn-test-supabase');
    const saveSupabaseBtn = container.querySelector('#btn-save-supabase');
    const saveStoreBtn = container.querySelector('#btn-save-store-details');
    const newStoreBtn = container.querySelector('#btn-create-store-branch');

    testBtn?.addEventListener('click', async () => {
      const url = container.querySelector('#cfg-supabase-url').value.trim();
      const key = container.querySelector('#cfg-supabase-anon-key').value.trim();
      testBtn.disabled = true;
      testBtn.textContent = 'Testando...';

      const res = await testSupabaseConnection(url, key);
      if (res.success) {
        notify.success(res.message);
      } else {
        notify.error(`Falha: ${res.message}`);
      }
      testBtn.disabled = false;
      testBtn.textContent = 'Testar Conexão';
    });

    saveSupabaseBtn?.addEventListener('click', () => {
      const url = container.querySelector('#cfg-supabase-url').value.trim();
      const key = container.querySelector('#cfg-supabase-anon-key').value.trim();

      config.setSupabaseCredentials(url, key);
      resetSupabaseClient();
      notify.success('Configurações salvas com sucesso! Recarregando...');
      setTimeout(() => location.reload(), 800);
    });

    if (saveStoreBtn) {
      saveStoreBtn.addEventListener('click', async () => {
        const name = container.querySelector('#cfg-store-name').value.trim();
        const tax = container.querySelector('#cfg-store-tax').value.trim();
        const phone = container.querySelector('#cfg-store-phone').value.trim();
        const address = container.querySelector('#cfg-store-address').value.trim();
        const header = container.querySelector('#cfg-store-header').value.trim();
        const footer = container.querySelector('#cfg-store-footer').value.trim();

        if (!name) {
          notify.error('Informe o nome da farmácia.');
          return;
        }

        saveStoreBtn.disabled = true;

        try {
          if (state.activeStore?.id) {
            const updated = await db.updateStore(state.activeStore.id, {
              name,
              cnpj_nif: tax || null,
              phone: phone || null,
              address: address || null,
              receipt_header: header,
              receipt_footer: footer
            });
            state.setActiveStore(updated);
            notify.success('Dados da farmácia atualizados com sucesso!');
          } else {
            const created = await db.createStore({
              name,
              cnpj_nif: tax || null,
              phone: phone || null,
              address: address || null,
              receipt_header: header,
              receipt_footer: footer
            });
            state.setActiveStore(created);
            notify.success('Farmácia cadastrada com sucesso!');
          }
          await auth.loadUserData(state.user);
          await this.render(container);
        } catch (err) {
          notify.error(err.message || 'Erro ao salvar dados da farmácia.');
          saveStoreBtn.disabled = false;
        }
      });
    }

    if (newStoreBtn) {
      newStoreBtn.addEventListener('click', () => this.openCreateStoreModal(container));
    }

    container.querySelectorAll('.btn-switch-store').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-store-id');
        const st = state.userStores.find(s => s.id === id);
        if (st) {
          state.setActiveStore(st);
          await auth.syncActiveCashSession(st.id, state.user.id);
          notify.success(`Alternado para: ${st.name}`);
          await this.render(container);
        }
      });
    });
  },

  openCreateStoreModal(container) {
    const modalContent = `
      <div class="form-group">
        <label class="form-label">Nome da Nova Filial / Unidade *</label>
        <input type="text" id="m-store-name" class="form-control" placeholder="Ex: FARMAKEIA - Filial Shopping" required />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">CNPJ / NIF</label>
          <input type="text" id="m-store-tax" class="form-control" placeholder="00.000.000/0002-00" />
        </div>
        <div class="form-group">
          <label class="form-label">Telefone</label>
          <input type="text" id="m-store-phone" class="form-control" placeholder="(11) 99999-0000" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Endereço Completo</label>
        <input type="text" id="m-store-address" class="form-control" placeholder="Endereço da nova filial..." />
      </div>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" id="m-btn-cancel-store">Cancelar</button>
      <button class="btn btn-primary" id="m-btn-save-store">Criar Filial</button>
    `;

    const overlay = modal.open({
      title: 'Cadastrar Nova Filial de Farmácia',
      contentHtml: modalContent,
      footerHtml,
      size: 'md'
    });

    overlay.querySelector('#m-btn-cancel-store')?.addEventListener('click', () => modal.close());

    overlay.querySelector('#m-btn-save-store')?.addEventListener('click', async () => {
      const name = overlay.querySelector('#m-store-name').value.trim();
      const tax = overlay.querySelector('#m-store-tax').value.trim();
      const phone = overlay.querySelector('#m-store-phone').value.trim();
      const address = overlay.querySelector('#m-store-address').value.trim();

      if (!name) {
        notify.error('Informe o nome da filial.');
        return;
      }

      try {
        const newStore = await db.createStore({
          name,
          cnpj_nif: tax || null,
          phone: phone || null,
          address: address || null
        });

        modal.close();
        notify.success(`Filial "${name}" criada com sucesso!`);
        await auth.loadUserData(state.user);
        await this.render(container);
      } catch (err) {
        notify.error(err.message || 'Erro ao criar filial.');
      }
    });
  }
};
