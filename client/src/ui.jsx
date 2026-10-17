import { useEffect, useRef, useState } from 'react';

const PATHS = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6',
  users: 'M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21 20v-1a4 4 0 0 0-3-3.9M16 4.1a3.5 3.5 0 0 1 0 6.8',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M21 21l-4.3-4.3',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  share: 'M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  back: 'M15 18l-6-6 6-6',
  bold: 'M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z',
  italic: 'M19 4h-9M14 20H5M15 4L9 20',
  underline: 'M7 4v7a5 5 0 0 0 10 0V4M5 21h14',
  ul: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  ol: 'M10 6h10M10 12h10M10 18h10M4 4.5l1.5-.8V9M3.8 14h2.6l-2.6 3.5h2.8',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  redo: 'M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3',
  check: 'M5 12l5 5 9-10',
  x: 'M6 6l12 12M18 6L6 18',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  mail: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM3 7l9 6 9-6',
  menu: 'M4 7h16M4 12h16M4 17h16',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  type: 'M4 7V5h16v2M12 5v14M9 19h6',
  strike: 'M4 12h16M7 6.5C7.5 4.8 9.3 4 12 4c3 0 5 1.2 5 3.2M8 17.5c.6 1.6 2.4 2.5 4.2 2.5 2.8 0 4.8-1.3 4.8-3.4',
  alignLeft: 'M4 6h16M4 10h10M4 14h16M4 18h10',
  alignCenter: 'M4 6h16M7 10h10M4 14h16M7 18h10',
  alignRight: 'M4 6h16M10 10h10M4 14h16M10 18h10',
  justify: 'M4 6h16M4 10h16M4 14h16M4 18h16',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9.5h.01',
  table: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14M16 5v14',
  quote: 'M7 17h3l1-4V7H5v6h3zM16 17h3l1-4V7h-6v6h3z',
  code: 'M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14',
  hr: 'M3 12h18M8 6h8M8 18h8',
  checklist: 'M4 6l1.5 1.5L8 5M4 13l1.5 1.5L8 12M11 6h9M11 13h9M4 19h.01M11 19h9',
  indent: 'M4 6h16M10 10h10M10 14h10M4 18h16M4 9l3 3-3 3',
  outdent: 'M4 6h16M10 10h10M10 14h10M4 18h16M7 9l-3 3 3 3',
  eraser: 'M20 20H9l-5-5a2 2 0 0 1 0-2.8l8-8a2 2 0 0 1 2.8 0l5 5a2 2 0 0 1 0 2.8L12 20M8 10l6 6',
  highlighter: 'M9 11l4 4M4 20l4-1 11-11-3-3L5 16zM14 6l3 3',
  save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  print: 'M7 9V4h10v5M7 17H5v-6h14v6h-2M7 14h10v6H7z',
  eyeOff: 'M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.6 7.6C3.9 9.3 2 12 2 12s4 7 10 7c1.6 0 3-.4 4.3-1M9.9 9.9a3 3 0 0 0 4.2 4.2',
};

export function Icon({ name, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="icon">
      <path d={PATHS[name]} />
    </svg>
  );
}

export function Logo({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4E8A62" /><stop offset="1" stopColor="#2F5D6B" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#lg)" />
      <path d="M19 12h18l9 9v28a3 3 0 0 1-3 3H19a3 3 0 0 1-3-3V15a3 3 0 0 1 3-3z" fill="#fff" />
      <path d="M37 12v9h9z" fill="#CFE3D5" />
      <path d="M23 30h17M23 36h11" stroke="#9DB8A6" strokeWidth="3" strokeLinecap="round" />
      <path d="M34 53c-1-10 6-17 17-19-.5 10-6 18-17 19z" fill="#E8894F" />
      <path d="M36 51c3-5 7-9 12-12" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </svg>
  );
}

// background art that says "writing together": stacked pages with two live cursors
export function CollabArt({ className = '' }) {
  return (
    <svg className={`collab-art ${className}`} viewBox="0 0 360 300" aria-hidden="true">
      <rect x="70" y="40" width="210" height="250" rx="16" fill="#fff" opacity=".35" transform="rotate(-8 175 165)" />
      <rect x="85" y="28" width="210" height="250" rx="16" fill="#fff" opacity=".6" transform="rotate(4 190 153)" />
      <rect x="78" y="20" width="214" height="256" rx="16" fill="#fff" />
      <rect x="104" y="52" width="110" height="12" rx="6" fill="#47664F" />
      <rect x="104" y="84" width="160" height="7" rx="3.5" fill="#CFDACF" />
      <rect x="104" y="102" width="140" height="7" rx="3.5" fill="#CFDACF" />
      <rect x="104" y="120" width="158" height="7" rx="3.5" fill="#CFDACF" />
      <rect x="104" y="150" width="90" height="7" rx="3.5" fill="#F3D4C2" />
      <rect x="104" y="168" width="150" height="7" rx="3.5" fill="#CFDACF" />
      <rect x="104" y="186" width="120" height="7" rx="3.5" fill="#CFDACF" />
      <rect x="104" y="214" width="150" height="7" rx="3.5" fill="#CFE5EA" />
      <rect x="104" y="232" width="100" height="7" rx="3.5" fill="#CFDACF" />
      <g transform="translate(198 140)">
        <path d="M0 0v24l7-6 5 11 5-2-5-11h9z" fill="#E8894F" />
        <rect x="14" y="26" width="42" height="18" rx="9" fill="#E8894F" />
        <text x="35" y="39" textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff" fontFamily="Inter, sans-serif">Alice</text>
      </g>
      <g transform="translate(236 205)">
        <path d="M0 0v24l7-6 5 11 5-2-5-11h9z" fill="#3E8EA3" />
        <rect x="14" y="26" width="38" height="18" rx="9" fill="#3E8EA3" />
        <text x="33" y="39" textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff" fontFamily="Inter, sans-serif">Bob</text>
      </g>
    </svg>
  );
}

const COLORS = ['#D8754B', '#4E8A62', '#3E8EA3', '#D9A12E', '#8E6A9E', '#C4617A'];
export const colorFor = (key) => {
  const s = String(key ?? '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
};

export function Avatar({ name = '?', size = 28 }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';
  return (
    <span className="avatar" style={{ width: size, height: size, background: colorFor(name), fontSize: size * 0.4 }}
      title={name}>{initials}</span>
  );
}

export function Menu({ label, trigger, align = 'right', children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div className="menu-wrap" ref={ref}>
      <button type="button" className="icon-btn" aria-label={label} aria-haspopup="menu" aria-expanded={open}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}>
        {trigger || <Icon name="more" size={20} />}
      </button>
      {open && (
        <div className={`menu ${align}`} role="menu" onClick={() => setOpen(false)}>{children}</div>
      )}
    </div>
  );
}

export function MenuItem({ icon, onClick, danger, selected, children }) {
  return (
    <button type="button" role="menuitem" className={`menu-item${danger ? ' danger' : ''}`} onClick={onClick}>
      {icon ? <Icon name={icon} size={16} /> : <span className="menu-gap" />}
      <span>{children}</span>
      {selected && <Icon name="check" size={15} />}
    </button>
  );
}
export const MenuLabel = ({ children }) => <p className="menu-label">{children}</p>;
export const MenuRule = () => <hr className="menu-rule" />;

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        {children}
      </div>
    </>
  );
}

export function ago(s) {
  if (!s) return '';
  const t = new Date(s.replace(' ', 'T') + 'Z').getTime();
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} day${d > 1 ? 's' : ''} ago`;
  return new Date(t).toLocaleDateString([], { dateStyle: 'medium' });
}

// ---------- themed dialogs (replace the browser's confirm pop-up) ----------
let openDialog = null;

/** Shows a themed dialog and resolves with the `value` of the button pressed (or `cancelValue` on Esc / outside click). */
export function askDialog({ title, message, buttons, cancelValue = null, tone = 'default', input = null }) {
  if (!openDialog) return Promise.resolve(cancelValue);
  return new Promise((resolve) => openDialog({ title, message, buttons, cancelValue, tone, input, resolve }));
}

/** Asks for one line of text. Resolves the text, '' if the extra button (for example "Remove link") is pressed, or null if cancelled. */
export const promptDialog = ({ title, message, label, placeholder = '', initial = '', confirmLabel = 'Apply', extraLabel = '' }) =>
  askDialog({
    title, message, cancelValue: null, input: { label, placeholder, initial },
    buttons: [
      { label: 'Cancel', value: null },
      ...(extraLabel ? [{ label: extraLabel, value: '__extra__' }] : []),
      { label: confirmLabel, value: '__submit__', primary: true },
    ],
  });

/** Yes / no question. Resolves true or false. */
export const confirmDialog = ({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) =>
  askDialog({
    title, message, tone: danger ? 'danger' : 'default', cancelValue: false,
    buttons: [{ label: cancelLabel, value: false }, { label: confirmLabel, value: true, primary: !danger, danger }],
  });

export function DialogHost() {
  const [d, setD] = useState(null);
  const [text, setText] = useState('');
  const primary = useRef(null);
  const field = useRef(null);
  useEffect(() => { openDialog = (next) => { setText(next.input?.initial || ''); setD(next); }; return () => { openDialog = null; }; }, []);
  useEffect(() => { if (d) (field.current || primary.current)?.focus(); }, [d]);
  if (!d) return null;
  const close = (value) => {
    d.resolve(value === '__submit__' ? text.trim() : value === '__extra__' ? '' : value);
    setD(null);
  };
  return (
    <>
      <div className="scrim" onClick={() => close(d.cancelValue)} />
      <div className={`modal dialog ${d.tone}`} role="alertdialog" aria-labelledby="dlg-title" aria-describedby="dlg-msg"
        onKeyDown={(e) => { if (e.key === 'Escape') close(d.cancelValue); }}>
        <div className="dialog-icon"><Icon name={d.tone === 'danger' ? 'trash' : 'file'} size={22} /></div>
        <h3 id="dlg-title">{d.title}</h3>
        {d.message && <p id="dlg-msg">{d.message}</p>}
        {d.input && (
          <label className="field dialog-field">{d.input.label}
            <input ref={field} type="text" value={text} placeholder={d.input.placeholder}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); close('__submit__'); } }} />
          </label>
        )}
        <div className="dialog-actions">
          {d.buttons.map((b) => (
            <button key={b.label} type="button" ref={b.primary || b.danger ? primary : null}
              className={`btn${b.primary ? ' primary' : ''}${b.danger ? ' danger-solid' : ''}`}
              onClick={() => close(b.value)}>{b.label}</button>
          ))}
        </div>
      </div>
    </>
  );
}
