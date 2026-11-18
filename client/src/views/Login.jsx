import { useState } from 'react';
import { api } from '../api.js';

/** Full-screen coach sign-in, or first-time password creation. */
export default function Login({ hasPassword, onDone }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const creating = !hasPassword;

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (creating && pw !== pw2) { setErr('The two passwords don’t match'); return; }
    setBusy(true);
    try {
      await (creating ? api.setupPassword(pw) : api.login(pw));
      onDone();
    } catch (e2) { setErr(e2.message); setBusy(false); }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <img src="/icon.svg" alt="" className="login-logo" />
        <div className="login-brand"><strong>ROPEWORKS</strong><small>Training Studio</small></div>
        <h1>{creating ? 'Create your coach password' : 'Coach sign in'}</h1>
        {creating && <p className="muted">Only people with this password can open Ropeworks. You’ll stay signed in on this device.</p>}
        <input type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password"
          autoComplete={creating ? 'new-password' : 'current-password'} autoFocus aria-label="Password" />
        {creating && (
          <input type={show ? 'text' : 'password'} value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Type it again"
            autoComplete="new-password" aria-label="Confirm password" />
        )}
        <label className="show-pw"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show password</label>
        {err && <p className="login-err" role="alert">{err}</p>}
        <button className="btn primary block" disabled={busy || !pw}>{busy ? '…' : creating ? 'Create password' : 'Sign in'}</button>
        {!creating && <p className="muted small">Forgot it? On the computer running Ropeworks, double-click <b>Reset Password</b> in the Ropeworks folder, then create a new one. Your data is kept.</p>}
      </form>
    </div>
  );
}
