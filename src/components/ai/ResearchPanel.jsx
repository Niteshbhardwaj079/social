import { useCallback, useEffect, useState } from 'react';
import Icon from '../common/Icon';
import CalloutBanner from '../common/CalloutBanner';
import { useToast } from '../common/ToastProvider';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { getResearchReport, getResearchReports, startResearch } from '../../services/api/aiApi';
import { formatShortDate } from '../../utils/billingFormat';
import { useI18n } from '../../i18n/useI18n';

const POLL_EVERY_MS = 4000;
// Product names stay as they are; the free agent is translated (ai.engine.free).
const ENGINE_LABEL = { anthropic: 'Claude', openai: 'OpenAI', gemini: 'Gemini', ollama: 'Ollama' };

/**
 * Research: the agent looks at competitors, news and upcoming festivals, and turns them into post ideas.
 * "Write a post" on an idea hands it to the Write tab.
 */
function ResearchPanel({ onUseIdea }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [report, setReport] = useState(undefined); // undefined = loading, null = none yet
  const [isStarting, setIsStarting] = useState(false);

  const loadLatest = useCallback(() => {
    getResearchReports()
      .then((reports) => setReport(reports[0] ?? null))
      .catch(() => setReport(null));
  }, []);
  useEffect(loadLatest, [loadLatest]);

  // While a report is being prepared, check on it every few seconds.
  const runningId = report?.status === 'running' ? report.id : null;
  useEffect(() => {
    if (!runningId) return undefined;
    const timer = window.setInterval(() => {
      getResearchReport(runningId)
        .then(setReport)
        .catch(() => {});
    }, POLL_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [runningId]);

  function research() {
    setIsStarting(true);
    startResearch()
      .then(setReport)
      .catch((error) => showToast({ type: 'error', title: apiErrorMessage(error) }))
      .finally(() => setIsStarting(false));
  }

  return (
    <section className="surface-card">
      <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-3">
        <div>
          <h3 className="h5 mb-1">{t('ai.research.title')}</h3>
          <p className="form-hint mb-0">{t('ai.research.intro')}</p>
        </div>
        <button type="button" className="btn btn-primary d-inline-flex align-items-center gap-2" onClick={research} disabled={isStarting || report?.status === 'running'}>
          <Icon name="Search" size={16} /> {report?.status === 'running' ? t('ai.research.researching') : t('ai.research.start')}
        </button>
      </div>

      {report === null ? <p className="text-secondary-custom mb-0">{t('ai.research.none')}</p> : null}
      {report?.status === 'running' ? (
        <div className="d-flex align-items-center gap-2 text-secondary-custom">
          <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" /> {t('ai.research.working')}
        </div>
      ) : null}
      {report?.status === 'failed' ? (
        <CalloutBanner icon="AlertCircle" tone="danger">
          {t('ai.research.failed', { error: report.error })}
        </CalloutBanner>
      ) : null}

      {report?.status === 'succeeded' ? (
        <div className="research-report">
          <div className="research-report__meta">
            {formatShortDate(report.finishedAt)} · {t('billing.history.by', { name: report.engine === 'free' ? t('ai.engine.free') : (ENGINE_LABEL[report.engine] ?? report.engine) })}
            {report.credits ? ` · ${t('ai.research.credits', { count: report.credits })}` : ''}
          </div>
          <p>{report.summary}</p>

          {report.insights.competitors?.length ? (
            <>
              <h4 className="research-report__heading">{t('ai.research.competitors')}</h4>
              <ul className="research-report__list">
                {report.insights.competitors.map((competitor) => (
                  <li key={competitor.name}>
                    <strong>{competitor.name}</strong> — {competitor.whatTheyDo} <span className="text-success">→ {competitor.opportunity}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {report.insights.events?.length ? (
            <>
              <h4 className="research-report__heading">{t('ai.research.comingUp')}</h4>
              <div className="feature-chips">
                {report.insights.events.slice(0, 8).map((event) => (
                  <span key={`${event.date}-${event.name}`} className="feature-chip is-on">
                    {event.name} · {formatShortDate(event.date)}
                  </span>
                ))}
              </div>
            </>
          ) : null}

          {report.insights.trends?.length ? (
            <>
              <h4 className="research-report__heading">{t('ai.research.inTheNews')}</h4>
              <ul className="research-report__list">
                {report.insights.trends.slice(0, 6).map((trend) => (
                  <li key={trend}>{trend}</li>
                ))}
              </ul>
            </>
          ) : null}

          <h4 className="research-report__heading">{t('ai.research.ideas')}</h4>
          <div className="research-ideas">
            {report.ideas.map((idea, index) => (
              <div key={`${idea.title}-${index}`} className={`research-idea ${report.usedIdeas.includes(index) ? 'is-used' : ''}`.trim()}>
                <div>
                  <div className="research-idea__title">
                    {idea.title} {report.usedIdeas.includes(index) ? <span className="form-hint">({t('ai.research.posted')})</span> : null}
                  </div>
                  <div className="form-hint">{idea.angle}</div>
                </div>
                <button type="button" className="btn btn-sm btn-outline-secondary-custom text-nowrap" onClick={() => onUseIdea(idea)}>
                  {t('ai.tabs.write')}
                </button>
              </div>
            ))}
          </div>

          {report.sources?.length ? (
            <details className="mt-3">
              <summary className="form-hint">{t('ai.research.sources', { count: report.sources.length })}</summary>
              <ul className="research-report__list small">
                {report.sources.map((source) => (
                  <li key={source.url}>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.title}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export default ResearchPanel;
