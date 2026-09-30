import { useEffect, useState } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import type { MemberView, ShowSummary, SwipeDirection, SwipeView } from '../types';
import MovieCard from './MovieCard';

interface Props {
  show: ShowSummary;
  next?: ShowSummary;
  members: MemberView[];
  swipes: SwipeView[];
  onSwipe: (showId: string, direction: SwipeDirection) => void;
}

export default function SwipeDeck({ show, next, members, swipes, onSwipe }: Props) {
  const [flying, setFlying] = useState<SwipeDirection | null>(null);
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 300], [-18, 18]);
  const likeOpacity = useTransform(x, [0, 150], [0, 1]);
  const nopeOpacity = useTransform(x, [-150, 0], [1, 0]);

  function fly(direction: SwipeDirection) {
    if (flying) return;
    setFlying(direction);
    animate(x, direction === 'yes' ? 900 : -900, {
      duration: 0.35,
      onComplete: () => onSwipe(show.id, direction),
    });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') fly('yes');
      if (e.key === 'ArrowLeft') fly('no');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show.id, flying]);

  return (
    <div className="deck">
      {next && (
        <div className="stacked">
          <MovieCard show={next} members={members} swipes={[]} />
        </div>
      )}

      <motion.div
        className="draggable"
        style={{ x, rotate }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.9}
        onDragEnd={(_e, info) => {
          const power = info.offset.x + info.velocity.x * 0.2;
          if (power > 120) fly('yes');
          else if (power < -120) fly('no');
          else animate(x, 0, { type: 'spring', stiffness: 300, damping: 30 });
        }}
      >
        <MovieCard show={show} members={members} swipes={swipes} />
        <motion.div className="stamp like" style={{ opacity: likeOpacity }}>LIKE</motion.div>
        <motion.div className="stamp nope" style={{ opacity: nopeOpacity }}>NOPE</motion.div>
      </motion.div>

      <div className="actions">
        <button className="action nope" onClick={() => fly('no')} aria-label="Nope">✕</button>
        <button className="action like" onClick={() => fly('yes')} aria-label="Like">♥</button>
      </div>
    </div>
  );
}
