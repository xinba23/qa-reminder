/**
 * 可选：部署到 Cloudflare Workers / Vercel Edge，解决浏览器无法直接写飞书文档/Notion 的 CORS 限制。
 *
 * Cloudflare Workers 部署：
 * 1. 新建 Worker，粘贴本文件内容
 * 2. 设置环境变量：NOTION_TOKEN、NOTION_PAGE_ID 或 FEISHU_APP_ID、FEISHU_APP_SECRET
 * 3. 工作台设置里填 Worker URL 作为 webhookUrl（需自行扩展前端调用）
 *
 * 当前工作台内置方案（无需后端）：
 * - Gist Markdown：设置 GitHub Token + 启用云文档 → 自动同步 docs/*.md
 * - 飞书/钉钉 Webhook：推送摘要通知
 * - 复制/下载 Markdown：粘贴到飞书文档、语雀、腾讯文档
 */

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    if (request.method !== 'POST') {
      return json({ error: 'POST only' }, 405);
    }

    try {
      const body = await request.json();
      const { provider, markdown, title } = body;

      if (provider === 'notion') {
        await appendNotionBlock(env.NOTION_TOKEN, env.NOTION_PAGE_ID, title, markdown);
        return json({ ok: true, provider: 'notion' });
      }

      if (provider === 'feishu-doc') {
        await createFeishuDocBlock(env, title, markdown);
        return json({ ok: true, provider: 'feishu-doc' });
      }

      return json({ error: 'unknown provider' }, 400);
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

async function appendNotionBlock(token, pageId, title, markdown) {
  const res = await fetch('https://api.notion.com/v1/blocks/' + pageId + '/children', {
    method: 'PATCH',
    headers: {
      Authorization: 'Bearer ' + token,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      children: [
        {
          object: 'block',
          type: 'heading_2',
          heading_2: { rich_text: [{ type: 'text', text: { content: title || 'QA 记录' } }] },
        },
        {
          object: 'block',
          type: 'paragraph',
          paragraph: { rich_text: [{ type: 'text', text: { content: markdown.slice(0, 2000) } }] },
        },
      ],
    }),
  });
  if (!res.ok) throw new Error('Notion API ' + res.status);
}

async function createFeishuDocBlock(env, title, markdown) {
  // 需配置飞书自建应用，获取 tenant_access_token 后调用 docx API
  // 文档：https://open.feishu.cn/document/server-docs/docs/docs-overview
  throw new Error('请按飞书开放平台文档配置 app_id / app_secret');
}
