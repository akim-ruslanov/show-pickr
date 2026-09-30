import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { CountryMeta, Filters, GenreMeta, ShowType } from '../types';

export default function Home() {
  const [tab, setTab] = useState<'create' | 'join'>('create');

  return (
    <div className="home">
      <header className="brand">
        <h1>Show<span>Pickr</span></h1>
        <p>Swipe through movies &amp; shows until everyone agrees.</p>
      </header>

      <div className="tabs">
        <button className={tab === 'create' ? 'active' : ''} onClick={() => setTab('create')}>
          New session
        </button>
        <button className={tab === 'join' ? 'active' : ''} onClick={() => setTab('join')}>
          Join a session
        </button>
      </div>

      {tab === 'create' ? <CreateForm /> : <JoinForm />}
    </div>
  );
}

function CreateForm() {
  const navigate = useNavigate();
  const [countries, setCountries] = useState<CountryMeta[]>([]);
  const [genres, setGenres] = useState<GenreMeta[]>([]);
  const [metaError, setMetaError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [country, setCountry] = useState('us');
  const [catalogs, setCatalogs] = useState<string[]>([]);
  const [showType, setShowType] = useState<ShowType>('movie');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [genresRelation, setGenresRelation] = useState<'and' | 'or'>('or');
  const [keyword, setKeyword] = useState('');
  const [groupSize, setGroupSize] = useState<number>(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.countries(), api.genres()])
      .then(([c, g]) => {
        setCountries(c);
        setGenres(g);
        if (c.some((x) => x.code === 'us')) setCountry('us');
        else if (c[0]) setCountry(c[0].code);
      })
      .catch((e) => setMetaError(e.message));
  }, []);

  const countryMeta = useMemo(() => countries.find((c) => c.code === country), [countries, country]);
  const services = useMemo(
    () =>
      (countryMeta?.services ?? []).filter(
        (s) => s.streamingOptionTypes?.subscription || s.streamingOptionTypes?.free
      ),
    [countryMeta]
  );

  function toggle(list: string[], setList: (v: string[]) => void, id: string) {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !country) return;
    setBusy(true);
    setError(null);
    try {
      const filters: Filters = {
        country,
        catalogs,
        showType,
        genres: selectedGenres,
        genresRelation,
        keyword: keyword.trim() || undefined,
      };
      const res = await api.createSession(name.trim(), filters, groupSize);
      localStorage.setItem(`showpickr:${res.code}`, JSON.stringify(res.member));
      navigate(`/s/${res.code}`);
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>
        <span>Your name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Alex"
          maxLength={40}
        />
      </label>

      {metaError ? (
        <p className="error">Couldn't load filters: {metaError}</p>
      ) : (
        <>
          <label>
            <span>Country</span>
            <select value={country} onChange={(e) => { setCountry(e.target.value); setCatalogs([]); }}>
              {countries.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </label>

          <div className="field">
            <span>Streaming services</span>
            <div className="chips">
              {services.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  className={`chip ${catalogs.includes(s.id) ? 'on' : ''}`}
                  onClick={() => toggle(catalogs, setCatalogs, s.id)}
                >
                  {s.logo && <img src={s.logo} alt="" />}
                  <span>{s.name}</span>
                </button>
              ))}
            </div>
            <small className="hint">Pick at least one. Leave empty to search everywhere.</small>
          </div>

          <div className="field">
            <span>Type</span>
            <div className="segmented">
              <button type="button" className={showType === 'movie' ? 'on' : ''} onClick={() => setShowType('movie')}>
                Movies
              </button>
              <button type="button" className={showType === 'series' ? 'on' : ''} onClick={() => setShowType('series')}>
                Series
              </button>
            </div>
          </div>

          <div className="field">
            <span>Genres</span>
            <div className="chips">
              {genres.map((g) => (
                <button
                  type="button"
                  key={g.id}
                  className={`chip genre ${selectedGenres.includes(g.id) ? 'on' : ''}`}
                  onClick={() => toggle(selectedGenres, setSelectedGenres, g.id)}
                >
                  {g.name}
                </button>
              ))}
            </div>
          </div>

          {selectedGenres.length > 1 && (
            <div className="field">
              <span>Genre match</span>
              <div className="segmented">
                <button type="button" className={genresRelation === 'or' ? 'on' : ''} onClick={() => setGenresRelation('or')}>
                  Any genre
                </button>
                <button type="button" className={genresRelation === 'and' ? 'on' : ''} onClick={() => setGenresRelation('and')}>
                  All genres
                </button>
              </div>
            </div>
          )}

          <label>
            <span>Keyword (optional)</span>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="e.g. zombies"
            />
          </label>

          <div className="field">
            <span>Number of people</span>
            <select
              value={String(groupSize)}
              onChange={(e) => setGroupSize(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? 'person' : 'people'}
                </option>
              ))}
            </select>
            <small className="hint">
              Everyone picks, then the result is decided once this many people have finished —
              consensus means the same title was liked by all of them.
            </small>
          </div>
        </>
      )}

      {error && <p className="error">{error}</p>}

      <button className="primary" disabled={busy || !name.trim() || !country}>
        {busy ? 'Creating…' : 'Create session'}
      </button>
    </form>
  );
}

function JoinForm() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!code.trim() || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.joinSession(code.trim().toUpperCase(), name.trim());
      localStorage.setItem(`showpickr:${res.code}`, JSON.stringify(res.member));
      navigate(`/s/${res.code}`);
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>
        <span>Session code</span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABC123"
          maxLength={8}
          className="code-input"
        />
      </label>
      <label>
        <span>Your name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alex" maxLength={40} />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={busy || !code.trim() || !name.trim()}>
        {busy ? 'Joining…' : 'Join session'}
      </button>
    </form>
  );
}
