// A same-origin script keeps print previews compatible with the storefront CSP.
(() => {
  const ready = () => {
    const button = document.getElementById('print-local-label');
    if (button) {
      button.addEventListener('click', () => window.print());
      return;
    }
    const ticket = document.querySelector('.ticket');
    if (!ticket) return;
    const print = () => {
      const heightPx = Math.ceil(ticket.getBoundingClientRect().height);
      const pageHeightMm = Math.max(60, Math.ceil(heightPx * 25.4 / 96 + 4));
      const pageRule = document.getElementById('production-ticket-page');
      if (pageRule) pageRule.textContent = '@page { size: 80mm ' + pageHeightMm + 'mm; margin: 0; }';
      window.focus();
      window.print();
    };
    const imagesReady = Promise.all(Array.from(document.images).map(image =>
      typeof image.decode === 'function' ? image.decode().catch(() => {}) : Promise.resolve()
    ));
    Promise.all([document.fonts ? document.fonts.ready : Promise.resolve(), imagesReady])
      .then(() => window.setTimeout(print, 100));
  };
  if (document.readyState === 'complete') ready();
  else window.addEventListener('load', ready, { once: true });
})();
