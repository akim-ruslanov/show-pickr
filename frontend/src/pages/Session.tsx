import { useParams } from 'react-router-dom';
import { SessionProvider, useSession } from '../store';
import JoinPrompt from '../components/JoinPrompt';
import Lobby from '../components/Lobby';
import Picking from '../components/Picking';

function Inner() {
  const { state, me, error, join } = useSession();

  if (!me) return <JoinPrompt onJoin={join} />;
  if (error && !state) {
    return (
      <div className="error-state">
        <p>{error}</p>
        <a href="#/">← Back to home</a>
      </div>
    );
  }
  if (!state) return <div className="loading">Loading…</div>;
  if (state.status === 'lobby') return <Lobby />;
  return <Picking />;
}

export default function SessionPage() {
  const { code = '' } = useParams();
  return (
    <SessionProvider code={code.toUpperCase()}>
      <Inner />
    </SessionProvider>
  );
}
