(function () {
  // v0.9.61 · "Compartir horas libres": imagen PNG vertical 1080 × 1350 para WhatsApp (canvas, sin
  // librerías). Dibuja SOLO lo que da weekGridCore.shareData (días, horas y libre sí/no): sin nombres
  // de alumnos ni detalle de clases. No guarda nada.

  const W = 1080;
  const H = 1350;
  const PAD = 72;
  const C = {
    bg: '#0E0E0C',
    card: '#1C1B17',
    line: '#2B2922',
    yellow: '#FFCC1A',
    bone: '#F2EEE3',
    boneSoft: 'rgba(242, 238, 227, 0.68)'
  };
  const BEBAS = '"Bebas Neue", "Arial Narrow", Impact, sans-serif';
  const BARLOW = 'Barlow, "Segoe UI", Arial, sans-serif';
  const LOGO_URL = './assets/images/valhalla-logo.svg';
  const SHARE_TEXT = 'Horas disponibles esta semana';

  async function fontsReady() {
    if (!document.fonts || typeof document.fonts.load !== 'function') return;
    try {
      await Promise.race([
        Promise.all(['100px "Bebas Neue"', '500 40px Barlow', '700 40px Barlow'].map((font) => document.fonts.load(font))),
        new Promise((resolve) => setTimeout(resolve, 2500))
      ]);
    } catch (_) { /* sin fuentes: se dibuja con las de respaldo */ }
  }

  function loadLogo() {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = LOGO_URL;
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  async function draw(canvas, data) {
    canvas.width = W;
    canvas.height = H;
    const [, logo] = await Promise.all([fontsReady(), loadLogo()]);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    // Logo y título.
    const logoSize = 150;
    if (logo) {
      ctx.drawImage(logo, (W - logoSize) / 2, 56, logoSize, logoSize);
    } else {
      ctx.font = `64px ${BEBAS}`;
      ctx.fillStyle = C.yellow;
      ctx.textAlign = 'center';
      ctx.fillText('VALHALLA', W / 2, 150);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `96px ${BEBAS}`;
    ctx.fillStyle = C.yellow;
    ctx.fillText(data.title.toUpperCase(), W / 2, 300);
    ctx.font = `500 36px ${BARLOW}`;
    ctx.fillStyle = C.boneSoft;
    ctx.fillText(data.weekLabel, W / 2, 352);

    // Grilla: días arriba, horas a la izquierda; libre = amarillo, el resto oscuro.
    const labelW = 104;
    const gap = 10;
    const top = 440;
    const gridW = W - PAD * 2 - labelW;
    const colW = (gridW - gap * (data.days.length - 1)) / data.days.length;
    const rowH = 56;
    const cellH = rowH - 9;
    ctx.font = `46px ${BEBAS}`;
    ctx.fillStyle = C.bone;
    data.days.forEach((day, col) => {
      ctx.fillText(day.toUpperCase(), PAD + labelW + col * (colW + gap) + colW / 2, top - 22);
    });
    data.hours.forEach((hour, row) => {
      const y = top + row * rowH;
      ctx.textAlign = 'right';
      ctx.font = `600 30px ${BARLOW}`;
      ctx.fillStyle = C.boneSoft;
      ctx.fillText(`${String(hour).padStart(2, '0')}:00`, PAD + labelW - 18, y + cellH / 2 + 10);
      data.days.forEach((day, col) => {
        const x = PAD + labelW + col * (colW + gap);
        roundRect(ctx, x, y, colW, cellH, 8);
        if (data.free[row][col]) {
          ctx.fillStyle = C.yellow;
          ctx.fill();
        } else {
          ctx.fillStyle = C.card;
          ctx.fill();
          ctx.strokeStyle = C.line;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      });
    });

    // Leyenda y firma.
    const legendY = top + data.hours.length * rowH + 34;
    ctx.textAlign = 'left';
    ctx.font = `500 30px ${BARLOW}`;
    const legend = 'Disponible';
    const legendW = 34 + 14 + ctx.measureText(legend).width;
    const legendX = (W - legendW) / 2;
    roundRect(ctx, legendX, legendY - 26, 34, 34, 6);
    ctx.fillStyle = C.yellow;
    ctx.fill();
    ctx.fillStyle = C.bone;
    ctx.fillText(legend, legendX + 48, legendY);
    ctx.textAlign = 'center';
    ctx.font = `700 34px ${BARLOW}`;
    ctx.fillStyle = C.yellow;
    ctx.fillText(data.signature, W / 2, H - 56);
  }

  function toBlob(canvas) {
    return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo crear la imagen.'))), 'image/png'));
  }

  async function render(data) {
    const canvas = document.createElement('canvas');
    await draw(canvas, data);
    return { canvas, blob: await toBlob(canvas) };
  }

  function fileName(firstDate) {
    return `horas-disponibles-${String(firstDate || '').replace(/[^0-9-]/g, '') || 'semana'}.png`;
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // Menú de compartir del teléfono si existe; si no, descarga el PNG.
  // Devuelve { via: 'share' | 'download' } o { via: 'cancel' }.
  async function share(blob, name) {
    let file = null;
    try { file = new File([blob], name, { type: 'image/png' }); } catch (_) { file = null; }
    if (file && navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: SHARE_TEXT });
        return { via: 'share' };
      } catch (error) {
        if (!error || error.name === 'AbortError') return { via: 'cancel' };
      }
    }
    download(blob, name);
    return { via: 'download' };
  }

  window.VALHALLA = window.VALHALLA || {};
  window.VALHALLA.weekGrid = { WIDTH: W, HEIGHT: H, draw, render, share, fileName, SHARE_TEXT };
})();
