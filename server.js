const express = require('express');
const cheerio = require('cheerio');
const { URL } = require('node:url');

const app = express();
const PORT = process.env.PORT || 3000;
const TIMEOUT_MS = 18000;
app.disable('x-powered-by');
app.use(express.static('public'));

function allowedPinterestPage(value) {
  let u;
  try { u = new URL(value); } catch { return false; }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  return u.protocol === 'https:' && (host === 'pin.it' || host === 'pinterest.com' || host.endsWith('.pinterest.com') || /^pinterest\.[a-z.]+$/.test(host));
}
function allowedMedia(value) {
  let u;
  try { u = new URL(value); } catch { return false; }
  const host = u.hostname.toLowerCase();
  return u.protocol === 'https:' && (host === 'pinimg.com' || host.endsWith('.pinimg.com'));
}
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
        'accept-language': 'es-ES,es;q=0.9,en;q=0.8',
        ...(options.headers || {})
      }
    });
  } finally { clearTimeout(timer); }
}
function findPin(node, depth = 0, seen = new Set()) {
  if (!node || typeof node !== 'object' || depth > 18 || seen.has(node)) return null;
  seen.add(node);
  if (node.images && typeof node.images === 'object') {
    const image = node.images.orig || node.images['736x'] || node.images['564x'] || Object.values(node.images).find(x => x && x.url);
    if (image?.url) {
      let video = null;
      const list = node.videos?.video_list;
      if (list && typeof list === 'object') {
        video = Object.values(list).filter(v => v?.url).sort((a,b) => (b.width || 0) - (a.width || 0))[0]?.url || null;
      }
      return { title: node.grid_title || node.title || node.closeup_unified_title || '', description: node.description || node.closeup_unified_description || '', image: image.url, video };
    }
  }
  for (const value of Object.values(node)) {
    const result = findPin(value, depth + 1, seen);
    if (result) return result;
  }
  return null;
}
function parsePinterestHtml(html) {
  const $ = cheerio.load(html);
  const meta = name => $(`meta[property="${name}"],meta[name="${name}"]`).attr('content') || '';
  let result = null;
  const raw = $('#__PWS_DATA__').html();
  if (raw) {
    try { result = findPin(JSON.parse(raw)); } catch {}
  }
  if (!result) {
    const image = meta('og:image') || meta('twitter:image');
    const video = meta('og:video:secure_url') || meta('og:video') || '';
    const title = meta('og:title') || meta('twitter:title');
    const description = meta('og:description') || meta('description');
    if (image || video) result = { title, description, image, video: video || null };
  }
  if (!result) return null;
  const qualities = [];
  if (result.video && allowedMedia(result.video)) qualities.push({ label: 'Video MP4', description: 'Archivo de video disponible', type: 'video', url: result.video });
  if (result.image && allowedMedia(result.image)) qualities.push({ label: 'Imagen', description: 'Imagen disponible', type: 'image', url: result.image });
  if (!qualities.length) return null;
  return { title: result.title || 'Pin de Pinterest', description: result.description || '', thumbnail: result.image && allowedMedia(result.image) ? result.image : null, type: qualities.some(q => q.type === 'video') ? 'video' : 'image', qualities };
}

app.get('/api/pin', async (req, res) => {
  const pinUrl = String(req.query.url || '');
  if (!allowedPinterestPage(pinUrl)) return res.status(400).json({ error: 'Enlace no válido. Usa un enlace https de Pinterest o pin.it.' });
  try {
    const response = await fetchWithTimeout(pinUrl, { headers: { accept: 'text/html,application/xhtml+xml' } });
    if (!response.ok) return res.status(502).json({ error: `Pinterest respondió con HTTP ${response.status}.` });
    if (!allowedPinterestPage(response.url)) return res.status(400).json({ error: 'El enlace redirigió fuera de Pinterest.' });
    const html = await response.text();
    const pin = parsePinterestHtml(html);
    if (!pin) return res.status(404).json({ error: 'No se encontró contenido público descargable. Puede ser un pin privado, eliminado o protegido por Pinterest.' });
    res.json(pin);
  } catch (error) {
    const message = error.name === 'AbortError' ? 'Pinterest tardó demasiado en responder.' : 'No se pudo consultar Pinterest. Inténtalo más tarde.';
    res.status(502).json({ error: message });
  }
});

app.get('/api/download', async (req, res) => {
  const mediaUrl = String(req.query.url || '');
  if (!allowedMedia(mediaUrl)) return res.status(400).json({ error: 'Dirección de archivo no permitida.' });
  try {
    const response = await fetchWithTimeout(mediaUrl);
    if (!response.ok || !response.body) return res.status(502).json({ error: `El servidor de archivos respondió con HTTP ${response.status}.` });
    const finalUrl = response.url;
    if (!allowedMedia(finalUrl)) return res.status(400).json({ error: 'La descarga redirigió a un dominio no permitido.' });
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const ext = contentType.includes('video') ? 'mp4' : (contentType.includes('png') ? 'png' : 'jpg');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="pingrab-${Date.now()}.${ext}"`);
    if (response.headers.get('content-length')) res.setHeader('Content-Length', response.headers.get('content-length'));
    const { Readable } = require('node:stream');
    Readable.fromWeb(response.body).pipe(res);
  } catch (error) {
    res.status(502).json({ error: error.name === 'AbortError' ? 'La descarga tardó demasiado.' : 'No se pudo descargar el archivo.' });
  }
});

app.listen(PORT, () => console.log(`PinGrab activo en http://localhost:${PORT}`));
