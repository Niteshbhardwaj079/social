import { useEffect, useState } from 'react';
import Icon from '../common/Icon';
import AUTH_SLIDES from '../../config/authSlides';
import brand from '../../config/brand';
import { useI18n } from '../../i18n/useI18n';

const AUTO_ADVANCE_MS = 6000;

/** The slide's picture, or — until that file has been added — a placeholder that says what to add. */
function SlideImage({ slide }) {
  const [failedSrc, setFailedSrc] = useState(null);
  if (failedSrc === slide.image) {
    return (
      <div className="auth-showcase__placeholder">
        <Icon name="Image" size={56} />
        <div className="auth-showcase__placeholder-title">Image · 1920 × 1440</div>
        <div className="auth-showcase__placeholder-path">
          Slide {slide.number} · public{slide.image} · 4:3
        </div>
      </div>
    );
  }
  return <img key={slide.image} src={slide.image} alt="" className="auth-showcase__image" onError={() => setFailedSrc(slide.image)} />;
}

/**
 * Right side of the sign-in / sign-up card: product highlights that change every few seconds.
 * Pauses while the pointer is over it; the dots jump to a slide.
 */
function AuthShowcase() {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused) return undefined;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % AUTH_SLIDES.length), AUTO_ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [isPaused]);

  const slide = AUTH_SLIDES[index];
  return (
    <aside className="auth-showcase" onMouseEnter={() => setIsPaused(true)} onMouseLeave={() => setIsPaused(false)} aria-label="Product highlights">
      <div className="auth-showcase__media">
        <SlideImage slide={slide} />
      </div>

      <div className="auth-showcase__copy" key={slide.number} aria-live="polite">
        <span className="auth-showcase__tag">
          <span className="auth-showcase__tag-number">{String(slide.number).padStart(2, '0')}</span>
          {slide.tag}
        </span>
        <h2 className="auth-showcase__title">{slide.title}</h2>
        <p className="auth-showcase__text">{slide.text}</p>
      </div>

      <div className="auth-showcase__footer">
        <div className="auth-showcase__dots" role="tablist" aria-label="Choose a slide">
          {AUTH_SLIDES.map((item, dotIndex) => (
            <button
              key={item.number}
              type="button"
              role="tab"
              aria-selected={dotIndex === index}
              aria-label={`Slide ${item.number}: ${item.tag}`}
              className={`auth-showcase__dot ${dotIndex === index ? 'is-active' : ''}`.trim()}
              onClick={() => setIndex(dotIndex)}
            />
          ))}
        </div>
        <a href={`${brand.websiteUrl}/products`} target="_blank" rel="noreferrer" className="auth-showcase__more">
          {t('auth.moreTools')} <Icon name="ArrowRight" size={16} />
        </a>
      </div>
    </aside>
  );
}

export default AuthShowcase;
