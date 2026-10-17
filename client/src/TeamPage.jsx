import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { Avatar, Icon, colorFor, confirmDialog } from './ui.jsx';

export default function TeamPage({ id, me, docs, query, onChanged, notify, renderCard, onNewDoc }) {
  const [team, setTeam] = useState(null);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [inviteError, setInviteError] = useState('');

  const load = useCallback(
    () => api(`/teams/${id}`).then((t) => { setTeam(t); setError(''); }).catch((e) => setError(e.message)),
    [id]
  );
  useEffect(() => { setTeam(null); load(); }, [load]);

  if (error && !team) {
    return (
      <div className="empty-state">
        <h3>Team not found</h3>
        <p>{error}. You may have been removed from this team.</p>
        <a className="btn primary" href="#/">Back to home</a>
      </div>
    );
  }
  if (!team) return <p className="muted">Loading team</p>;

  const isOwner = team.role === 'owner';
  const rows = query ? docs.filter((d) => d.title.toLowerCase().includes(query)) : docs;

  const act = async (fn, okText) => {
    try { await fn(); await load(); await onChanged(); if (okText) notify({ text: okText }); }
    catch (e) { notify({ text: e.message }); }
  };

  const invite = async (e) => {
    e.preventDefault();
    setInviteError('');
    try {
      const r = await api(`/teams/${id}/invite`, { method: 'POST', body: { email } });
      notify({ text: r.registered ? `Invitation sent to ${email}` : `${email} has no account yet. They will see the invitation after signing up with that email.` });
      setEmail('');
      await load();
    } catch (err) { setInviteError(err.message); }
  };

  const leave = async () => {
    if (!(await confirmDialog({
      title: `Leave ${team.name}?`, message: 'You will lose access to documents shared with the team.',
      confirmLabel: 'Leave team', danger: true,
    }))) return;
    act(async () => { await api(`/teams/${id}/members/${me.id}`, { method: 'DELETE' }); location.hash = '#/'; });
  };
  const removeTeam = async () => {
    if (!(await confirmDialog({
      title: `Delete "${team.name}"?`, message: 'Documents stay with their owners but are no longer shared with the team.',
      confirmLabel: 'Delete team', danger: true,
    }))) return;
    act(async () => { await api(`/teams/${id}`, { method: 'DELETE' }); location.hash = '#/'; });
  };

  return (
    <>
      <header className="page-head team-head">
        <div className="team-badge" style={{ background: colorFor(`team${team.id}`) }}><Icon name="users" size={26} /></div>
        <div>
          <h1>{team.name}</h1>
          <p className="muted">{team.members.length} {team.members.length === 1 ? 'member' : 'members'} · you are {isOwner ? 'the owner' : 'a member'}</p>
        </div>
        <button className="btn primary push" onClick={onNewDoc}><Icon name="plus" size={16} />New team document</button>
      </header>

      <div className="team-grid">
        <section>
          <h2 className="subhead">Team documents</h2>
          {rows.length === 0 ? (
            <div className="empty-state compact">
              <h3>No team documents yet</h3>
              <p>Create one here, or open any of your documents and share it with {team.name}.</p>
            </div>
          ) : <div className="grid">{rows.map((d) => renderCard(d))}</div>}
        </section>

        <aside className="panel">
          <h2 className="subhead">Members</h2>
          <ul className="people">
            {team.members.map((m) => (
              <li key={m.id}>
                <Avatar name={m.name} size={34} />
                <div className="grow">
                  <strong>{m.name}{m.id === me.id && ' (you)'}</strong>
                  <span className="muted">{m.email}</span>
                </div>
                <span className={`chip ${m.role === 'owner' ? 'role-owner' : 'role-viewer'}`}>{m.role === 'owner' ? 'Owner' : 'Member'}</span>
                {isOwner && m.role !== 'owner' && (
                  <button className="icon-btn small" aria-label={`Remove ${m.name}`}
                    onClick={() => act(() => api(`/teams/${id}/members/${m.id}`, { method: 'DELETE' }), `${m.name} was removed`)}>
                    <Icon name="x" size={15} />
                  </button>
                )}
              </li>
            ))}
          </ul>

          {isOwner && (
            <>
              <h2 className="subhead">Invite people</h2>
              <form onSubmit={invite} className="invite-form">
                <input type="email" required placeholder="name@company.com" aria-label="Email to invite"
                  value={email} onChange={(e) => setEmail(e.target.value)} />
                <button className="btn primary">Invite</button>
              </form>
              {inviteError && <p className="error">{inviteError}</p>}
              {team.invites.length > 0 && (
                <>
                  <p className="micro-title">Pending invitations</p>
                  <ul className="people">
                    {team.invites.map((i) => (
                      <li key={i.id}>
                        <span className="avatar ghost"><Icon name="mail" size={14} /></span>
                        <div className="grow"><span>{i.email}</span></div>
                        <button className="icon-btn small" aria-label={`Cancel invitation for ${i.email}`}
                          onClick={() => act(() => api(`/teams/${id}/invites/${i.id}`, { method: 'DELETE' }))}>
                          <Icon name="x" size={15} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}

          <div className="panel-foot">
            {isOwner
              ? <button className="btn danger" onClick={removeTeam}><Icon name="trash" size={16} />Delete team</button>
              : <button className="btn danger" onClick={leave}><Icon name="logout" size={16} />Leave team</button>}
          </div>
        </aside>
      </div>
    </>
  );
}
