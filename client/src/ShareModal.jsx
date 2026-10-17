import { useState } from 'react';
import { api } from './api';
import { Avatar, Icon } from './ui.jsx';

export default function ShareModal({ doc, teams, onClose, onChange, onCreateTeam }) {
  const [tab, setTab] = useState('people');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [teamId, setTeamId] = useState(doc.team?.id ?? teams[0]?.id ?? '');
  const [teamRole, setTeamRole] = useState(doc.team?.role ?? 'editor');
  const [error, setError] = useState('');

  const attempt = async (fn) => {
    setError('');
    try { await fn(); await onChange(); return true; }
    catch (err) { setError(err.message); return false; }
  };

  const grant = (targetEmail, targetRole) => attempt(() =>
    api(`/documents/${doc.id}/share`, { method: 'POST', body: { email: targetEmail, role: targetRole } }));

  const add = async (e) => {
    e.preventDefault();
    if (await grant(email, role)) setEmail('');
  };

  const shareTeam = (e) => {
    e.preventDefault();
    attempt(() => api(`/documents/${doc.id}/team`, { method: 'PUT', body: { team_id: Number(teamId), role: teamRole } }));
  };
  const stopTeam = () => attempt(() => api(`/documents/${doc.id}/team`, { method: 'PUT', body: { team_id: null } }));

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" aria-label="Share document">
        <div className="drawer-head">
          <div>
            <h3>Share</h3>
            <p className="muted small clip">{doc.title}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>

        <div className="seg" role="tablist">
          <button role="tab" aria-selected={tab === 'people'} className={tab === 'people' ? 'on' : ''} onClick={() => { setTab('people'); setError(''); }}>
            <Icon name="mail" size={15} />People
          </button>
          <button role="tab" aria-selected={tab === 'team'} className={tab === 'team' ? 'on' : ''} onClick={() => { setTab('team'); setError(''); }}>
            <Icon name="users" size={15} />Team
          </button>
        </div>

        {error && <p className="error">{error}</p>}

        {tab === 'people' ? (
          <>
            <form onSubmit={add} className="stack">
              <label className="field">Person's email
                <input type="email" required placeholder="bob@demo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label className="field">Access
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="editor">Editor: can change the document</option>
                  <option value="viewer">Viewer: can only read</option>
                </select>
              </label>
              <button className="btn primary">Grant access</button>
            </form>

            <h4 className="subhead">People with access</h4>
            {doc.shares.length === 0 && <p className="muted small">Only you can open this document directly.</p>}
            <ul className="people">
              {doc.shares.map((s) => (
                <li key={s.id}>
                  <Avatar name={s.name} size={32} />
                  <div className="grow"><strong>{s.name}</strong><span className="muted">{s.email}</span></div>
                  <select className="select small" aria-label={`Access for ${s.name}`} value={s.role}
                    onChange={(e) => grant(s.email, e.target.value)}>
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button className="icon-btn small" aria-label={`Remove ${s.name}`}
                    onClick={() => attempt(() => api(`/documents/${doc.id}/share/${s.id}`, { method: 'DELETE' }))}>
                    <Icon name="x" size={15} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : teams.length === 0 ? (
          <div className="empty-state compact">
            <h3>You are not in a team yet</h3>
            <p>Create a team, invite people, and share documents with everyone at once.</p>
            <button className="btn primary" onClick={() => { onClose(); onCreateTeam(); }}>Create a team</button>
          </div>
        ) : (
          <>
            {doc.team && (
              <div className="callout">
                <Icon name="users" />
                <p>Shared with <strong>{doc.team.name}</strong> as {doc.team.role}. Every member can open it.</p>
                <button className="btn" onClick={stopTeam}>Stop sharing</button>
              </div>
            )}
            <form onSubmit={shareTeam} className="stack">
              <label className="field">Team
                <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.member_count})</option>)}
                </select>
              </label>
              <label className="field">Access for members
                <select value={teamRole} onChange={(e) => setTeamRole(e.target.value)}>
                  <option value="editor">Editor: can change the document</option>
                  <option value="viewer">Viewer: can only read</option>
                </select>
              </label>
              <button className="btn primary">{doc.team ? 'Update team access' : 'Share with team'}</button>
            </form>
            <p className="muted small">A document can be shared with one team. Members you add later get access automatically.</p>
          </>
        )}
      </aside>
    </>
  );
}
