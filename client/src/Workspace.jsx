import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import Editor from './Editor.jsx';
import TeamPage from './TeamPage.jsx';
import {
  Avatar, CollabArt, Icon, Logo, Menu, MenuItem, MenuLabel, MenuRule, Modal, ago, colorFor, confirmDialog,
} from './ui.jsx';

const EMPTY = { owned: [], shared: [], trash: [], categories: [], teams: [], invites: [] };

function useHash() {
  const [h, setH] = useState(location.hash);
  useEffect(() => {
    const f = () => setH(location.hash);
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, []);
  return h;
}

function parseView(hash) {
  let m = /^#\/doc\/(\d+)(\/share)?$/.exec(hash);
  if (m) return { name: 'doc', id: m[1], share: !!m[2] };
  m = /^#\/category\/(\d+)$/.exec(hash);
  if (m) return { name: 'category', id: Number(m[1]) };
  m = /^#\/team\/(\d+)$/.exec(hash);
  if (m) return { name: 'team', id: Number(m[1]) };
  if (hash === '#/owned') return { name: 'owned' };
  if (hash === '#/shared') return { name: 'shared' };
  if (hash === '#/trash') return { name: 'trash' };
  return { name: 'home' };
}

const ROLE_LABEL = { owner: 'Owner', editor: 'Editor', viewer: 'Viewer' };

function NavLink({ href, on, icon, dot, label, count, onClick }) {
  return (
    <a href={href} className={`nav${on ? ' on' : ''}`} onClick={onClick}>
      {dot ? <span className="dot" style={{ background: dot }} /> : <Icon name={icon} size={18} />}
      <span className="nav-label">{label}</span>
      {count !== undefined && <span className="count">{count}</span>}
    </a>
  );
}

function DocCard({ d, categories, categoryName, onTrash, onMove }) {
  const owner = d.role === 'owner';
  return (
    <article className="card" style={{ '--tint': colorFor(d.id) }}>
      <a className="card-link" href={`#/doc/${d.id}`} aria-label={`Open ${d.title}`} />
      <div className="thumb">
        <p>{d.snippet || 'Empty document. Open it to start writing.'}</p>
      </div>
      <div className="card-body">
        <h3 title={d.title}>{d.title}</h3>
        <div className="card-meta">
          <Avatar name={d.owner_name} size={22} />
          <span>{owner ? 'You' : d.owner_name}</span>
          <span className="sep">·</span>
          <span>{ago(d.updated_at)}</span>
        </div>
        <div className="chips">
          <span className={`chip role-${d.role}`}>{ROLE_LABEL[d.role]}</span>
          {d.team_name && <span className="chip team"><Icon name="users" size={12} />{d.team_name}</span>}
          {categoryName && <span className="chip cat"><Icon name="folder" size={12} />{categoryName}</span>}
        </div>
      </div>
      {owner && (
        <div className="card-menu">
          <Menu label={`Options for ${d.title}`}>
            <MenuItem icon="file" onClick={() => { location.hash = `#/doc/${d.id}`; }}>Open</MenuItem>
            <MenuItem icon="share" onClick={() => { location.hash = `#/doc/${d.id}/share`; }}>Share</MenuItem>
            <MenuRule />
            <MenuLabel>Move to category</MenuLabel>
            {categories.length === 0 && <p className="menu-empty">No categories yet</p>}
            {categories.map((c) => (
              <MenuItem key={c.id} icon="folder" selected={d.category_id === c.id} onClick={() => onMove(d, c.id)}>
                {c.name}
              </MenuItem>
            ))}
            {d.category_id && <MenuItem icon="x" onClick={() => onMove(d, null)}>Remove from category</MenuItem>}
            <MenuRule />
            <MenuItem icon="trash" danger onClick={() => onTrash(d)}>Move to trash</MenuItem>
          </Menu>
        </div>
      )}
    </article>
  );
}

function Section({ title, count, children, action }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}{count !== undefined && <span className="section-count">{count}</span>}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ title, text, children }) {
  return (
    <div className="empty-state">
      <CollabArt className="empty-art" />
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  );
}

function CreateTeamModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const t = await api('/teams', { method: 'POST', body: { name } });
      onCreated(t);
    } catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <Modal title="Create a team" onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <p className="muted">A team is a group of people who can share documents. You can invite members by email afterwards.</p>
        <label className="field">Team name
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={50} placeholder="Product Squad" />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="row end">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!name.trim() || busy}>Create team</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Workspace({ me, onSignOut }) {
  const hash = useHash();
  const view = parseView(hash);
  const [data, setData] = useState(EMPTY);
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [addingCat, setAddingCat] = useState(false);
  const [catError, setCatError] = useState('');
  const [teamModal, setTeamModal] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  const reload = useCallback(
    () => api('/documents').then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message)),
    []
  );
  useEffect(() => { reload(); }, [reload, hash]);
  useEffect(() => { setNavOpen(false); }, [hash]);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const { owned, shared, trash, categories, teams, invites } = data;
  const q = query.trim().toLowerCase();
  const filter = (rows) => (q ? rows.filter((d) => d.title.toLowerCase().includes(q)) : rows);
  const catName = (d) => categories.find((c) => c.id === d.category_id)?.name;

  const run = async (fn) => {
    try { await fn(); await reload(); } catch (e) { setError(e.message); }
  };

  const createDoc = async (extra = {}) => {
    try {
      const body = { ...extra };
      if (view.name === 'category') body.category_id = view.id;
      const { id } = await api('/documents', { method: 'POST', body });
      location.hash = `#/doc/${id}`;
    } catch (e) { setError(e.message); }
  };

  const upload = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true); setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { id } = await api('/documents/import', { method: 'POST', body: fd });
      location.hash = `#/doc/${id}`;
    } catch (err) { setError(err.message); }
    setBusy(false);
  };

  const moveToTrash = (d) => run(async () => {
    await api(`/documents/${d.id}`, { method: 'DELETE' });
    setToast({ text: `Moved "${d.title}" to the trash`, action: 'Undo', onAction: () => restore(d) });
  });
  const restore = (d) => run(async () => {
    await api(`/documents/${d.id}/restore`, { method: 'POST' });
    setToast({ text: `Restored "${d.title}"` });
  });
  const purge = async (d) => {
    if (!(await confirmDialog({
      title: 'Delete forever?', message: `"${d.title}" will be permanently deleted. This cannot be undone.`,
      confirmLabel: 'Delete forever', danger: true,
    }))) return;
    run(() => api(`/documents/${d.id}/permanent`, { method: 'DELETE' }));
  };
  const emptyTrash = async () => {
    if (!(await confirmDialog({
      title: 'Empty the trash?', message: 'Everything in the trash will be permanently deleted. This cannot be undone.',
      confirmLabel: 'Empty trash', danger: true,
    }))) return;
    run(() => api('/trash', { method: 'DELETE' }));
  };
  const moveDoc = (d, categoryId) => run(() =>
    api(`/documents/${d.id}`, { method: 'PATCH', body: { category_id: categoryId } }));

  const addCategory = async (e) => {
    e.preventDefault();
    setCatError('');
    try {
      const c = await api('/categories', { method: 'POST', body: { name: newCat } });
      setNewCat(''); setAddingCat(false);
      await reload();
      location.hash = `#/category/${c.id}`;
    } catch (err) { setCatError(err.message); }
  };
  const removeCategory = async (c) => {
    if (!(await confirmDialog({
      title: `Delete the category "${c.name}"?`, message: 'Its documents are kept and become uncategorized.',
      confirmLabel: 'Delete category', danger: true,
    }))) return;
    run(async () => { await api(`/categories/${c.id}`, { method: 'DELETE' }); location.hash = '#/'; });
  };

  const answerInvite = (inv, accept) => run(async () => {
    const r = await api(`/invites/${inv.id}/${accept ? 'accept' : 'decline'}`, { method: 'POST' });
    if (accept) { setToast({ text: `You joined ${inv.team_name}` }); location.hash = `#/team/${r.team_id}`; }
  });

  const onSearch = (value) => {
    setQuery(value);
    if (view.name === 'doc') location.hash = '#/';
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const category = view.name === 'category' ? categories.find((c) => c.id === view.id) : null;
  const cardProps = { categories, onTrash: moveToTrash, onMove: moveDoc };
  const grid = (rows) => (
    <div className="grid">
      {rows.map((d) => <DocCard key={d.id} d={d} categoryName={catName(d)} {...cardProps} />)}
    </div>
  );
  const none = q ? <Empty title="No matches" text="No documents have that title. Try a different search." /> : null;

  let content;
  if (view.name === 'trash') {
    const rows = filter(trash);
    content = (
      <>
        <header className="page-head">
          <div><h1>Trash</h1><p className="muted">Trashed documents are hidden from everyone you shared them with.</p></div>
          {trash.length > 0 && <button className="btn" onClick={emptyTrash}><Icon name="trash" size={16} />Empty trash</button>}
        </header>
        {rows.length === 0 ? (none || <Empty title="Trash is empty" text="Documents you delete wait here until you restore or remove them for good." />) : (
          <div className="list">
            {rows.map((d) => (
              <div className="list-row" key={d.id}>
                <Icon name="file" />
                <div className="grow"><strong>{d.title}</strong><span className="muted"> Deleted {ago(d.deleted_at)}</span></div>
                <button className="btn" onClick={() => restore(d)}>Restore</button>
                <button className="btn danger" onClick={() => purge(d)}>Delete forever</button>
              </div>
            ))}
          </div>
        )}
      </>
    );
  } else if (view.name === 'owned' || view.name === 'shared' || view.name === 'category') {
    const base = view.name === 'owned' ? owned : view.name === 'shared' ? shared
      : owned.filter((d) => d.category_id === view.id);
    const rows = filter(base);
    const titles = {
      owned: ['My documents', 'Everything you created or uploaded.'],
      shared: ['Shared with me', 'Documents other people or your teams gave you access to.'],
      category: [category ? category.name : 'Category', 'Documents you filed under this category.'],
    }[view.name];
    content = (
      <>
        <header className="page-head">
          <div><h1>{titles[0]}</h1><p className="muted">{titles[1]}</p></div>
          <div className="row">
            {category && <button className="btn" onClick={() => removeCategory(category)}><Icon name="trash" size={16} />Delete category</button>}
            {view.name !== 'shared' && <button className="btn primary" onClick={() => createDoc()}><Icon name="plus" size={16} />New document</button>}
          </div>
        </header>
        {view.name === 'category' && !category
          ? <Empty title="Category not found" text="This category no longer exists." />
          : rows.length === 0
            ? (none || <Empty title="Nothing here yet" text={view.name === 'shared' ? 'When someone shares a document with you, or you join a team, it shows up here.' : 'Create a document or upload a file to get started.'} />)
            : grid(rows)}
      </>
    );
  } else if (view.name === 'team') {
    content = (
      <TeamPage
        id={view.id} me={me}
        docs={[...owned, ...shared].filter((d) => d.team_id === view.id)}
        query={q} onChanged={reload}
        notify={setToast}
        renderCard={(d) => <DocCard key={d.id} d={d} categoryName={catName(d)} {...cardProps} />}
        onNewDoc={() => createDoc({ team_id: view.id })}
      />
    );
  } else if (view.name === 'doc') {
    content = null;
  } else {
    const mine = filter(owned);
    const theirs = filter(shared);
    content = (
      <>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">{greeting}</p>
            <h1>{me.name.split(' ')[0]}, what are we writing today?</h1>
            <p>{owned.length} {owned.length === 1 ? 'document' : 'documents'} of your own and {shared.length} shared with you.</p>
            <div className="row">
              <button className="btn light primary-on-dark" onClick={() => createDoc()}><Icon name="plus" size={16} />New document</button>
              <label className={`btn ghost-light${busy ? ' disabled' : ''}`}>
                <Icon name="upload" size={16} />{busy ? 'Importing' : 'Upload a file'}
                <input type="file" accept=".txt,.md,.docx" hidden onChange={upload} disabled={busy} />
              </label>
            </div>
            <p className="hero-note">Uploads accept .txt, .md and .docx up to 2 MB. Each file becomes an editable document.</p>
          </div>
          <CollabArt className="hero-art" />
        </section>

        <Section title="Your documents" count={mine.length}
          action={<a className="more" href="#/owned">See all</a>}>
          {mine.length === 0 ? (none || <Empty title="No documents yet" text="Start with a blank page or turn a file into a draft." />) : grid(mine.slice(0, 8))}
        </Section>
        <Section title="Shared with you" count={theirs.length}
          action={theirs.length > 8 && <a className="more" href="#/shared">See all</a>}>
          {theirs.length === 0 ? (none || <Empty title="Nothing shared yet" text="Documents shared by people or by your teams will appear here." />) : grid(theirs.slice(0, 8))}
        </Section>
      </>
    );
  }

  return (
    <div className={`shell${navOpen ? ' nav-open' : ''}`}>
      <aside className="rail">
        <a href="#/" className="brand"><Logo size={34} /><span>Draftly</span></a>
        <button className="btn primary wide new-btn" onClick={() => createDoc()}><Icon name="plus" size={18} />New document</button>

        <nav aria-label="Library">
          <NavLink href="#/" on={view.name === 'home' || view.name === 'doc'} icon="home" label="Home" />
          <NavLink href="#/owned" on={view.name === 'owned'} icon="file" label="My documents" count={owned.length} />
          <NavLink href="#/shared" on={view.name === 'shared'} icon="share" label="Shared with me" count={shared.length} />
          <NavLink href="#/trash" on={view.name === 'trash'} icon="trash" label="Trash" count={trash.length} />
        </nav>

        <nav aria-label="Teams">
          <div className="nav-title">
            <span>Teams</span>
            <button className="icon-btn small" onClick={() => setTeamModal(true)} aria-label="Create a team"><Icon name="plus" size={16} /></button>
          </div>
          {teams.length === 0 && (
            <button className="nav-hint" onClick={() => setTeamModal(true)}>Create a team to share documents with a group</button>
          )}
          {teams.map((t) => (
            <NavLink key={t.id} href={`#/team/${t.id}`} on={view.name === 'team' && view.id === t.id}
              dot={colorFor(`team${t.id}`)} label={t.name} count={t.member_count} />
          ))}
        </nav>

        <nav aria-label="Categories">
          <div className="nav-title">
            <span>Categories</span>
            <button className="icon-btn small" onClick={() => setAddingCat((v) => !v)} aria-label="New category"><Icon name="plus" size={16} /></button>
          </div>
          {addingCat && (
            <form className="cat-form" onSubmit={addCategory}>
              <input autoFocus type="text" maxLength={40} placeholder="Category name" aria-label="New category name"
                value={newCat} onChange={(e) => setNewCat(e.target.value)} />
              <button className="btn primary" disabled={!newCat.trim()}>Add</button>
            </form>
          )}
          {catError && <p className="hint bad">{catError}</p>}
          {categories.length === 0 && !addingCat && <p className="hint">Group your own documents into categories.</p>}
          {categories.map((c) => (
            <NavLink key={c.id} href={`#/category/${c.id}`} on={view.name === 'category' && view.id === c.id}
              dot={colorFor(`cat${c.id}`)} label={c.name} count={owned.filter((d) => d.category_id === c.id).length} />
          ))}
        </nav>
      </aside>
      <div className="rail-scrim" onClick={() => setNavOpen(false)} />

      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-toggle" onClick={() => setNavOpen(true)} aria-label="Open menu"><Icon name="menu" size={22} /></button>
          <div className="search">
            <Icon name="search" size={18} />
            <input type="search" placeholder="Search documents by title" aria-label="Search documents"
              value={query} onChange={(e) => onSearch(e.target.value)} />
          </div>
          <div className="topbar-right">
            <label className={`btn${busy ? ' disabled' : ''}`}>
              <Icon name="upload" size={16} /><span className="hide-sm">{busy ? 'Importing' : 'Upload'}</span>
              <input type="file" accept=".txt,.md,.docx" hidden onChange={upload} disabled={busy} />
            </label>
            <Menu label="Account menu" trigger={<Avatar name={me.name} size={36} />}>
              <div className="menu-profile">
                <strong>{me.name}</strong>
                <span className="muted">{me.email}</span>
              </div>
              <MenuRule />
              <MenuItem icon="logout" onClick={onSignOut}>Sign out</MenuItem>
            </Menu>
          </div>
        </header>

        <main className="content" key={view.name === 'doc' ? `doc-${view.id}` : view.name}>
          {error && <p className="error banner" role="alert">{error}</p>}
          {view.name !== 'doc' && invites.length > 0 && (
            <div className="invites">
              {invites.map((inv) => (
                <div className="invite" key={inv.id}>
                  <Icon name="mail" size={20} />
                  <p><strong>{inv.invited_by}</strong> invited you to join <strong>{inv.team_name}</strong></p>
                  <button className="btn primary" onClick={() => answerInvite(inv, true)}>Accept</button>
                  <button className="btn" onClick={() => answerInvite(inv, false)}>Decline</button>
                </div>
              ))}
            </div>
          )}
          {view.name === 'doc' ? (
            <Editor
              key={view.id}
              id={view.id}
              me={me}
              categories={categories}
              teams={teams}
              openShare={view.share}
              onChanged={reload}
              onCreateTeam={() => setTeamModal(true)}
              onTrashed={(d) => {
                setToast({ text: `Moved "${d.title}" to the trash`, action: 'Undo', onAction: () => restore(d) });
                location.hash = '#/';
              }}
              notify={setToast}
            />
          ) : content}
        </main>
      </div>

      {toast && (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          {toast.action && <button onClick={() => { toast.onAction(); setToast(null); }}>{toast.action}</button>}
          <button className="icon-btn small" onClick={() => setToast(null)} aria-label="Dismiss"><Icon name="x" size={14} /></button>
        </div>
      )}
      {teamModal && (
        <CreateTeamModal
          onClose={() => setTeamModal(false)}
          onCreated={async (t) => { setTeamModal(false); await reload(); location.hash = `#/team/${t.id}`; }}
        />
      )}
    </div>
  );
}
