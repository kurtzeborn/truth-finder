import { useState, useEffect, useRef, useCallback } from 'react';
import confetti from 'canvas-confetti';

interface ScoreEntry {
  id: string;
  displayName: string;
  score: number;
}

// Scores arrive sorted ascending (lowest first) for bottom-up reveal.
// We reveal lowest→highest, then display highest at top.
export function Leaderboard({ scores, compact }: { scores: ScoreEntry[]; compact?: boolean }) {
  const [revealedCount, setRevealedCount] = useState(0);
  const [animationDone, setAnimationDone] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const confettiFired = useRef(false);
  const startedRef = useRef(false);
  const total = scores.length;

  const getDelay = useCallback((index: number) => {
    const rank = total - index; // 1-based rank from top
    if (rank <= 3) return 1000;
    if (total >= 50 && index < Math.floor(total / 2)) return 200;
    return 500;
  }, [total]);

  useEffect(() => {
    if (total === 0 || startedRef.current) return;
    startedRef.current = true;

    let current = 0;
    const revealNext = () => {
      current++;
      setRevealedCount(current);
      if (current < total) {
        timerRef.current = setTimeout(revealNext, getDelay(current));
      } else {
        setAnimationDone(true);
      }
    };

    timerRef.current = setTimeout(revealNext, 600);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [total, getDelay]);

  // Fire confetti when #1 is revealed
  useEffect(() => {
    if (revealedCount === total && total > 0 && !confettiFired.current) {
      confettiFired.current = true;
      confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
      setTimeout(() => confetti({ particleCount: 80, spread: 60, origin: { y: 0.5 } }), 300);
    }
  }, [revealedCount, total]);

  if (total === 0) {
    return <p className="text-gray-400">No scores yet</p>;
  }

  // Build display list: show revealed entries in descending order (highest first)
  // scores[total-1] is highest, scores[0] is lowest
  // We reveal from index 0 to total-1 (lowest first)
  // But display highest at top: reversed from the revealed set
  const revealed = scores.slice(0, revealedCount);
  const displayList = [...revealed].reverse();

  const textBase = compact ? 'text-sm' : 'text-lg';
  const textTop3 = compact ? 'text-base font-bold' : 'text-2xl font-bold';
  const textChampion = compact ? 'text-lg font-extrabold' : 'text-3xl font-extrabold';
  const gap = compact ? 'space-y-1' : 'space-y-2';

  return (
    <div className={gap}>
      {!animationDone && revealedCount === 0 && (
        <p className="text-gray-500 animate-pulse text-center">Preparing leaderboard...</p>
      )}
      {displayList.map((entry, displayIdx) => {
        const rank = displayIdx + 1;
        const isChampion = rank === 1 && animationDone;
        const isTop3 = rank <= 3 && (animationDone || total - revealedCount < 3);
        const isNew = displayIdx === 0; // newest reveal is always at top

        return (
          <div
            key={entry.id}
            className={`
              flex items-center justify-between px-4 py-2 rounded-lg transition-all duration-300
              ${isChampion ? 'bg-yellow-500/20 ring-2 ring-yellow-400' : ''}
              ${isTop3 && !isChampion ? 'bg-blue-500/10 ring-1 ring-blue-400/50' : ''}
              ${!isTop3 ? 'bg-gray-800/50' : ''}
              ${isNew && !animationDone ? 'animate-[slideIn_0.4s_ease-out]' : ''}
            `}
          >
            <div className="flex items-center gap-3">
              <span className={`
                ${isChampion ? 'text-yellow-400 ' + textChampion : ''}
                ${isTop3 && !isChampion ? 'text-blue-300 ' + textTop3 : ''}
                ${!isTop3 ? 'text-gray-500 ' + textBase : ''}
                w-8 text-right
              `}>
                {rank === 1 && animationDone ? '👑' : `#${rank}`}
              </span>
              <span className={`
                ${isChampion ? 'text-yellow-200 ' + textChampion : ''}
                ${isTop3 && !isChampion ? 'text-blue-100 ' + textTop3 : ''}
                ${!isTop3 ? 'text-white ' + textBase : ''}
              `}>
                {entry.displayName}
              </span>
            </div>
            <span className={`
              ${isChampion ? 'text-yellow-300 ' + textChampion : ''}
              ${isTop3 && !isChampion ? 'text-blue-200 ' + textTop3 : ''}
              ${!isTop3 ? 'text-gray-300 ' + textBase : ''}
            `}>
              {entry.score} pts
            </span>
          </div>
        );
      })}
    </div>
  );
}
