// Turns the editor's HTML into other formats. Everything here runs in the browser.

const absolute = (src) => (src && src.startsWith('/') ? `${location.origin}${src}` : src || '');
const safeName = (title) => (title || 'document').replace(/[^\w\- ]+/g, '').trim() || 'document';
const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function parse(html) {
  return new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
}

/** Same HTML but with image addresses that still work once the file leaves the app. */
function withAbsoluteImages(html) {
  const body = parse(html);
  body.querySelectorAll('img').forEach((img) => img.setAttribute('src', absolute(img.getAttribute('src'))));
  return body.innerHTML;
}

const PAGE_CSS = `body{font:16px/1.7 Georgia,serif;max-width:760px;margin:40px auto;padding:0 20px;color:#22312A}
img{max-width:100%}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:6px 10px;vertical-align:top}
th{background:#eef2ec}blockquote{border-left:4px solid #9DB8A6;margin:1em 0;padding:.2em 1em;color:#4a5a50}
pre{background:#f3f5f1;padding:12px 14px;border-radius:8px;overflow:auto}code{font-family:Consolas,monospace}
ul[data-type=taskList]{list-style:none;padding-left:0}ul[data-type=taskList] li{display:flex;gap:8px}
mark{padding:0 2px}hr{border:0;border-top:1px solid #ccc;margin:1.5em 0}`;

export function htmlDocument(title, html) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${PAGE_CSS}</style></head><body><h1 class="doc-title" style="display:none"></h1>${withAbsoluteImages(html)}</body></html>`;
}

// ---------- Markdown ----------
const inlineText = (node) => {
  let out = '';
  node.childNodes.forEach((n) => { out += inlineNode(n); });
  return out;
};

function wrap(mark, text) {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
  return m[2] ? `${m[1]}${mark}${m[2]}${mark}${m[3]}` : text;
}

function inlineNode(n) {
  if (n.nodeType === 3) return n.textContent.replace(/\s+/g, ' ');
  if (n.nodeType !== 1) return '';
  const tag = n.tagName.toLowerCase();
  const kids = () => inlineText(n);
  switch (tag) {
    case 'strong': case 'b': return wrap('**', kids());
    case 'em': case 'i': return wrap('*', kids());
    case 's': case 'del': return wrap('~~', kids());
    case 'code': return `\`${n.textContent}\``;
    case 'u': return `<u>${kids()}</u>`;
    case 'sub': return `<sub>${kids()}</sub>`;
    case 'sup': return `<sup>${kids()}</sup>`;
    case 'br': return '  \n';
    case 'a': return `[${kids()}](${n.getAttribute('href') || ''})`;
    case 'img': return `![${n.getAttribute('alt') || ''}](${absolute(n.getAttribute('src'))})`;
    default: return kids(); // span, mark and anything else keep their text
  }
}

function listToMarkdown(list, depth) {
  const ordered = list.tagName.toLowerCase() === 'ol';
  const pad = '  '.repeat(depth);
  const lines = [];
  let i = 1;
  Array.from(list.children).forEach((li) => {
    if (li.tagName.toLowerCase() !== 'li') return;
    const task = li.getAttribute('data-type') === 'taskItem';
    const box = task ? (li.getAttribute('data-checked') === 'true' ? '[x] ' : '[ ] ') : '';
    const bullet = ordered ? `${i++}. ` : '- ';
    const first = [];
    const nested = [];
    const holder = task ? (li.querySelector(':scope > div') || li) : li;
    Array.from(holder.childNodes).forEach((c) => {
      const t = c.nodeType === 1 ? c.tagName.toLowerCase() : '';
      if (t === 'ul' || t === 'ol') nested.push(listToMarkdown(c, depth + 1));
      else if (t === 'label') { /* the checkbox itself: shown through data-checked */ }
      else if (c.nodeType === 1 && /^(p|div|h[1-6])$/.test(t)) first.push(inlineText(c).trim());
      else first.push(inlineNode(c).trim());
    });
    lines.push(`${pad}${bullet}${box}${first.filter(Boolean).join(' ')}`);
    nested.forEach((n) => lines.push(n));
  });
  return lines.join('\n');
}

function tableToMarkdown(table) {
  const rows = Array.from(table.querySelectorAll('tr')).map((tr) =>
    Array.from(tr.children).map((c) => inlineText(c).replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()));
  if (!rows.length) return '';
  const width = Math.max(...rows.map((r) => r.length));
  const fill = (r) => Array.from({ length: width }, (_, i) => r[i] || '');
  const line = (r) => `| ${fill(r).join(' | ')} |`;
  return [line(rows[0]), `| ${Array(width).fill('---').join(' | ')} |`, ...rows.slice(1).map(line)].join('\n');
}

function blockToMarkdown(node) {
  if (node.nodeType === 3) return node.textContent.trim() ? node.textContent.trim() : '';
  if (node.nodeType !== 1) return '';
  const tag = node.tagName.toLowerCase();
  if (/^h[1-6]$/.test(tag)) return `${'#'.repeat(Number(tag[1]))} ${inlineText(node).trim()}`;
  if (tag === 'p') return inlineText(node).trim();
  if (tag === 'ul' || tag === 'ol') return listToMarkdown(node, 0);
  if (tag === 'blockquote') {
    const inner = Array.from(node.childNodes).map(blockToMarkdown).filter(Boolean).join('\n\n');
    return inner.split('\n').map((l) => `> ${l}`.trimEnd()).join('\n');
  }
  if (tag === 'pre') return `\`\`\`\n${node.textContent.replace(/\n$/, '')}\n\`\`\``;
  if (tag === 'hr') return '---';
  if (tag === 'table') return tableToMarkdown(node);
  if (tag === 'img') return inlineNode(node);
  return Array.from(node.childNodes).map(blockToMarkdown).filter(Boolean).join('\n\n');
}

export function htmlToMarkdown(html) {
  const body = parse(html);
  return `${Array.from(body.childNodes).map(blockToMarkdown).filter(Boolean).join('\n\n')}\n`;
}

// ---------- plain text ----------
export function htmlToText(html) {
  const body = parse(html);
  body.querySelectorAll('li').forEach((li) => li.prepend(li.getAttribute('data-type') === 'taskItem'
    ? (li.getAttribute('data-checked') === 'true' ? '[x] ' : '[ ] ') : '• '));
  // paragraphs and headings get a blank line after them, except inside list items and table cells
  body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, blockquote, pre').forEach((b) => {
    if (!b.closest('li, td, th')) b.append('\n\n');
  });
  body.querySelectorAll('li > ul, li > ol').forEach((l) => l.before('\n'));
  body.querySelectorAll('li, tr, hr').forEach((b) => b.append('\n'));
  body.querySelectorAll('ul, ol, table').forEach((l) => { if (!l.closest('li')) l.append('\n'); });
  body.querySelectorAll('td, th').forEach((c) => c.append('\t'));
  body.querySelectorAll('br').forEach((b) => b.replaceWith('\n'));
  return `${body.textContent.replace(/\t+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

// ---------- delivery ----------
export function downloadFile(title, ext, mime, content) {
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName(title)}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Opens the browser's print dialog for the document; "Save as PDF" is one of its destinations. */
export function printDocument(title, html) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  frame.srcdoc = htmlDocument(title, html).replace('<h1 class="doc-title" style="display:none"></h1>',
    `<h1 style="font:700 30px Georgia,serif;margin:0 0 .6em">${escapeHtml(title)}</h1>`);
  frame.onload = () => {
    const w = frame.contentWindow;
    w.focus();
    w.print();
    setTimeout(() => frame.remove(), 2000);
  };
  document.body.appendChild(frame);
}
