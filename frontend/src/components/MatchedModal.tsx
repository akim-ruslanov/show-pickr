import { useSession } from '../store';
import MovieCard from './MovieCard';

export default function MatchedModal() {
  const { state } = useSession();
  if (!state || state.status !== 'matched' || !state.matchedShow) return null;

  const show = state.matchedShow;

  return (
    <div className="overlay">
      <div className="matched">
        <h2>🎉 Consensus found!</h2>
        <div className="matched-card">
          <MovieCard show={show} members={state.members} swipes={[]} />
        </div>
        <div className="watch">
          <h3>Where to watch</h3>
          <div className="service-links">
            {show.services.map((s, i) => (
              <a key={i} href={s.link} target="_blank" rel="noreferrer" className="service-link">
                {s.logo && <img src={s.logo} alt="" />}
                <span>{s.name}</span>
              </a>
            ))}
            {show.services.length === 0 && <span className="hint">No streaming links found.</span>}
          </div>
        </div>
        <a className="ghost" href="#/">Start a new session</a>
      </div>
    </div>
  );
}
