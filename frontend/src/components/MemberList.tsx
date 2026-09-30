import { useSession } from '../store';

export default function MemberList({ compact = false }: { compact?: boolean }) {
  const { state } = useSession();
  if (!state) return null;

  return (
    <div className={`members ${compact ? 'compact' : ''}`}>
      {state.members.map((m) => {
        const count = state.swipes.filter((s) => s.memberId === m.id).length;
        return (
          <div className="member-chip" key={m.id} title={m.name}>
            <span className="avatar">{m.name[0]?.toUpperCase()}</span>
            <span className="name">{m.name}</span>
            {m.isHost && <span className="host">host</span>}
            {m.finished && (
              <span className="done-mark" title="Finished picking">✓</span>
            )}
            {compact && <span className="count">{count}</span>}
          </div>
        );
      })}
    </div>
  );
}
