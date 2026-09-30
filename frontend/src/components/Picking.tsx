import { useEffect, useMemo } from 'react';
import { useSession } from '../store';
import MemberList from './MemberList';
import MatchedModal from './MatchedModal';
import NoMatchModal from './NoMatchModal';
import SwipeDeck from './SwipeDeck';

export default function Picking() {
  const { state, me, swipe, finish, extendDeck } = useSession();

  // My own view of the deck: shows I haven't swiped yet.
  const visible = useMemo(() => {
    if (!state || !me) return [];
    const mine = new Set(state.swipes.filter((s) => s.memberId === me.id).map((s) => s.showId));
    return state.deck.filter((s) => !mine.has(s.id));
  }, [state, me]);

  useEffect(() => {
    if (state?.hasMore && visible.length < 5 && !me?.finished) extendDeck();
  }, [state?.hasMore, visible.length, extendDeck, me?.finished]);

  if (!state || !me) return <div className="loading">Loading…</div>;

  const finishedCount = state.members.filter((m) => m.finished).length;

  if (me.finished) {
    return (
      <div className="picking">
        <MemberList compact />
        <div className="waiting">
          <h2>You're done! 🎉</h2>
          <p>Waiting for everyone to finish picking.</p>
          <p className="hint">
            {finishedCount} of {state.groupSize} done
          </p>
        </div>
        <MatchedModal />
        <NoMatchModal />
      </div>
    );
  }

  const current = visible[0];

  return (
    <div className="picking">
      <MemberList compact />
      {current ? (
        <SwipeDeck
          key={current.id}
          show={current}
          next={visible[1]}
          members={state.members}
          swipes={state.swipes.filter((s) => s.showId === current.id)}
          onSwipe={swipe}
        />
      ) : (
        <div className="empty">
          <p>
            {state.hasMore
              ? 'Loading more picks…'
              : "You've seen everything. Finish up to see the result!"}
          </p>
        </div>
      )}
      <button className="done" onClick={finish}>
        Done picking
      </button>
      <MatchedModal />
      <NoMatchModal />
    </div>
  );
}
