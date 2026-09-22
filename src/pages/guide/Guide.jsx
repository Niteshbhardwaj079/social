import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import Icon from '../../components/common/Icon';
import guideChapters from '../../config/guideChapters';
import brand from '../../config/brand';
import { useI18n } from '../../i18n/useI18n';

function Guide() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');

  const requestedChapterId = searchParams.get('chapter');
  const activeChapter =
    guideChapters.find((chapter) => chapter.id === requestedChapterId) || guideChapters[0];

  const filteredChapters = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return guideChapters;
    return guideChapters.filter(
      (chapter) =>
        chapter.title.toLowerCase().includes(term) || chapter.description.toLowerCase().includes(term)
    );
  }, [searchTerm]);

  function handleSelectChapter(chapterId) {
    setSearchParams({ chapter: chapterId });
  }

  return (
    <div className="fade-in">
      <PageHeader
        title={t('nav.guide')}
        subtitle={t('pages.guide', { product: brand.productName })}
      />

      <div className="search-input search-input--wide mb-5">
        <Icon name="Search" size={16} />
        <input
          type="search"
          className="form-control"
          placeholder='Search the guide — try "schedule", "roles", "campaign"...'
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
      </div>

      <div className="guide-layout">
        <div className="panel-card guide-chapter-list">
          {filteredChapters.length === 0 ? (
            <div className="p-4 text-center text-muted-custom small">No chapters match your search.</div>
          ) : (
            filteredChapters.map((chapter) => (
              <button
                key={chapter.id}
                type="button"
                className={`guide-chapter-item ${chapter.id === activeChapter.id ? 'is-active' : ''}`.trim()}
                onClick={() => handleSelectChapter(chapter.id)}
              >
                <span className="guide-chapter-item__number">{chapter.order}</span>
                <span className="guide-chapter-item__title">{chapter.title}</span>
              </button>
            ))
          )}
        </div>

        <div className="panel-card guide-content">
          <div className="guide-content__meta">
            <Icon name="SlidersHorizontal" size={16} />
            {activeChapter.order} / {guideChapters.length} · {activeChapter.readTime}
          </div>
          <h3 className="guide-content__title">{activeChapter.title}</h3>
          <p className="guide-content__description">{activeChapter.description}</p>

          <ol className="guide-content__steps">
            {activeChapter.content.map((paragraph, index) => (
              <li key={index}>
                <span className="guide-content__step-number">{index + 1}</span>
                <p>{paragraph}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

export default Guide;
