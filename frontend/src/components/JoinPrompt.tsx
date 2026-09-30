import { useState, type FormEvent } from 'react';
import { useSession } from '../store';

export default function JoinPrompt({ onJoin }: { onJoin: (name: string) => Promise<void> }) {
  const { error } = useSession();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    await onJoin(name);
    setBusy(false);
  }

  return (
    <div className="centered">
      <form className="form card-form" onSubmit={submit}>
        <h2>Join the session</h2>
        <p className="hint">Enter a display name to start swiping.</p>
        <label>
          <span>Your name</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alex" maxLength={40} />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy || !name.trim()}>
          {busy ? 'Joining…' : 'Join'}
        </button>
      </form>
    </div>
  );
}
