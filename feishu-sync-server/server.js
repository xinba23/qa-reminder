import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { syncMarkdownToFeishuDoc, testFeishuConnection } from './feishu.js';

const app = express();
const PORT = process.env.PORT || 8787;

app.use(cors({ origin: true }));
app.use(express.json({ limit: '2mb' }));

function auth(req, res, next) {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return next();
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.headers['x-api-key'];
  if (token !== apiKey) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  next();
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'qa-feishu-sync',
    has_app: !!(process.env.FEISHU_APP_ID && process.env.FEISHU_APP_SECRET),
    mode: process.env.FEISHU_DOCUMENT_ID ? 'append' : process.env.FEISHU_FOLDER_TOKEN ? 'create' : 'unset',
  });
});

app.get('/api/feishu/test', auth, async (_req, res) => {
  try {
    const result = await testFeishuConnection(
      process.env.FEISHU_APP_ID,
      process.env.FEISHU_APP_SECRET
    );
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/feishu/sync', auth, async (req, res) => {
  try {
    const { title, markdown, key } = req.body || {};
    if (!markdown || !markdown.trim()) {
      return res.status(400).json({ ok: false, error: 'markdown 不能为空' });
    }
    if (!process.env.FEISHU_APP_ID || !process.env.FEISHU_APP_SECRET) {
      return res.status(500).json({ ok: false, error: '服务端未配置 FEISHU_APP_ID / FEISHU_APP_SECRET' });
    }

    const result = await syncMarkdownToFeishuDoc({
      appId: process.env.FEISHU_APP_ID,
      appSecret: process.env.FEISHU_APP_SECRET,
      documentId: process.env.FEISHU_DOCUMENT_ID,
      folderToken: process.env.FEISHU_FOLDER_TOKEN,
      title,
      markdown,
      key,
    });

    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('Feishu sync error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`QA Feishu Sync Server → http://localhost:${PORT}`);
  console.log(`Health check → http://localhost:${PORT}/api/health`);
});
