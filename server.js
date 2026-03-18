const express = require('express');
const path = require('path');
const zlib = require('zlib');

const app = express();
const port = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');

app.use(express.json({ limit: '8mb' }));
app.use(express.static(publicDir));

const TG_BASE = 'https://api.telegram.org';
const previewCache = new Map();

function cacheKey(token, fileId) {
  return `${token.slice(0, 10)}:${fileId}`;
}

function setCache(token, fileId, value) {
  const key = cacheKey(token, fileId);
  previewCache.set(key, { at: Date.now(), value });
  if (previewCache.size > 120) {
    const first = previewCache.keys().next().value;
    if (first) previewCache.delete(first);
  }
}

function getCache(token, fileId) {
  const key = cacheKey(token, fileId);
  const hit = previewCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > 1000 * 60 * 15) {
    previewCache.delete(key);
    return null;
  }
  return hit.value;
}

function parseSetName(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (/^[A-Za-z0-9_]+$/.test(trimmed)) return trimmed;

  try {
    const u = new URL(trimmed);
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length >= 2 && (parts[0] === 'addstickers' || parts[0] === 'addemoji')) {
      return decodeURIComponent(parts[1]);
    }
  } catch (_e) {
    const m = trimmed.match(/(?:addstickers|addemoji)\/([A-Za-z0-9_]+)/i);
    if (m) return m[1];
  }
  return null;
}

function resolveToken(maybeToken) {
  const t = (maybeToken || '').trim();
  if (t) return t;
  const envToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  return envToken || null;
}

async function tgApi(token, method, payload) {
  const res = await fetch(`${TG_BASE}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });

  let data;
  try {
    data = await res.json();
  } catch (_e) {
    throw new Error(`Telegram API invalid JSON response: ${method}`);
  }

  if (!res.ok || !data.ok) {
    throw new Error(data?.description || `Telegram API error: ${method}`);
  }
  return data.result;
}

async function fetchStickerBuffer(token, fileId) {
  const file = await tgApi(token, 'getFile', { file_id: fileId });
  if (!file || !file.file_path) {
    throw new Error('Telegram getFile returned empty file_path');
  }
  const fileUrl = `${TG_BASE}/file/bot${token}/${file.file_path}`;
  const fileRes = await fetch(fileUrl);
  if (!fileRes.ok) {
    throw new Error(`Cannot download sticker file: ${file.file_path}`);
  }
  const arr = await fileRes.arrayBuffer();
  return {
    filePath: file.file_path,
    buffer: Buffer.from(arr),
  };
}

function parseStickerPayload(filePath, buffer) {
  const lower = String(filePath || '').toLowerCase();

  if (lower.endsWith('.tgs')) {
    const jsonText = zlib.gunzipSync(buffer).toString('utf8');
    const json = JSON.parse(jsonText);
    return { mode: 'animated', filePath, json };
  }

  if (lower.endsWith('.json')) {
    const json = JSON.parse(buffer.toString('utf8'));
    return { mode: 'animated', filePath, json };
  }

  if (lower.endsWith('.webp') || lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
    const mime = lower.endsWith('.webp')
      ? 'image/webp'
      : (lower.endsWith('.png') ? 'image/png' : 'image/jpeg');
    const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`;
    return { mode: 'static', filePath, mime, dataUrl };
  }

  if (lower.endsWith('.webm')) {
    return { mode: 'video', filePath };
  }

  return { mode: 'unsupported', filePath };
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, project: 'dreinn.converter' });
});

app.post('/api/telegram/pack', async (req, res) => {
  try {
    const setName = parseSetName(req.body?.url);
    if (!setName) {
      return res.status(400).json({ ok: false, error: 'Invalid pack URL. Use addstickers/addemoji link or set name.' });
    }

    const token = resolveToken(req.body?.token);
    if (!token) {
      return res.status(400).json({ ok: false, error: 'Bot token required (field or TELEGRAM_BOT_TOKEN env).' });
    }

    const pack = await tgApi(token, 'getStickerSet', { name: setName });
    const items = (pack.stickers || []).map((s, idx) => ({
      idx,
      file_id: s.file_id,
      emoji: s.emoji || '🙂',
      type: s.type || (s.is_animated ? 'animated' : (s.is_video ? 'video' : 'regular')),
      is_animated: !!s.is_animated,
      is_video: !!s.is_video,
      is_static: !s.is_animated && !s.is_video,
      width: s.width || 0,
      height: s.height || 0,
    }));

    res.json({
      ok: true,
      set_name: pack.name,
      title: pack.title,
      count: items.length,
      items,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Pack import failed' });
  }
});

app.post('/api/telegram/item-json', async (req, res) => {
  try {
    const token = resolveToken(req.body?.token);
    const fileId = (req.body?.file_id || '').trim();

    if (!token) {
      return res.status(400).json({ ok: false, error: 'Bot token required' });
    }
    if (!fileId) {
      return res.status(400).json({ ok: false, error: 'file_id is required' });
    }

    const fromCache = getCache(token, fileId);
    if (fromCache) {
      return res.json({ ok: true, ...fromCache });
    }

    const { filePath, buffer } = await fetchStickerBuffer(token, fileId);
    let parsed;
    try {
      parsed = parseStickerPayload(filePath, buffer);
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'Failed to parse sticker file: ' + e.message });
    }

    if (parsed.mode === 'video') {
      return res.status(400).json({ ok: false, error: 'Video stickers (.webm) are not supported in editor.' });
    }
    if (parsed.mode === 'unsupported') {
      return res.status(400).json({ ok: false, error: 'Unsupported sticker format.' });
    }

    setCache(token, fileId, parsed);
    res.json({ ok: true, ...parsed });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Sticker loading failed' });
  }
});

app.post('/api/telegram/item-preview', async (req, res) => {
  try {
    const token = resolveToken(req.body?.token);
    const fileId = (req.body?.file_id || '').trim();

    if (!token || !fileId) {
      return res.status(400).json({ ok: false, error: 'token and file_id are required' });
    }

    const fromCache = getCache(token, fileId);
    if (fromCache) {
      if (fromCache.mode === 'animated') return res.json({ ok: true, mode: 'animated', json: fromCache.json });
      if (fromCache.mode === 'static') return res.json({ ok: true, mode: 'static', dataUrl: fromCache.dataUrl, mime: fromCache.mime });
    }

    const { filePath, buffer } = await fetchStickerBuffer(token, fileId);
    const parsed = parseStickerPayload(filePath, buffer);
    if (parsed.mode === 'video' || parsed.mode === 'unsupported') {
      return res.json({ ok: true, mode: parsed.mode, filePath: parsed.filePath });
    }

    setCache(token, fileId, parsed);
    if (parsed.mode === 'animated') {
      return res.json({ ok: true, mode: 'animated', json: parsed.json });
    }
    return res.json({ ok: true, mode: 'static', dataUrl: parsed.dataUrl, mime: parsed.mime });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Preview loading failed' });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`dreinn.converter running at http://localhost:${port}`);
});
