/**
 * bridge.js — Content Script, world: "ISOLATED"
 * 
 * Мост между провайдером (MAIN world) и service worker.
 * 
 * Поток сообщений:
 *   MAIN world (orgonWeb.js)
 *     → CustomEvent('OrgonLinkRequest')
 *     → bridge.js listens → chrome.runtime.sendMessage
 *     → service_worker.js обрабатывает
 *     → ответ через sendResponse
 *     → bridge.js → CustomEvent('OrgonLinkResponse')
 *     → MAIN world Promise resolve/reject
 * 
 * ISOLATED world имеет доступ к chrome.* API,
 * но не имеет доступа к window объектам страницы — только через события.
 */

'use strict';

// Флаг для предотвращения дублирования
if (window.__orgonLinkBridgeActive) {
  // Already active
} else {
  window.__orgonLinkBridgeActive = true;

  // ─── MAIN → Service Worker ──────────────────────────────────────────────

  window.addEventListener('OrgonLinkRequest', async (event) => {
    const { id, method, params } = event.detail;

    try {
      const response = await chrome.runtime.sendMessage({
        target: 'service_worker',
        type: 'PROVIDER_REQUEST',
        id,
        method,
        params,
        origin: window.location.origin,
        tabId: null, // service worker определит из sender
      });

      // Отправляем ответ обратно в MAIN world
      window.dispatchEvent(new CustomEvent('OrgonLinkResponse', {
        detail: response
      }));

    } catch (error) {
      // Extension context invalidated или другая ошибка
      window.dispatchEvent(new CustomEvent('OrgonLinkResponse', {
        detail: {
          id,
          error: {
            code: 4900,
            message: error.message ?? 'Extension unavailable',
          }
        }
      }));
    }
  });

  // ─── Service Worker → MAIN (push-события) ──────────────────────────────

  chrome.runtime.onMessage.addListener((message) => {
    if (message.target !== 'content_script') return;

    // Транслируем push-события от SW в MAIN world
    if (message.type === 'EXTENSION_EVENT') {
      window.dispatchEvent(new CustomEvent('OrgonLinkEvent', {
        detail: message.payload
      }));
    }
  });

  // ─── Диагностика ────────────────────────────────────────────────────────

  console.debug('[OrgonLink] Bridge active on', window.location.origin);
}
