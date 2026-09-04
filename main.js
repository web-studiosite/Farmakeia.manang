/**
 * FARMAKEIA — Main Application Entry Point
 * Pure Vanilla JavaScript initialization (Zero-build ready for GitHub Pages & static hosting)
 */

import { app } from './app.js';

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    app.init();
  });
} else {
  app.init();
}
