import { useSession } from '../store';

export default function NoMatchModal() {
  const { state } = useSession();
  if (!state || state.status !== 'no-match') return null;

  return (
    <div className="overlay">
      <div className="matched">
        <h2>😕 No agreement</h2>
        <p className="hint">Nobody's likes overlapped enough this time.</p>
        <a className="ghost" href="#/">Start a new session</a>
      </div>
    </div>
  );
}
