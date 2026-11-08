(function () {
  // v0.9.47 · Tarjeta del mes: el dibujo (canvas 1080 × 1350, sin librerías) y el envío.
  // Los números los arma monthly-card-core.js; aquí solo se pinta y se comparte. No guarda nada:
  // marcar "Enviada" lo hace app.js con lo que devuelve send().

  const core = window.VALHALLA && window.VALHALLA.monthlyCardCore;
  const W = 1080;
  const H = 1350;
  const PAD = 72;
  const C = {
    bg: '#0E0E0C',
    card: '#1C1B17',
    yellow: '#FFCC1A',
    bone: '#F2EEE3',
    boneSoft: 'rgba(242, 238, 227, 0.68)',
    green: '#7FD68E',
    red: '#E0352B',
    ink: '#0E0E0C'
  };
  // Zonas de la figura: sin trabajo, y de menos a más trabajada (tres amarillos).
  const ZONE_FILL = { 0: '#3F3B31', 1: '#7A6418', 2: '#C29A16', 3: '#FFCC1A' };
  const BEBAS = '"Bebas Neue", "Arial Narrow", Impact, sans-serif';
  const BARLOW = 'Barlow, "Segoe UI", Arial, sans-serif';

  let figureText = null;

  function loadFigure() {
    if (figureText !== null) return Promise.resolve(figureText);
    return fetch('./assets/images/figura-esculpida.svg')
      .then((response) => (response.ok ? response.text() : ''))
      .catch(() => '')
      .then((text) => {
        figureText = text;
        return text;
      });
  }

  // La figura con cada zona en su tono, a tamaño final (así no se ve borrosa al escalar).
  function figureSvg(text, tones, width, height) {
    const style = `<style>[data-zona]{fill:${ZONE_FILL[0]};stroke:#26241E;stroke-width:.5;stroke-linejoin:round}`
      + [1, 2, 3].map((tone) => `[data-zona].t${tone}{fill:${ZONE_FILL[tone]};stroke:${tone === 3 ? '#FFE680' : '#26241E'}}`).join('')
      + '</style>';
    return String(text)
      .replace(/<\?xml[\s\S]*?\?>/g, '')
      .replace(/<metadata[\s\S]*?<\/metadata>/g, '')
      .replace(/<style[\s\S]*?<\/style>/g, style)
      .replace(/<svg\b/, `<svg width="${width}" height="${height}"`)
      .replace(/data-zona="([A-Za-z]+)"/g, (match, zone) => (tones[zone] ? `${match} class="t${tones[zone]}"` : match));
  }

  function loadImage(svgText) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
      const image = new Image();
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      image.src = url;
    });
  }

  async function fontsReady() {
    if (!document.fonts || typeof document.fonts.load !== 'function') return;
    try {
      await Promise.race([
        Promise.all(['100px "Bebas Neue"', '600 40px Barlow', '500 40px Barlow', '700 40px Barlow'].map((font) => document.fonts.load(font))),
        new Promise((resolve) => setTimeout(resolve, 2500))
      ]);
    } catch (_) { /* sin fuentes: se dibuja con las de respaldo */ }
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

  // Texto en una línea: achica la letra hasta min y, si igual no cabe, corta con "…".
  function fitText(ctx, text, maxWidth, size, min, family, weight = '') {
    let current = size;
    const font = (px) => `${weight ? `${weight} ` : ''}${px}px ${family}`;
    ctx.font = font(current);
    while (current > min && ctx.measureText(text).width > maxWidth) {
      current -= 2;
      ctx.font = font(current);
    }
    let shown = text;
    while (shown.length > 1 && ctx.measureText(shown).width > maxWidth) {
      shown = `${shown.slice(0, -2).trimEnd()}…`;
    }
    return { text: shown, size: current };
  }

  function wrap(ctx, text, maxWidth, maxLines) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    words.forEach((word) => {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= maxWidth || !line) {
        line = next;
      } else {
        lines.push(line);
        line = word;
      }
    });
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      const kept = lines.slice(0, maxLines);
      kept[maxLines - 1] = `${kept[maxLines - 1].replace(/\s*\S*$/, '')}…`;
      return kept;
    }
    return lines;
  }

  // Dibuja la tarjeta en el canvas recibido (lo deja en 1080 × 1350).
  async function draw(canvas, data) {
    canvas.width = W;
    canvas.height = H;
    const [, svgText] = await Promise.all([fontsReady(), loadFigure()]);
    const figure = svgText ? await loadImage(figureSvg(svgText, data.zones || {}, 380, Math.round(380 * 100 / 116))) : null;
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    // Encabezado: VALHALLA y el mes.
    ctx.font = `64px ${BEBAS}`;
    ctx.fillStyle = C.yellow;
    ctx.textAlign = 'left';
    ctx.fillText('VALHALLA', PAD, 128);
    ctx.font = `48px ${BEBAS}`;
    ctx.fillStyle = C.bone;
    ctx.textAlign = 'right';
    ctx.fillText(data.monthLabel, W - PAD, 128);

    // Nombre y bajada.
    ctx.textAlign = 'left';
    const name = fitText(ctx, data.firstName.toUpperCase(), W - PAD * 2, 210, 110, BEBAS);
    ctx.fillStyle = C.bone;
    ctx.fillText(name.text, PAD - 4, 330);
    ctx.font = `500 40px ${BARLOW}`;
    ctx.fillStyle = C.boneSoft;
    ctx.fillText('Tu mes en Vikingos Radical', PAD, 392);

    // Tres cajas.
    const gap = 24;
    const boxW = (W - PAD * 2 - gap * 2) / 3;
    core.boxes(data).forEach((box, index) => {
      const x = PAD + index * (boxW + gap);
      ctx.fillStyle = C.card;
      roundRect(ctx, x, 436, boxW, 196, 24);
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.fillStyle = C.yellow;
      ctx.font = `120px ${BEBAS}`;
      ctx.fillText(box.value, x + boxW / 2, 562);
      ctx.fillStyle = C.bone;
      const label = fitText(ctx, box.label, boxW - 24, 30, 22, BARLOW, 600);
      ctx.fillText(label.text, x + boxW / 2, 606);
    });

    // Récords del mes (izquierda) y figura (derecha).
    const colW = 560;
    const top = 720;
    ctx.textAlign = 'left';
    ctx.fillStyle = C.yellow;
    ctx.font = `50px ${BEBAS}`;
    ctx.fillText('RÉCORDS DEL MES', PAD, top);
    const records = (data.records || []).slice(0, core.RECORDS_MAX).map(core.recordText);
    if (records.length) {
      records.forEach((record, index) => {
        const y = top + 74 + index * 92;
        ctx.fillStyle = C.bone;
        const shownName = fitText(ctx, record.name, 330, 36, 26, BARLOW, 600);
        ctx.fillText(shownName.text, PAD, y);
        // Número en Bebas; la unidad en Barlow (Bebas solo tiene mayúsculas: "kg" y "s" van tal cual).
        const valueX = PAD + 346;
        const [number, unit] = [record.value.slice(0, record.value.lastIndexOf(' ')), record.value.slice(record.value.lastIndexOf(' ') + 1)];
        ctx.font = `56px ${BEBAS}`;
        ctx.fillText(number, valueX, y + 4);
        let cursor = valueX + ctx.measureText(number).width + 6;
        ctx.font = `600 30px ${BARLOW}`;
        ctx.fillText(unit, cursor, y + 4);
        cursor += ctx.measureText(unit).width + 14;
        if (record.delta) {
          ctx.fillStyle = C.green;
          ctx.font = `48px ${BEBAS}`;
          ctx.fillText(record.delta, cursor, y + 4);
        }
        if (index < records.length - 1) {
          ctx.fillStyle = 'rgba(242, 238, 227, 0.10)';
          ctx.fillRect(PAD, y + 34, colW - 20, 2);
        }
      });
    } else {
      ctx.fillStyle = C.bone;
      ctx.font = `500 38px ${BARLOW}`;
      wrap(ctx, core.EMPTY_RECORDS_TEXT, colW - 40, 4).forEach((line, index) => ctx.fillText(line, PAD, top + 74 + index * 50));
    }
    const figX = W - PAD - 380;
    ctx.fillStyle = C.boneSoft;
    ctx.font = `600 28px ${BARLOW}`;
    ctx.textAlign = 'center';
    ctx.fillText('Lo que más trabajaste', figX + 190, top - 6);
    if (figure) {
      ctx.drawImage(figure, figX, top + 18, 380, Math.round(380 * 100 / 116));
    }

    // Mensaje del entrenador (solo si hay).
    if (data.message) {
      ctx.font = `600 38px ${BARLOW}`;
      const lines = wrap(ctx, data.message, W - PAD * 2 - 64, 3);
      const boxH = 48 + lines.length * 50;
      const y = 1258 - boxH;
      ctx.fillStyle = C.yellow;
      roundRect(ctx, PAD, y, W - PAD * 2, boxH, 22);
      ctx.fill();
      ctx.fillStyle = C.ink;
      ctx.textAlign = 'left';
      lines.forEach((line, index) => ctx.fillText(line, PAD + 32, y + 62 + index * 50));
    }

    // Firma.
    ctx.textAlign = 'center';
    ctx.fillStyle = C.red;
    ctx.font = `700 34px ${BARLOW}`;
    ctx.fillText('by Vikingos Radical', W / 2, H - 42);
    return canvas;
  }

  function toBlob(canvas) {
    return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo crear la imagen.'))), 'image/png'));
  }

  async function render(data) {
    const canvas = document.createElement('canvas');
    await draw(canvas, data);
    return { canvas, blob: await toBlob(canvas) };
  }

  function fileName(data) {
    const slug = String(data.firstName || 'alumno').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'alumno';
    return `tarjeta-${slug}-${data.month}.png`;
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

  // Enviar: en el teléfono, compartir el PNG (el entrenador elige WhatsApp y el chat); si el
  // navegador no comparte archivos, descarga el PNG y abre wa.me con el teléfono del alumno.
  // Devuelve { sent: true, via: 'share' | 'wa.me' } o { sent: false, reason: 'cancel' | 'no-phone' }.
  // readyBlob: el PNG de la vista previa, ya dibujado (compartir necesita el toque reciente).
  async function send(data, phone, readyBlob) {
    const blob = readyBlob || (await render(data)).blob;
    const name = fileName(data);
    let file = null;
    try { file = new File([blob], name, { type: 'image/png' }); } catch (_) { file = null; }
    if (file && navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: core.SHARE_TEXT });
        return { sent: true, via: 'share' };
      } catch (error) {
        // Cancelar no marca nada. Otro error (p. ej. el navegador no dejó compartir): se sigue
        // como en el computador, descargando y abriendo wa.me.
        if (!error || error.name === 'AbortError') return { sent: false, reason: 'cancel' };
      }
    }
    download(blob, name);
    if (!phone) return { sent: false, reason: 'no-phone' };
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(core.SHARE_TEXT)}`, '_blank', 'noopener,noreferrer');
    return { sent: true, via: 'wa.me' };
  }

  async function downloadOnly(data, readyBlob) {
    const blob = readyBlob || (await render(data)).blob;
    download(blob, fileName(data));
  }

  window.VALHALLA = window.VALHALLA || {};
  window.VALHALLA.monthlyCard = { WIDTH: W, HEIGHT: H, draw, toBlob, render, send, downloadOnly, fileName, figureSvg };
})();
