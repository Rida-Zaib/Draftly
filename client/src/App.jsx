import { useEffect, useState } from 'react';
import { api, clearToken, getToken } from './api';
import AuthScreen from './AuthScreen.jsx';
import Workspace from './Workspace.jsx';
import { DialogHost, Logo } from './ui.jsx';

export default function App() {
  const [me, setMe] = useState(null);
  const [checking, setChecking] = useState(!!getToken());

  useEffect(() => {
    if (!getToken()) return;
    api('/auth/me')
      .then((r) => setMe(r.user))
      .catch(() => clearToken())
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    const out = () => { setMe(null); location.hash = '#/'; };
    window.addEventListener('draftly:signed-out', out);
    return () => window.removeEventListener('draftly:signed-out', out);
  }, []);

  const signOut = async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* token is dropped either way */ }
    clearToken();
    setMe(null);
    location.hash = '#/';
  };

  // a password-reset link always shows the auth screen, even if someone is already signed in
  const [resetting, setResetting] = useState(() => location.hash.startsWith('#/reset'));
  useEffect(() => {
    const onHash = () => setResetting(location.hash.startsWith('#/reset'));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (checking) return <div className="splash"><Logo size={56} /></div>;
  return (
    <>
      {!me || resetting
        ? <AuthScreen onAuthed={setMe} />
        : <Workspace key={me.id} me={me} onSignOut={signOut} />}
      <DialogHost />
    </>
  );
}
