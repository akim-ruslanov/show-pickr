import type { MemberView, ShowSummary, SwipeDirection, SwipeView } from '../types';

interface Props {
  show: ShowSummary;
  members: MemberView[];
  swipes: SwipeView[];
}

export default function MovieCard({ show, members, swipes }: Props) {
  const votes = new Map<string, SwipeDirection>();
  for (const s of swipes) votes.set(s.memberId, s.direction);

  return (
    <div
      className="movie-card"
      style={show.poster ? { backgroundImage: `url(${show.poster})` } : undefined}
    >
      {!show.poster && <div className="poster-fallback">{show.title}</div>}
      <div className="scrim" />
      <div className="card-body">
        <div className="card-top">
          <h2>{show.title}</h2>
          <div className="meta">
            {show.releaseYear ? <span className="year">{show.releaseYear}</span> : null}
            {typeof show.rating === 'number' ? (
              <span className="rating">{show.rating}<span className="pct">%</span></span>
            ) : null}
          </div>
        </div>

        {show.genres.length > 0 && (
          <div className="genres">
            {show.genres.slice(0, 4).map((g) => (
              <span key={g.id} className="genre">{g.name}</span>
            ))}
          </div>
        )}

        {show.overview && <p className="overview">{show.overview}</p>}

        <div className="card-footer">
          {show.services.length > 0 && (
            <div className="services">
              {show.services.slice(0, 6).map((s, i) =>
                s.logo ? (
                  <img key={i} src={s.logo} alt={s.name} title={s.name} />
                ) : (
                  <span key={i} className="svc-name">{s.name}</span>
                )
              )}
            </div>
          )}

          <div className="votes">
            {members
              .filter((m) => votes.has(m.id))
              .map((m) => (
                <span key={m.id} className={`vote ${votes.get(m.id)}`} title={m.name}>
                  {m.name[0]?.toUpperCase()}
                </span>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
