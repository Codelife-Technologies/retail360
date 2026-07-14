import React, { useEffect, useMemo } from 'react';
import ModalPortal from './ModalPortal';
import './BirthdayCelebration.css';

const EMOJI_BURST = ['🎉', '🎂', '🎈', '🥳', '✨', '🎁', '🍰', '🎊', '🌟', '💛'];

function BirthdayCelebration({ greeting, onClose }) {
  const confetti = useMemo(
    () =>
      Array.from({ length: 28 }, (_, index) => ({
        id: index,
        emoji: EMOJI_BURST[index % EMOJI_BURST.length],
        left: `${(index * 37) % 100}%`,
        delay: `${(index % 10) * 0.12}s`,
        duration: `${2.4 + (index % 5) * 0.35}s`,
        size: `${1.1 + (index % 4) * 0.25}rem`,
      })),
    []
  );

  useEffect(() => {
    if (!greeting) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [greeting, onClose]);

  if (!greeting?.name) return null;

  return (
    <ModalPortal>
      <div className="birthday-overlay" role="dialog" aria-modal="true" aria-labelledby="birthday-title">
        <div className="birthday-confetti" aria-hidden="true">
          {confetti.map((piece) => (
            <span
              key={piece.id}
              className="birthday-confetti-piece"
              style={{
                left: piece.left,
                animationDelay: piece.delay,
                animationDuration: piece.duration,
                fontSize: piece.size,
              }}
            >
              {piece.emoji}
            </span>
          ))}
        </div>

        <div className="birthday-card">
          <div className="birthday-emoji-row" aria-hidden="true">
            <span>🎉</span>
            <span>🎂</span>
            <span>🥳</span>
          </div>
          <h2 id="birthday-title">Happy Birthday, {greeting.name}!</h2>
          <p className="birthday-message">
            Wishing you a wonderful day filled with joy, success, and celebration. 🎈✨🎁
          </p>
          <button type="button" className="birthday-dismiss" onClick={onClose}>
            Thank you! 🎊
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}

export default BirthdayCelebration;
