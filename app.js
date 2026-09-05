/**
 * FARMAKEIA — Pharmacy Management System
 * Main Application Orchestrator & Shell Renderer
 */

import { auth } from './auth.js';
import { state } from './state.js';
import { router } from './router.js';
import { config } from './config.js';
import { notify } from './notifications.js';
import { escapeHtml } from './utils.js';
import { i18n, t } from './i18n.js';

export const app = {
  async init() {
    // Apply saved theme
    config.setTheme(config.getTheme());

    const root = document.getElementById('app');
    if (!root) return;

    root.innerHTML = `
      <div style="display: flex; height: 100vh; justify-content: center; align-items: center;">
        <div class="skeleton" style="width: 250px; height: 40px;"></div>
      </div>
    `;

    // Listen to Language changes to re-render shell and active route immediately
    i18n.onChange(() => {
      if (state.user) {
        this.renderAppShell(root);
        router.handleRoute();
      } else {
        this.renderLoginScreen(root);
      }
    });

    // Listen to Auth State
    await auth.initAuth((user) => {
      if (!user) {
        this.renderLoginScreen(root);
      } else {
        this.renderAppShell(root);
        router.init();
      }
    });

    // Global keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F2') {
        e.preventDefault();
        location.hash = '#pos';
      }
    });
  },

  /**
   * Renders Modern, Medical-themed Authentication View with Language Toggle
   */
  renderLoginScreen(container) {
    const isPt = i18n.getLanguage() === 'pt';

    container.innerHTML = `
      <div class="auth-container" style="min-height: 100vh; display: flex; align-items: center; justify-content: center;">
        <div class="card auth-card" style="position: relative;">
          <!-- Top Right Language Switcher on Login Screen -->
          <div style="position: absolute; top: 1rem; right: 1rem;">
            <button class="btn btn-secondary btn-sm" id="btn-login-toggle-lang" style="font-weight: 700; font-size: 0.8rem; padding: 0.25rem 0.55rem; display: flex; align-items: center; gap: 0.35rem;">
              <span>🌐</span>
              <span>${isPt ? 'PT | EN' : 'EN | PT'}</span>
            </button>
          </div>

          <div class="auth-header" style="margin-top: 0.5rem; width: 100%; text-align: center; display: flex; flex-direction: column; align-items: center;">
  <div class="auth-logo">
    <svg width="100" height="100" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g transform="rotate(-45 24 24)">
        <path d="M16 12C16 7.58172 19.5817 4 24 4C28.4183 4 32 7.58172 32 12V24H16V12Z" fill="#10B981"/>
        <path d="M16 24H32V36C32 40.4183 28.4183 44 24 44C19.5817 44 16 40.4183 16 36V24Z" fill="#0EA5E9"/>
        <line x1="14" y1="24" x2="34" y2="24" stroke="#0F172A" stroke-width="2.5"/>
        <path d="M20 9C20 7.8 21.2 6.5 23 6.5" stroke="white" stroke-width="2.2" stroke-linecap="round" opacity="0.85"/>
        <path d="M20 28V34" stroke="white" stroke-width="1.8" stroke-linecap="round" opacity="0.4"/>
      </g>
    </svg>
  </div>

  <h1 class="auth-title">${t('app_name')}</h1>
  <p class="auth-subtitle">${t('app_tagline')}</p>
</div>

          <div id="auth-alert" style="display: none; margin-bottom: 1rem;"></div>

          <form id="auth-form">
            <div class="form-group">
              <label class="form-label">${t('auth_email')}</label>
              <input type="email" id="auth-email" class="form-control" placeholder="admin@farmakeia.com" required autocomplete="email" />
            </div>

            <div class="form-group">
              <label class="form-label">${t('auth_pass')}</label>
              <input type="password" id="auth-password" class="form-control" placeholder="••••••••" required autocomplete="current-password" />
            </div>

            <div id="auth-extra-fields" style="display: none;">
              <div class="form-group">
                <label class="form-label">${t('auth_fullname')}</label>
                <input type="text" id="auth-fullname" class="form-control" placeholder="Dr(a). Farmacêutico(a)" />
              </div>
              <div class="form-group">
                <label class="form-label">${t('auth_role')}</label>
                <select id="auth-role" class="form-select">
                  <option value="ADMIN">${t('auth_admin_option')}</option>
                  <option value="CASHIER">${t('auth_cashier_option')}</option>
                </select>
              </div>
            </div>

            <button type="submit" class="btn btn-primary btn-lg" id="btn-auth-submit" style="width: 100%; margin-top: 1rem;">
              ${t('auth_login_btn')}
            </button>

            <!-- Quick Demo Login Button -->
            <button type="button" class="btn btn-secondary" id="btn-demo-quick-login" style="width: 100%; margin-top: 0.6rem; display: none; align-items: center; justify-content: center; gap: 0.5rem; font-weight: 600; background: var(--bg-hover); border: 1px dashed var(--border-color);">
              <span>⚡</span>
              <span>${isPt ? 'Entrar em Modo Demonstração (Offline)' : 'Quick Demo Mode Login (Offline)'}</span>
            </button>
          </form>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1.5rem; font-size: 0.85rem; border-top: 1px solid var(--border-color); padding-top: 1rem;">
            <a href="javascript:void(0)" id="link-toggle-auth-mode" style="color: var(--color-primary); font-weight: 600;">
              ${t('auth_create_admin')}
            </a>
            <a href="#settings" id="link-setup-supabase" style="color: var(--text-muted);">
              ${t('auth_config_supabase')}
            </a>
          </div>
        </div>
      </div>
    `;

    container.querySelector('#btn-login-toggle-lang')?.addEventListener('click', () => {
      i18n.toggleLanguage();
    });

    let isSignUp = false;
    const form = container.querySelector('#auth-form');
    const toggleLink = container.querySelector('#link-toggle-auth-mode');
    const extraFields = container.querySelector('#auth-extra-fields');
    const submitBtn = container.querySelector('#btn-auth-submit');
    const alertBox = container.querySelector('#auth-alert');
    const setupLink = container.querySelector('#link-setup-supabase');
    const quickDemoBtn = container.querySelector('#btn-demo-quick-login');

    quickDemoBtn?.addEventListener('click', async () => {
      try {
        quickDemoBtn.disabled = true;
        quickDemoBtn.textContent = isPt ? 'Iniciando demonstração...' : 'Starting demo...';
        await auth.loginDemoUser('ADMIN', 'admin@farmakeia.com');
        notify.success(isPt ? 'Bem-vindo ao FARMAKEIA (Modo Demonstração)!' : 'Welcome to FARMAKEIA (Demo Mode)!');
      } catch (err) {
        console.error('Demo login error:', err);
        quickDemoBtn.disabled = false;
        quickDemoBtn.innerHTML = `<span>⚡</span><span>${isPt ? 'Entrar em Modo Demonstração (Offline)' : 'Quick Demo Mode Login (Offline)'}</span>`;
      }
    });

    toggleLink?.addEventListener('click', () => {
      isSignUp = !isSignUp;
      if (extraFields && submitBtn && toggleLink) {
        if (isSignUp) {
          extraFields.style.display = 'block';
          submitBtn.textContent = t('auth_signup_btn');
          toggleLink.textContent = t('auth_has_account');
        } else {
          extraFields.style.display = 'none';
          submitBtn.textContent = t('auth_login_btn');
          toggleLink.textContent = t('auth_create_admin');
        }
      }
    });

    setupLink?.addEventListener('click', (e) => {
      e.preventDefault();
      import('./settings.js').then(m => {
        import('./modal.js').then(mod => {
          mod.modal.open({
            title: isPt ? 'Configurar Credenciais do Supabase' : 'Configure Supabase Credentials',
            contentHtml: `
              <p style="color: var(--text-muted); margin-bottom: 1rem;">
                ${isPt ? 'Insira a URL e a Chave Anônima do seu projeto Supabase:' : 'Enter your Supabase Project URL and Anon Public Key:'}
              </p>
              <div class="form-group">
                <label class="form-label">Supabase URL</label>
                <input type="text" id="m-supabase-url" class="form-control" value="${config.getSupabaseUrl()}" placeholder="https://xxx.supabase.co" />
              </div>
              <div class="form-group">
                <label class="form-label">Supabase Anon Public Key</label>
                <input type="password" id="m-supabase-key" class="form-control" value="${config.getSupabaseAnonKey()}" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." />
              </div>
            `,
            footerHtml: `
              <button class="btn btn-secondary" onclick="this.closest('.modal-overlay')?.remove()">${t('cancel')}</button>
              <button class="btn btn-primary" id="btn-save-m-sup">${t('save')}</button>
            `
          });

          document.getElementById('btn-save-m-sup')?.addEventListener('click', () => {
            const u = document.getElementById('m-supabase-url')?.value.trim() || '';
            const k = document.getElementById('m-supabase-key')?.value.trim() || '';
            config.setSupabaseCredentials(u, k);
            notify.success(isPt ? 'Configurações salvas!' : 'Settings saved successfully!');
            setTimeout(() => location.reload(), 500);
          });
        });
      });
    });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = container.querySelector('#auth-email')?.value || '';
      const password = container.querySelector('#auth-password')?.value || '';
      const fullName = container.querySelector('#auth-fullname')?.value || '';
      const role = container.querySelector('#auth-role')?.value || 'ADMIN';

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = isPt ? 'Autenticando...' : 'Authenticating...';
      }
      if (alertBox) alertBox.style.display = 'none';

      try {
        if (isSignUp) {
          await auth.signUp(email, password, fullName, role);
          notify.success(isPt ? 'Conta criada com sucesso!' : 'Account registered successfully!');
        } else {
          await auth.signIn(email, password);
          notify.success(isPt ? 'Login efetuado com sucesso!' : 'Logged in successfully!');
        }
      } catch (err) {
        console.error('Auth error:', err);
        if (alertBox) {
          alertBox.style.display = 'block';
          alertBox.className = 'badge badge-danger';
          alertBox.style.padding = '0.75rem';
          alertBox.style.width = '100%';

          const isFetchErr = err?.message?.includes('fetch') || err?.name === 'TypeError';
          if (isFetchErr) {
            alertBox.innerHTML = `
              <div style="margin-bottom: 0.5rem; text-align: left; line-height: 1.4;">
                <strong>${isPt ? 'Aviso de Conexão (Supabase)' : 'Connection Notice (Supabase)'}</strong><br>
                <span>${isPt ? 'O servidor Supabase está temporariamente inacessível nesta rede/navegador.' : 'Supabase is temporarily unreachable in this network/browser environment.'}</span>
              </div>
              <button type="button" class="btn btn-secondary btn-sm" id="btn-fallback-enter-demo" style="width: 100%; font-weight: 700;">
                ⚡ ${isPt ? 'Entrar em Modo Demonstração (Offline)' : 'Enter Demo Mode (Offline)'}
              </button>
            `;
            alertBox.querySelector('#btn-fallback-enter-demo')?.addEventListener('click', async () => {
              await auth.loginDemoUser(role, email || 'admin@farmakeia.com');
              notify.success(isPt ? 'Modo Demonstração ativado!' : 'Demo Mode activated!');
            });
          } else {
            alertBox.textContent = err.message || (isPt ? 'Falha na autenticação. Verifique suas credenciais.' : 'Authentication failed. Check credentials.');
          }
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = isSignUp ? t('auth_signup_btn') : t('auth_login_btn');
        }
      }
    });
  },

  /**
   * Renders Main Dashboard & System Shell (Top Header + Sidebar + Main Work Area)
   */
  renderAppShell(container) {
    const user = state.user;
    const profile = state.profile;
    const role = state.getRole();
    const isAdmin = state.isAdmin();
    const activeStore = state.activeStore;
    const session = state.activeCashSession;
    const currentLang = i18n.getLanguage();
    const isPt = currentLang === 'pt';

    container.innerHTML = `
      <div class="app-layout">
        <!-- Top Application Header -->
        <header class="app-header">
          <div style="display: flex; align-items: center; gap: 1rem;">
            <button class="btn btn-secondary btn-sm" id="btn-toggle-sidebar" style="display: none;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
            </button>
            <div class="app-brand-wrapper">
              <div id="brand-home-link" class="app-brand" role="button" tabindex="0" title="${isPt ? 'Ir para Página Inicial' : 'Go to Home'}">
                <div class="brand-capsule-badge">
                  <svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <g transform="rotate(-45 24 24)">
                      <!-- Capsule Body Top/Left Half (Emerald) -->
                      <path d="M16 12C16 7.58172 19.5817 4 24 4C28.4183 4 32 7.58172 32 12V24H16V12Z" fill="#10B981"/>
                      <!-- Capsule Body Bottom/Right Half (Sky Blue) -->
                      <path d="M16 24H32V36C32 40.4183 28.4183 44 24 44C19.5817 44 16 40.4183 16 36V24Z" fill="#0EA5E9"/>
                      <!-- Waist Dividing Line -->
                      <line x1="14" y1="24" x2="34" y2="24" stroke="#0F172A" stroke-width="2.5"/>
                      <!-- Medical Capsule Shine / Highlights -->
                      <path d="M20 9C20 7.8 21.2 6.5 23 6.5" stroke="white" stroke-width="2.2" stroke-linecap="round" opacity="0.85"/>
                      <path d="M20 28V34" stroke="white" stroke-width="1.8" stroke-linecap="round" opacity="0.4"/>
                    </g>
                  </svg>
                </div>
                <div class="brand-titles">
                  <div class="brand-main-name">
                    ${t('app_name')}
                    <span class="brand-edition-tag">PRO</span>
                  </div>
                  <span class="brand-tagline">Sistema Farmacêutico</span>
                </div>
              </div>
            </div>

            <!-- Prominent Active Pharmacy Card -->
            <div class="active-pharmacy-card">
              <div class="active-pharmacy-indicator">
                <span class="pharmacy-pulse-dot"></span>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                  <polyline points="9 22 9 12 15 12 15 22"></polyline>
                </svg>
              </div>
              <div class="active-pharmacy-info">
                <div class="active-pharmacy-label">${isPt ? 'FARMÁCIA ATIVA' : 'ACTIVE PHARMACY'}</div>
                <div class="active-pharmacy-select-wrap">
                  <select id="header-store-selector" class="active-pharmacy-select" title="${isPt ? 'Trocar de Farmácia' : 'Switch Pharmacy'}">
                    ${state.userStores.map(s => `
                      <option value="${s.id}" ${s.id === activeStore?.id ? 'selected' : ''}>
                        ${escapeHtml(s.name)}
                      </option>
                    `).join('')}
                    ${state.userStores.length === 0 ? `<option value="">${t('no_store')}</option>` : ''}
                  </select>
                  <svg class="select-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
              </div>
            </div>
          </div>

          <!-- Right Header Controls -->
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <!-- Real Bilingual Toggle Button (PT | EN) -->
            <button class="btn btn-secondary btn-sm" id="btn-toggle-lang" title="Alterar Idioma / Switch Language" style="display: flex; align-items: center; gap: 0.35rem; padding: 0.35rem 0.65rem; font-weight: 700; border-radius: var(--radius-sm);">
              <span style="font-size: 0.95rem;">🌐</span>
              <span style="color: var(--color-primary);">${currentLang === 'pt' ? 'PT' : 'EN'}</span>
              <span style="color: var(--text-muted); font-size: 0.75rem;">/ ${currentLang === 'pt' ? 'EN' : 'PT'}</span>
            </button>

            <!-- POS Status Pill -->
            <a href="#pos" class="badge ${session ? 'badge-success' : 'badge-gray'}" style="text-decoration: none; padding: 0.4rem 0.75rem; font-size: 0.8rem; display: flex; align-items: center; gap: 0.4rem;">
              <span class="cash-dot" style="background-color: ${session ? '#10b981' : '#6b7280'};"></span>
              ${session ? t('cash_open') : t('cash_closed')}
            </a>

            <!-- User Profile & Role -->
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <div style="text-align: right;">
                <div style="font-weight: 600; font-size: 0.85rem;">${escapeHtml(profile?.full_name || user?.email?.split('@')[0])}</div>
                <div style="font-size: 0.7rem; color: var(--color-primary); font-weight: 700;">${role === 'ADMIN' ? t('admin').toUpperCase() : t('cashier').toUpperCase()}</div>
              </div>
              <button class="btn btn-secondary btn-sm" id="btn-logout" title="${t('logout')}" style="padding: 0.35rem 0.65rem;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
              </button>
            </div>
          </div>
        </header>

        <!-- Main Body: Sidebar + Dynamic Workspace -->
        <div class="app-body">
          <aside class="app-sidebar" id="app-sidebar">
            <nav class="sidebar-nav">
              <div class="sidebar-section-title">${t('nav_main')}</div>
              <a href="#dashboard" class="nav-link">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"></rect><rect width="7" height="5" x="14" y="3" rx="1"></rect><rect width="7" height="9" x="14" y="12" rx="1"></rect><rect width="7" height="5" x="3" y="16" rx="1"></rect></svg>
                ${t('nav_overview')}
              </a>
              <a href="#pos" class="nav-link">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
                ${t('nav_pos')}
              </a>

              <div class="sidebar-section-title">${t('nav_stock')}</div>
              ${isAdmin ? `
                <a href="#warehouse" class="nav-link">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path><polyline points="3.29 7 12 12 20.71 7"></polyline><line x1="12" y1="22" x2="12" y2="12"></line></svg>
                  ${t('nav_warehouse')}
                </a>
                <a href="#batches" class="nav-link">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                  ${t('nav_batches')}
                </a>
              ` : ''}
              <a href="#products" class="nav-link">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"></path><path d="m8.5 8.5 7 7"></path></svg>
                ${isAdmin ? t('nav_products') : t('nav_products_view')}
              </a>

              <div class="sidebar-section-title">${t('nav_ops')}</div>
              <a href="#cash-sessions" class="nav-link">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="12" x="2" y="6" rx="2"></rect><circle cx="12" cy="12" r="2"></circle><path d="M6 12h.01M18 12h.01"></path></svg>
                ${t('nav_sessions')}
              </a>
              <a href="#sales-history" class="nav-link">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                ${t('nav_history')}
              </a>

              ${isAdmin ? `
                <div class="sidebar-section-title">${t('nav_admin')}</div>
                <a href="#capital" class="nav-link">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"></path><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                  ${t('nav_capital')}
                </a>
                <a href="#closings" class="nav-link">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
                  ${t('nav_closings')}
                </a>
                <a href="#audit-logs" class="nav-link">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                  ${t('nav_audit')}
                </a>
              ` : ''}

              <div class="sidebar-section-title">${t('nav_admin')}</div>
              <a href="#settings" class="nav-link">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                ${t('nav_settings')}
              </a>
            </nav>
          </aside>

          <!-- Dynamic Workspace Work Area -->
          <main class="app-content" id="main-content-area">
            <!-- Rendered by Router -->
          </main>
        </div>
      </div>
    `;

    // Hook Header events
    container.querySelector('#brand-home-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      const targetHash = isAdmin ? '#dashboard' : '#pos';
      if (location.hash === targetHash) {
        router.handleRoute();
      } else {
        location.hash = targetHash;
      }
    });

    container.querySelector('#btn-toggle-lang')?.addEventListener('click', () => {
      i18n.toggleLanguage();
    });

    container.querySelector('#btn-logout')?.addEventListener('click', async () => {
      await auth.signOut();
      notify.info(currentLang === 'pt' ? 'Sessão encerrada com sucesso.' : 'Logged out successfully.');
    });

    container.querySelector('#header-store-selector')?.addEventListener('change', async (e) => {
      const storeId = e.target.value;
      const chosenStore = state.userStores.find(s => s.id === storeId);
      if (chosenStore) {
        state.setActiveStore(chosenStore);
        await auth.syncActiveCashSession(chosenStore.id);
        notify.success(`${currentLang === 'pt' ? 'Farmácia ativa' : 'Active Pharmacy'}: ${chosenStore.name}`);
        router.handleRoute();
      }
    });
  }
};
