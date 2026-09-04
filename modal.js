/**
 * FARMAKEIA — Accessible Modal Dialog System
 */

export const modal = {
  activeModal: null,

  /**
   * Opens a modal dialog with title, content and customizable buttons
   */
  open({ title, contentHtml, footerHtml, size = 'md', onClose }) {
    // Immediately remove any existing overlay to prevent DOM lag or transition delay
    const existing = document.getElementById('active-modal-overlay');
    if (existing) {
      if (this.activeModal?.onClose) {
        try { this.activeModal.onClose(); } catch (e) { console.error(e); }
      }
      existing.remove();
    }
    this.activeModal = null;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'active-modal-overlay';

    const maxW = size === 'lg' ? '850px' : size === 'sm' ? '450px' : '650px';

    overlay.innerHTML = `
      <div class="modal-dialog" style="max-width: ${maxW};" role="dialog" aria-modal="true">
        <div class="modal-header">
          <h3 class="modal-title">${title}</h3>
          <button class="modal-close" id="modal-btn-close" aria-label="Fechar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <div class="modal-body">
          ${contentHtml}
        </div>
        ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
      </div>
    `;

    document.body.appendChild(overlay);
    this.activeModal = { overlay, onClose };

    // Trigger transition
    requestAnimationFrame(() => {
      overlay.classList.add('active');
    });

    const closeBtn = overlay?.querySelector('#modal-btn-close');
    closeBtn?.addEventListener('click', () => this.close());

    overlay?.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.close();
      }
    });

    const keyHandler = (e) => {
      if (e.key === 'Escape') {
        this.close();
        document.removeEventListener('keydown', keyHandler);
      }
    };
    document.addEventListener('keydown', keyHandler);

    return overlay;
  },

  close() {
    const existing = document.getElementById('active-modal-overlay');
    if (existing) {
      existing.classList.remove('active');
      if (this.activeModal?.onClose) {
        try { this.activeModal.onClose(); } catch (e) { console.error(e); }
      }
      setTimeout(() => existing.remove(), 200);
    }
    this.activeModal = null;
  }
};
