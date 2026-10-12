import CalloutBanner from '../common/CalloutBanner';
import { useI18n } from '../../i18n/useI18n';

// Product names stay as they are; "the free agent" is translated (ai.engine.free).
const ENGINE_LABEL = { anthropic: 'Claude', openai: 'OpenAI', gemini: 'Google Gemini', ollama: 'Ollama' };

/** "Made by Claude" / "Made by the free agent", plus why the free agent stepped in (e.g. credits used up). */
function EngineNote({ engine, notice }) {
  const { t } = useI18n();
  if (!engine) return null;
  const name = engine === 'free' ? t('ai.engine.free') : (ENGINE_LABEL[engine] ?? engine);
  return (
    <>
      {/* The server sends a notice for one reason only today: the monthly AI credits are used up. */}
      {notice ? <CalloutBanner icon="Info">{t('ai.notice.creditsUsedUp')}</CalloutBanner> : null}
      <p className="form-hint mb-2">{t('ai.engine.madeBy', { name })}</p>
    </>
  );
}

export default EngineNote;
