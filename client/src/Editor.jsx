import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import FontSize from './fontSize.js';
import { htmlDocument, htmlToMarkdown, htmlToText, downloadFile, printDocument } from './exporters.js';
import { api } from './api';
import ShareModal from './ShareModal.jsx';
import { Avatar, Icon, Menu, MenuItem, MenuLabel, MenuRule, ago, askDialog, promptDialog } from './ui.jsx';

const FONTS = [
  ['Default font', ''], ['Georgia', 'Georgia, serif'], ['Times New Roman', 'Times New Roman, serif'],
  ['Arial', 'Arial, sans-serif'], ['Verdana', 'Verdana, sans-serif'], ['Trebuchet', 'Trebuchet MS, sans-serif'],
  ['Courier', 'Courier New, monospace'], ['Comic Sans', 'Comic Sans MS, cursive'],
];
const SIZES = [10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64];
const TEXT_COLORS = ['#000000', '#4D4D4D', '#B04A36', '#D8754B', '#D9A12E', '#4E8A62', '#3E8EA3', '#2F5D6B', '#8E6A9E', '#C4617A'];
const HIGHLIGHTS = ['#FFF3B0', '#FFD6C2', '#CDEBD5', '#CFE5EA', '#E9D8F0', '#F8C8D8'];
const IMAGE_TYPES = /^image\/(png|jpe?g|gif|webp)$/;

function Tb({ label, on, active, disabled, children }) {
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={!!active} disabled={disabled}
      className={`tb${active ? ' on' : ''}`}
      onMouseDown={(e) => { e.preventDefault(); if (!disabled) on(); }}>{children}</button>
  );
}

// a toolbar button that opens a small palette (text colour, highlight)
function ColorTool({ label, icon, text, colors, current, onPick, custom = true }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  return (
    <div className="tb-pop-wrap" ref={ref}>
      <button type="button" className={`tb${open ? ' on' : ''}`} title={label} aria-label={label} aria-haspopup="true" aria-expanded={open}
        onMouseDown={(e) => { e.preventDefault(); setOpen((o) => !o); }}>
        {icon ? <Icon name={icon} /> : <span className="tb-text">{text}</span>}
        <span className="tb-bar" style={{ background: current || 'transparent' }} />
      </button>
      {open && (
        <div className="tb-pop" role="dialog" aria-label={label}
          onMouseDown={(e) => { if (e.target.tagName !== 'INPUT') e.preventDefault(); }}>
          <div className="swatches">
            {colors.map((c) => (
              <button type="button" key={c} className={`swatch${current === c ? ' on' : ''}`} style={{ background: c }}
                aria-label={c} onClick={() => { onPick(c); setOpen(false); }} />
            ))}
          </div>
          <div className="tb-pop-row">
            <button type="button" className="link-btn" onClick={() => { onPick(null); setOpen(false); }}>None</button>
            {custom && (
              <label className="custom-color">Custom
                <input type="color" value={/^#[0-9a-f]{6}$/i.test(current || '') ? current : '#000000'}
                  onChange={(e) => onPick(e.target.value)} />
              </label>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Toolbar({ editor, pickImage }) {
  if (!editor) return null;
  const c = () => editor.chain().focus();
  const attrs = editor.getAttributes('textStyle');
  const headingLevel = [1, 2, 3].find((l) => editor.isActive('heading', { level: l }));
  const inList = editor.isActive('listItem') ? 'listItem' : editor.isActive('taskItem') ? 'taskItem' : null;

  const setLink = async () => {
    const previous = editor.getAttributes('link').href || '';
    const entered = await promptDialog({
      title: previous ? 'Edit link' : 'Add a link', label: 'Web address', placeholder: 'https://example.com',
      initial: previous, confirmLabel: previous ? 'Update' : 'Add link', extraLabel: previous ? 'Remove link' : '',
    });
    if (entered === null) return;
    if (entered === '') { c().extendMarkRange('link').unsetLink().run(); return; }
    const href = /^(https?:\/\/|mailto:)/i.test(entered) ? entered : `https://${entered}`;
    const { from, to } = editor.state.selection;
    if (from === to && !editor.isActive('link')) {
      c().insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }).run();
    } else c().extendMarkRange('link').setLink({ href }).run();
  };

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <div className="group">
        <Tb label="Undo (Ctrl+Z)" on={() => c().undo().run()}><Icon name="undo" /></Tb>
        <Tb label="Redo (Ctrl+Y)" on={() => c().redo().run()}><Icon name="redo" /></Tb>
        <Tb label="Clear formatting" on={() => c().unsetAllMarks().clearNodes().run()}><Icon name="eraser" /></Tb>
      </div>
      <div className="group">
        <select className="tb-select" aria-label="Text style" value={headingLevel ? `h${headingLevel}` : 'p'}
          onChange={(e) => (e.target.value === 'p' ? c().setParagraph().run() : c().setHeading({ level: Number(e.target.value[1]) }).run())}>
          <option value="p">Normal text</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>
        <select className="tb-select font" aria-label="Font" value={attrs.fontFamily || ''}
          onChange={(e) => (e.target.value ? c().setFontFamily(e.target.value).run() : c().unsetFontFamily().run())}>
          {FONTS.map(([name, value]) => <option key={name} value={value}>{name}</option>)}
        </select>
        <select className="tb-select size" aria-label="Font size" value={attrs.fontSize ? parseInt(attrs.fontSize, 10) : ''}
          onChange={(e) => (e.target.value ? c().setFontSize(`${e.target.value}px`).run() : c().unsetFontSize().run())}>
          <option value="">Size</option>
          {SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <div className="group">
        <Tb label="Bold (Ctrl+B)" active={editor.isActive('bold')} on={() => c().toggleBold().run()}><Icon name="bold" /></Tb>
        <Tb label="Italic (Ctrl+I)" active={editor.isActive('italic')} on={() => c().toggleItalic().run()}><Icon name="italic" /></Tb>
        <Tb label="Underline (Ctrl+U)" active={editor.isActive('underline')} on={() => c().toggleUnderline().run()}><Icon name="underline" /></Tb>
        <Tb label="Strikethrough" active={editor.isActive('strike')} on={() => c().toggleStrike().run()}><Icon name="strike" /></Tb>
        <Tb label="Subscript" active={editor.isActive('subscript')} on={() => c().toggleSubscript().run()}><span className="tb-text">x<sub>2</sub></span></Tb>
        <Tb label="Superscript" active={editor.isActive('superscript')} on={() => c().toggleSuperscript().run()}><span className="tb-text">x<sup>2</sup></span></Tb>
        <ColorTool label="Text colour" text="A" colors={TEXT_COLORS} current={attrs.color}
          onPick={(col) => (col ? c().setColor(col).run() : c().unsetColor().run())} />
        <ColorTool label="Highlight" icon="highlighter" colors={HIGHLIGHTS} current={editor.getAttributes('highlight').color} custom={false}
          onPick={(col) => (col ? c().setHighlight({ color: col }).run() : c().unsetHighlight().run())} />
      </div>
      <div className="group">
        <Tb label="Align left" active={editor.isActive({ textAlign: 'left' })} on={() => c().setTextAlign('left').run()}><Icon name="alignLeft" /></Tb>
        <Tb label="Align centre" active={editor.isActive({ textAlign: 'center' })} on={() => c().setTextAlign('center').run()}><Icon name="alignCenter" /></Tb>
        <Tb label="Align right" active={editor.isActive({ textAlign: 'right' })} on={() => c().setTextAlign('right').run()}><Icon name="alignRight" /></Tb>
        <Tb label="Justify" active={editor.isActive({ textAlign: 'justify' })} on={() => c().setTextAlign('justify').run()}><Icon name="justify" /></Tb>
      </div>
      <div className="group">
        <Tb label="Bulleted list" active={editor.isActive('bulletList')} on={() => c().toggleBulletList().run()}><Icon name="ul" /></Tb>
        <Tb label="Numbered list" active={editor.isActive('orderedList')} on={() => c().toggleOrderedList().run()}><Icon name="ol" /></Tb>
        <Tb label="Checklist" active={editor.isActive('taskList')} on={() => c().toggleTaskList().run()}><Icon name="checklist" /></Tb>
        <Tb label="Increase indent" disabled={!inList} on={() => c().sinkListItem(inList).run()}><Icon name="indent" /></Tb>
        <Tb label="Decrease indent" disabled={!inList} on={() => c().liftListItem(inList).run()}><Icon name="outdent" /></Tb>
      </div>
      <div className="group">
        <Tb label="Link" active={editor.isActive('link')} on={setLink}><Icon name="link" /></Tb>
        <Tb label="Insert image" on={pickImage}><Icon name="image" /></Tb>
        <Tb label="Insert table" active={editor.isActive('table')} on={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Icon name="table" /></Tb>
        <Tb label="Quote" active={editor.isActive('blockquote')} on={() => c().toggleBlockquote().run()}><Icon name="quote" /></Tb>
        <Tb label="Code block" active={editor.isActive('codeBlock')} on={() => c().toggleCodeBlock().run()}><Icon name="code" /></Tb>
        <Tb label="Horizontal line" on={() => c().setHorizontalRule().run()}><Icon name="hr" /></Tb>
      </div>
      {editor.isActive('table') && (
        <div className="group table-tools" aria-label="Table tools">
          <Tb label="Add row below" on={() => c().addRowAfter().run()}><span className="tb-text">+ Row</span></Tb>
          <Tb label="Add column right" on={() => c().addColumnAfter().run()}><span className="tb-text">+ Column</span></Tb>
          <Tb label="Delete row" on={() => c().deleteRow().run()}><span className="tb-text">− Row</span></Tb>
          <Tb label="Delete column" on={() => c().deleteColumn().run()}><span className="tb-text">− Column</span></Tb>
          <Tb label="Header row on or off" on={() => c().toggleHeaderRow().run()}><span className="tb-text">Header</span></Tb>
          <Tb label="Delete table" on={() => c().deleteTable().run()}><span className="tb-text">Delete table</span></Tb>
        </div>
      )}
    </div>
  );
}

const STATUS = {
  Saved: ['ok', 'Saved'],
  Saving: ['busy', 'Saving'],
  'Unsaved changes': ['busy', 'Unsaved changes'],
  'Not saved': ['bad', 'Not saved'],
};

const readAutosave = () => { try { return localStorage.getItem('draftly_autosave') !== '0'; } catch { return true; } };

export default function Editor({
  id, categories = [], teams = [], openShare = false, onChanged = () => {}, onTrashed = () => {},
  onCreateTeam = () => {}, notify = () => {},
}) {
  const [doc, setDoc] = useState(null);
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('Saved');
  const [error, setError] = useState('');
  const [sharing, setSharing] = useState(openShare);
  const [autosave, setAutosave] = useState(readAutosave);

  const pending = useRef({});
  const timer = useRef(null);
  const ready = useRef(false);
  const statusRef = useRef('Saved');
  const autosaveRef = useRef(autosave);
  const fileInput = useRef(null);
  const uploadRef = useRef(() => {});
  autosaveRef.current = autosave;

  const setSt = (s) => { statusRef.current = s; setStatus(s); };

  // resolves true when everything is saved (or there was nothing to save)
  const flush = async () => {
    clearTimeout(timer.current);
    const body = pending.current;
    if (!Object.keys(body).length) return true;
    pending.current = {};
    setSt('Saving');
    try {
      await api(`/documents/${id}`, { method: 'PATCH', body });
      setSt('Saved');
      setError('');
      setDoc((d) => d && { ...d, updated_at: new Date().toISOString().slice(0, 19).replace('T', ' ') });
      onChanged();
      return true;
    } catch (e) {
      pending.current = { ...body, ...pending.current };
      setSt('Not saved');
      setError(e.message);
      return false;
    }
  };
  const queue = (patch) => {
    pending.current = { ...pending.current, ...patch };
    setSt('Unsaved changes');
    clearTimeout(timer.current);
    if (autosaveRef.current) timer.current = setTimeout(flush, 800);
  };

  const saveNow = async () => {
    if (await flush()) notify({ text: 'All changes saved' });
  };

  const uploadImage = async (file) => {
    if (!file) return;
    setError('');
    if (!IMAGE_TYPES.test(file.type)) { setError('Use a PNG, JPG, GIF or WebP image.'); return; }
    if (file.size > 4 * 1024 * 1024) { setError('That image is too large (max 4 MB).'); return; }
    const form = new FormData();
    form.append('image', file);
    try {
      const r = await api('/images', { method: 'POST', body: form });
      editor.chain().focus().setImage({ src: r.url, alt: file.name.replace(/\.[^.]+$/, '') }).run();
    } catch (e) { setError(e.message); }
  };
  uploadRef.current = uploadImage;

  const imageFrom = (list) => Array.from(list || []).find((f) => IMAGE_TYPES.test(f.type));

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline, TextStyle, Color, FontFamily, FontSize,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }),
      Image.configure({ allowBase64: false }),
      Subscript, Superscript,
      TaskList, TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }), TableRow, TableHeader, TableCell,
      Placeholder.configure({ placeholder: 'Start writing…' }),
      CharacterCount,
    ],
    content: '',
    editable: false,
    editorProps: {
      handlePaste: (_view, event) => {
        const file = imageFrom(event.clipboardData?.files);
        if (!file) return false;
        event.preventDefault(); uploadRef.current(file); return true;
      },
      handleDrop: (_view, event) => {
        const file = imageFrom(event.dataTransfer?.files);
        if (!file) return false;
        event.preventDefault(); uploadRef.current(file); return true;
      },
    },
    onUpdate: ({ editor: ed }) => { if (ready.current) queue({ content: ed.getHTML() }); },
  });

  const load = () => api(`/documents/${id}`).then((d) => { setDoc(d); return d; });

  useEffect(() => {
    if (!editor) return undefined;
    load()
      .then((d) => {
        setTitle(d.title);
        editor.commands.setContent(d.content, false);
        editor.setEditable(d.role !== 'viewer');
        ready.current = true;
      })
      .catch((e) => setError(e.message));
    return () => { flush(); };
  }, [editor, id]);

  // changes that are waiting to be saved and would be lost by leaving without a decision
  const needsDecision = () =>
    Object.keys(pending.current).length > 0 && (!autosaveRef.current || statusRef.current === 'Not saved');

  useEffect(() => {
    const onLinkClick = (e) => {
      const a = e.target.closest?.('a[href^="#"]');
      if (!a || !needsDecision()) return;
      e.preventDefault(); e.stopPropagation();
      const href = a.getAttribute('href');
      askDialog({
        title: 'Save your changes?', message: 'You have changes that have not been saved yet.', cancelValue: 'stay',
        buttons: [
          { label: 'Keep editing', value: 'stay' },
          { label: 'Discard', value: 'discard', danger: true },
          { label: 'Save', value: 'save', primary: true },
        ],
      }).then(async (choice) => {
        if (choice === 'stay') return;
        if (choice === 'discard') { clearTimeout(timer.current); pending.current = {}; location.hash = href; return; }
        if (await flush()) location.hash = href;
      });
    };
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (ready.current) saveNow(); }
    };
    const onUnload = (e) => { if (needsDecision()) { e.preventDefault(); e.returnValue = ''; } };
    document.addEventListener('click', onLinkClick, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      document.removeEventListener('click', onLinkClick, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [id]);

  const toggleAutosave = () => {
    const next = !autosave;
    setAutosave(next);
    autosaveRef.current = next;
    try { localStorage.setItem('draftly_autosave', next ? '1' : '0'); } catch { /* preference just isn't remembered */ }
    if (next) flush();
    notify({ text: next ? 'Autosave is on' : 'Autosave is off. Press Save or Ctrl+S to keep your changes.' });
  };

  const changeCategory = async (value) => {
    try {
      await api(`/documents/${id}`, { method: 'PATCH', body: { category_id: value === '' ? null : Number(value) } });
      await load();
      onChanged();
    } catch (e) { setError(e.message); }
  };

  const moveToTrash = async () => {
    await flush();
    try {
      await api(`/documents/${id}`, { method: 'DELETE' });
      onTrashed({ id: doc.id, title: title || doc.title });
    } catch (e) { setError(e.message); }
  };

  const saveCopy = async () => {
    if (!(await flush())) return;
    try {
      const r = await api(`/documents/${id}/copy`, { method: 'POST' });
      onChanged();
      notify({ text: `Saved a copy as "${r.title}"` });
      location.hash = `#/doc/${r.id}`;
    } catch (e) { setError(e.message); }
  };

  const name = () => title || doc.title;
  const exportAs = (kind) => {
    const html = editor.getHTML();
    if (kind === 'html') downloadFile(name(), 'html', 'text/html', htmlDocument(name(), html).replace('<h1 class="doc-title" style="display:none"></h1>', ''));
    if (kind === 'md') downloadFile(name(), 'md', 'text/markdown', `# ${name()}\n\n${htmlToMarkdown(html)}`);
    if (kind === 'txt') downloadFile(name(), 'txt', 'text/plain', `${name()}\n\n${htmlToText(html)}`);
    notify({ text: `Downloaded "${name()}" as ${{ html: 'HTML', md: 'Markdown', txt: 'plain text' }[kind]}` });
  };

  if (error && !doc) {
    return (
      <div className="empty-state">
        <h3>We could not open this document</h3>
        <p>{error}</p>
        <a className="btn primary" href="#/">Back to documents</a>
      </div>
    );
  }
  if (!doc) return <p className="muted">Loading document</p>;

  const readOnly = doc.role === 'viewer';
  const owner = doc.role === 'owner';
  const [tone, statusText] = readOnly ? ['view', 'View only'] : STATUS[status];

  return (
    <div className="editor-page">
      <div className="editor-top">
        <a className="back" href="#/"><Icon name="back" size={18} />Documents</a>
        <div className="grow" />
        <span className={`status ${tone}`}><span className="status-dot" />{statusText}</span>
        {!readOnly && (
          <button className="btn" onClick={saveNow} disabled={status === 'Saved' || status === 'Saving'} title="Save (Ctrl+S)">
            <Icon name="save" size={16} />Save
          </button>
        )}
        {owner && <button className="btn primary" onClick={() => setSharing(true)}><Icon name="share" size={16} />Share</button>}
        <Menu label="File and document options">
          {!readOnly && <MenuItem icon="save" onClick={saveNow}>Save now</MenuItem>}
          <MenuItem icon="copy" onClick={saveCopy}>Save a copy</MenuItem>
          <MenuRule />
          <MenuLabel>Download as</MenuLabel>
          <MenuItem icon="download" onClick={() => exportAs('html')}>Web page (.html)</MenuItem>
          <MenuItem icon="download" onClick={() => exportAs('md')}>Markdown (.md)</MenuItem>
          <MenuItem icon="download" onClick={() => exportAs('txt')}>Plain text (.txt)</MenuItem>
          <MenuItem icon="print" onClick={() => printDocument(name(), editor.getHTML())}>Print or save as PDF</MenuItem>
          {!readOnly && <MenuRule />}
          {!readOnly && <MenuItem selected={autosave} onClick={toggleAutosave}>Autosave</MenuItem>}
          {owner && <MenuRule />}
          {owner && <MenuItem icon="trash" danger onClick={moveToTrash}>Move to trash</MenuItem>}
        </Menu>
      </div>

      <div className="editor-grid">
        <section className="editor-main">
          <input
            className="title"
            value={title}
            readOnly={readOnly}
            maxLength={200}
            placeholder="Untitled document"
            aria-label="Document title"
            onChange={(e) => {
              setTitle(e.target.value);
              if (e.target.value.trim()) queue({ title: e.target.value });
            }}
          />
          {error && <p className="error">{error}</p>}
          {!readOnly && <Toolbar editor={editor} pickImage={() => fileInput.current?.click()} />}
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden
            onChange={(e) => { uploadImage(e.target.files?.[0]); e.target.value = ''; }} />
          {readOnly && <p className="view-note"><Icon name="eye" size={16} />You can read this document but not change it.</p>}
          <EditorContent editor={editor} className="paper" />
          {editor && (
            <p className="doc-stats" aria-live="off">
              {editor.storage.characterCount.words()} words · {editor.storage.characterCount.characters()} characters
            </p>
          )}
        </section>

        <aside className="details">
          <div className="panel">
            <h2 className="subhead">About</h2>
            <div className="detail-row">
              <Avatar name={doc.owner_name} size={30} />
              <div className="grow"><strong>{owner ? 'You' : doc.owner_name}</strong><span className="muted">Owner</span></div>
              <span className={`chip role-${doc.role}`}>{doc.role}</span>
            </div>
            <p className="muted small">Last edited {ago(doc.updated_at)}</p>
          </div>

          <div className="panel">
            <h2 className="subhead">Sharing</h2>
            {owner ? (
              <>
                <div className="chips">
                  <span className="chip"><Icon name="users" size={12} />{doc.shares.length} {doc.shares.length === 1 ? 'person' : 'people'}</span>
                  {doc.team && <span className="chip team">{doc.team.name} · {doc.team.role}</span>}
                </div>
                <button className="btn wide" onClick={() => setSharing(true)}><Icon name="share" size={16} />Manage sharing</button>
              </>
            ) : (
              <p className="muted small">
                {doc.owner_name} shared this with you{doc.team ? ` through ${doc.team.name}` : ''} as {doc.role === 'editor' ? 'an editor' : 'a viewer'}.
              </p>
            )}
          </div>

          {owner && (
            <div className="panel">
              <h2 className="subhead">Category</h2>
              <select className="select" aria-label="Category" value={doc.category_id ?? ''} onChange={(e) => changeCategory(e.target.value)}>
                <option value="">No category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
        </aside>
      </div>

      {sharing && (
        <ShareModal
          doc={doc} teams={teams}
          onClose={() => { setSharing(false); if (location.hash.endsWith('/share')) history.replaceState(null, '', `#/doc/${id}`); }}
          onChange={async () => { await load(); onChanged(); }}
          onCreateTeam={onCreateTeam}
        />
      )}
    </div>
  );
}
