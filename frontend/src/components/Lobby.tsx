import { useSession } from '../store';
import MemberList from './MemberList';

export default function Lobby() {
  const { state, me, start, error } = useSession();
  if (!state || !me) return <div className="loading">Loading…</div>;

  const link = `${window.location.origin}${window.location.pathname}#/s/${state.code}`;

  return (
    <div className="centered">
      <div className="lobby">
        <h2>Invite your crew</h2>
        <div className="code-box">
          <span className="label">Session code</span>
          <span className="code">{state.code}</span>
        </div>
        <button className="ghost" onClick={() => navigator.clipboard?.writeText(link)}>
          Copy invite link
        </button>

        <MemberList />

        {me.isHost ? (
          <button className="primary" onClick={start}>
            Start picking
          </button>
        ) : (
          <p className="hint">Waiting for the host to start…</p>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
