const FEISHU_BASE = 'https://open.feishu.cn/open-apis';

let cachedToken = { value: '', expireAt: 0 };

export async function getTenantToken(appId, appSecret) {
  if (cachedToken.value && Date.now() < cachedToken.expireAt - 60000) {
    return cachedToken.value;
  }
  const res = await fetch(`${FEISHU_BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const data = await res.json();
  if (data.code !== 0) throw new Error(`飞书 Token 失败: ${data.msg || data.code}`);
  cachedToken = {
    value: data.tenant_access_token,
    expireAt: Date.now() + (data.expire || 7200) * 1000,
  };
  return cachedToken.value;
}

function textElements(content) {
  const chunks = [];
  const max = 1800;
  for (let i = 0; i < content.length; i += max) {
    chunks.push({
      text_run: {
        content: content.slice(i, i + max),
        text_element_style: {},
      },
    });
  }
  return chunks.length ? chunks : [{ text_run: { content: ' ', text_element_style: {} } }];
}

function paragraphBlock(text) {
  return { block_type: 2, text: { style: {}, elements: textElements(text) } };
}

function headingBlock(level, text) {
  const key = level === 1 ? 'heading1' : level === 2 ? 'heading2' : 'heading3';
  const type = level === 1 ? 3 : level === 2 ? 4 : 5;
  return {
    block_type: type,
    [key]: { style: {}, elements: textElements(text) },
  };
}

function dividerBlock() {
  return { block_type: 22, divider: {} };
}

export function markdownToFeishuBlocks(markdown) {
  const blocks = [];
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    if (/^---+$/.test(line.trim())) {
      blocks.push(dividerBlock());
      continue;
    }
    if (line.startsWith('### ')) blocks.push(headingBlock(3, line.slice(4).trim()));
    else if (line.startsWith('## ')) blocks.push(headingBlock(2, line.slice(3).trim()));
    else if (line.startsWith('# ')) blocks.push(headingBlock(1, line.slice(2).trim()));
    else if (line.startsWith('> ')) blocks.push(paragraphBlock(line.slice(2).trim()));
    else if (line.startsWith('**') && line.endsWith('**')) blocks.push(paragraphBlock(line.replace(/\*\*/g, '')));
    else blocks.push(paragraphBlock(line));
  }
  return blocks;
}

async function feishuFetch(token, path, options = {}) {
  const res = await fetch(`${FEISHU_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`飞书 API ${path}: ${data.msg || data.code}`);
  }
  return data.data;
}

async function getDocumentRootBlockId(token, documentId) {
  const data = await feishuFetch(
    token,
    `/docx/v1/documents/${documentId}/blocks?document_revision_id=-1&page_size=50`
  );
  const page = (data.items || []).find((b) => b.block_type === 1);
  return page?.block_id || documentId;
}

async function appendBlocks(token, documentId, parentBlockId, blocks) {
  const batchSize = 20;
  for (let i = 0; i < blocks.length; i += batchSize) {
    const batch = blocks.slice(i, i + batchSize);
    await feishuFetch(token, `/docx/v1/documents/${documentId}/blocks/${parentBlockId}/children`, {
      method: 'POST',
      body: JSON.stringify({ children: batch, index: -1 }),
    });
  }
}

async function createDocument(token, folderToken, title) {
  const data = await feishuFetch(token, '/docx/v1/documents', {
    method: 'POST',
    body: JSON.stringify({ folder_token: folderToken, title }),
  });
  return data.document.document_id;
}

export async function syncMarkdownToFeishuDoc({
  appId,
  appSecret,
  documentId,
  folderToken,
  title,
  markdown,
  key,
}) {
  const token = await getTenantToken(appId, appSecret);
  const blocks = markdownToFeishuBlocks(markdown);

  if (!blocks.length) throw new Error('Markdown 内容为空');

  blocks.unshift(dividerBlock());
  blocks.unshift(headingBlock(1, title || key || 'QA 记录'));
  blocks.unshift(paragraphBlock(`同步 key: ${key || '-'} · ${new Date().toLocaleString('zh-CN')}`));

  let targetDocId = documentId;
  let created = false;

  if (!targetDocId) {
    if (!folderToken) throw new Error('请配置 FEISHU_DOCUMENT_ID 或 FEISHU_FOLDER_TOKEN');
    targetDocId = await createDocument(token, folderToken, title || key || 'QA 记录');
    created = true;
  }

  const rootBlockId = await getDocumentRootBlockId(token, targetDocId);
  await appendBlocks(token, targetDocId, rootBlockId, blocks);

  return {
    document_id: targetDocId,
    document_url: `https://feishu.cn/docx/${targetDocId}`,
    created,
    block_count: blocks.length,
  };
}

export async function testFeishuConnection(appId, appSecret) {
  const token = await getTenantToken(appId, appSecret);
  return { ok: true, token_preview: `${token.slice(0, 8)}...` };
}
