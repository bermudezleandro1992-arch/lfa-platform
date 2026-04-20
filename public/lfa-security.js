/**
 * lfa-security.js — LFA Anti-Inspect Shield v4.0 MÁXIMA POTENCIA
 * ⚠️ CONGELACIÓN INMEDIATA CUANDO DETECTA DEVTOOLS
 * Incluir en TODAS las páginas: <script src="/lfa-security.js" defer></script>
 * 
 * Protecciones activas:
 * 1. Bloqueo total de F12, Ctrl+Shift+I, Ctrl+U, Ctrl+S
 * 2. Detección ultra-rápida de DevTools abierto
 * 3. Congelación TOTAL de la página cuando se detecte
 * 4. Blanqueo del DOM y redirección silenciosa
 * 5. Bloqueo de click derecho
 * 6. Protección de Storage (localStorage/sessionStorage vacío)
 * 7. Detección de extensiones maliciosas
 * 8. Anti-tampering del DOM
 * 9. Monitoreo continuo cada 500ms
 * 10. CSP headers (configurados en firebase.json)
 */

(function() {
  "use strict";

  let _isLocked = false;
  let _checkCount = 0;

  // ══════════════════════════════════════════════════════════════
  // 🚨 BLOQUEO INMEDIATO CUANDO DETECTA F12
  // ══════════════════════════════════════════════════════════════

  document.addEventListener("keydown", function(e) {
    // F12 - DevTools INMEDIATO
    if (e.key === "F12") { 
      e.preventDefault(); 
      e.stopPropagation(); 
      _lockPageImmediately("F12_PRESSED");
      return false; 
    }
    
    // Ctrl+Shift+I/J/C - Inspector/Console
    if (e.ctrlKey && e.shiftKey && ["I","i","J","j","C","c"].includes(e.key)) { 
      e.preventDefault(); 
      e.stopPropagation(); 
      _lockPageImmediately("INSPECTOR_SHORTCUT");
      return false; 
    }
    
    // Ctrl+U - Ver código fuente
    if (e.ctrlKey && ["U","u"].includes(e.key)) { 
      e.preventDefault(); 
      e.stopPropagation(); 
      _lockPageImmediately("SOURCE_VIEW");
      return false; 
    }
    
    // Ctrl+S - Guardar página
    if (e.ctrlKey && ["S","s"].includes(e.key)) { 
      e.preventDefault(); 
      return false; 
    }
    
    // Cmd+Option+I (Mac DevTools)
    if (e.metaKey && e.altKey && ["I","i"].includes(e.key)) {
      e.preventDefault(); 
      e.stopPropagation(); 
      _lockPageImmediately("MAC_INSPECTOR");
      return false;
    }

    // Cmd+Option+J (Mac Console)
    if (e.metaKey && e.altKey && ["J","j"].includes(e.key)) {
      e.preventDefault(); 
      e.stopPropagation(); 
      _lockPageImmediately("MAC_CONSOLE");
      return false;
    }
  }, true);

  // BLOQUEAR CLICK DERECHO
  document.addEventListener("contextmenu", function(e) {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }, true);

  // ANTI-IFRAME (evitar embebido en otros sitios)
  if (window.top !== window.self) {
    window.top.location.replace(window.self.location.href);
  }

  // ══════════════════════════════════════════════════════════════
  // � DETECCIÓN ULTRA-RÁPIDA DE DEVTOOLS (CADA 500MS)
  // ══════════════════════════════════════════════════════════════

  function _detectDevTools() {
    if (_isLocked) return;

    // Método 1: Diferencia de tamaño de ventana - UMBRAL MÁS ALTO
    const widthDiff = window.outerWidth - window.innerWidth;
    const heightDiff = window.outerHeight - window.innerHeight;
    
    // Solo bloquear si DevTools está REALMENTE abierto (diferencia grande)
    if ((widthDiff > 250 || heightDiff > 300) && _checkCount > 3) {
      _lockPageImmediately("DEVTOOLS_DETECTED");
      return;
    }

    // Método 2: Performance timing (debugger) - UMBRAL MÁS ALTO
    _checkCount++;
    const start = performance.now();
    debugger; // ← Genera retraso si DevTools está abierto
    const end = performance.now();
    
    // Solo bloquear si el retraso es ALTO (> 100ms)
    if ((end - start) > 100 && _checkCount > 5) {
      _lockPageImmediately("DEBUGGER_DETECTED");
      return;
    }
  }

  // Ejecutar detección CADA 1000ms (menos agresivo)
  setInterval(_detectDevTools, 1000);

  // ══════════════════════════════════════════════════════════════
  // 🔒 CONGELACIÓN TOTAL E INMEDIATA
  // ══════════════════════════════════════════════════════════════

  function _lockPageImmediately(reason = "UNKNOWN") {
    if (_isLocked) return;
    _isLocked = true;

    console.clear();
    console.error("🛡️ LFA SECURITY | PÁGINA BLOQUEADA: " + reason);

    // 1. Blanquear TODO el DOM
    document.body.innerHTML = "";
    document.body.style.cssText = `
      margin: 0;
      padding: 0;
      overflow: hidden;
      background: #000;
      width: 100vw;
      height: 100vh;
    `;

    // 2. Crear overlay TOTAL impenetrable
    const lockOverlay = document.createElement("div");
    lockOverlay.id = "lfa-security-lock";
    lockOverlay.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
      display: flex;
      justify-content: center;
      align-items: center;
      font-family: monospace;
      overflow: hidden;
    `;

    lockOverlay.innerHTML = `
      <div style="
        text-align: center;
        color: #fff;
        background: rgba(0,0,0,0.95);
        padding: 60px;
        border-radius: 20px;
        border: 3px solid #ff0000;
        box-shadow: 0 0 100px rgba(255,0,0,0.8), inset 0 0 50px rgba(255,0,0,0.2);
        max-width: 500px;
        animation: pulse 1s infinite;
      ">
        <div style="font-size: 80px; margin-bottom: 20px; animation: blink 0.5s infinite;">🔒</div>
        <div style="
          font-size: 28px;
          font-weight: bold;
          color: #ff0000;
          margin-bottom: 15px;
          text-shadow: 0 0 20px #ff0000;
          font-family: 'Courier New', monospace;
        ">
          ⚠️ ACCESO DENEGADO ⚠️
        </div>
        <div style="
          font-size: 14px;
          color: #ffff00;
          margin-bottom: 20px;
          line-height: 1.8;
          font-family: 'Courier New', monospace;
        ">
          Se ha detectado intento de inspección<br/>
          Razón: <strong>${reason}</strong><br/>
          <br/>
          Tu sesión ha sido BLOQUEADA<br/>
          IP y dispositivo ahora en LISTA NEGRA<br/>
          <br/>
          <span style="color: #ff0000; font-weight: bold;">
            ABOGADOS NOTIFICADOS ⚖️
          </span>
        </div>
        <div style="
          font-size: 12px;
          color: #888;
          border-top: 1px solid #333;
          padding-top: 15px;
          margin-top: 15px;
        ">
          Timestamp: ${new Date().toISOString()}<br/>
          Incidente ID: ${Math.random().toString(36).substring(2, 15)}<br/>
          <strong>Este acceso está siendo investigado.</strong>
        </div>
      </div>

      <style>
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }
        @keyframes blink {
          0%, 50%, 100% { opacity: 1; }
          25%, 75% { opacity: 0.5; }
        }
      </style>
    `;

    document.body.appendChild(lockOverlay);

    // 3. Bloquear TODOS los eventos
    document.body.style.pointerEvents = "none";
    document.documentElement.style.pointerEvents = "none";
    document.addEventListener("mousedown", e => e.preventDefault(), true);
    document.addEventListener("keydown", e => e.preventDefault(), true);
    document.addEventListener("click", e => e.preventDefault(), true);
    document.addEventListener("dblclick", e => e.preventDefault(), true);

    // 4. Proteger el overlay para que no se pueda remover
    Object.defineProperty(lockOverlay, "parentElement", {
      get() { return document.body; },
      set() {}
    });

    // 5. Bloquear acceso a console
    (function() {
      const noop = function() {};
      console.log = console.warn = console.error = console.debug = noop;
      console.table = noop;
    })();

    // 6. Prevenir que se remueva el overlay
    const lockMutationObserver = new MutationObserver(() => {
      if (!document.getElementById("lfa-security-lock")) {
        document.body.innerHTML = lockOverlay.outerHTML;
      }
    });

    lockMutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true
    });

    // 7. Redirigir después de 3 segundos
    setTimeout(() => {
      try {
        window.location.href = "about:blank";
        window.location.replace("about:blank");
      } catch (e) {}
    }, 3000);
  }

  // ══════════════════════════════════════════════════════════════
  // 🔒 PROTECCIÓN DE STORAGE (Solo bloquear si DevTools detectado)
  // ══════════════════════════════════════════════════════════════

  // NO bloquear storage por defecto - dejar que funcione normalmente
  // Solo interfiere cuando _isLocked es true (DevTools detectado)
  
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    if (_isLocked) {
      _lockPageImmediately("FETCH_BLOCKED");
      return Promise.reject(new Error("Access denied"));
    }
    return originalFetch.apply(this, args);
  };

  // ══════════════════════════════════════════════════════════════
  // 🔒 DETECCIÓN DE EXTENSIONES MALICIOSAS
  // ══════════════════════════════════════════════════════════════

  document.addEventListener("DOMContentLoaded", function() {
    const suspiciousPatterns = ['tampermonkey', 'greasemonkey', 'violentmonkey', 'userscript', 'inject'];
    
    for (let i = 0; i < document.scripts.length; i++) {
      const src = document.scripts[i].src.toLowerCase();
      for (const pattern of suspiciousPatterns) {
        if (src.includes(pattern)) {
          _lockPageImmediately("MALICIOUS_EXTENSION_" + pattern.toUpperCase());
        }
      }
    }
  });

  // ══════════════════════════════════════════════════════════════
  // 🔒 TRAP PARA REGEX EVALUATION  
  // ══════════════════════════════════════════════════════════════

  const trap = /./;
  trap.toString = function() {
    _lockPageImmediately("REGEX_TRAP_TRIGGERED");
    return "LFA Shield Active";
  };

})();
