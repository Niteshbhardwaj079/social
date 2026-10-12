import CalloutBanner from '../../components/common/CalloutBanner';
import BrandKitForm from '../../components/ai/BrandKitForm';
import ResearchPanel from '../../components/ai/ResearchPanel';
import WeeklyPlanPanel from '../../components/ai/WeeklyPlanPanel';
import { useI18n } from '../../i18n/useI18n';

/**
 * The marketing agent in three steps: tell it about the business (Brand Kit), let it research,
 * then let it plan the week. For daily hands-free posting, set up an Autopilot with "Use my Brand Kit".
 */
function AgentTab({ access, onUseIdea }) {
  const { t } = useI18n();
  return (
    <div className="ai-tab">
      <CalloutBanner icon="Bot">{access.paidAi ? t('ai.agent.paidIntro') : t('ai.agent.freeIntro')}</CalloutBanner>
      <BrandKitForm />
      <ResearchPanel onUseIdea={onUseIdea} />
      {access.canManageAutopilots ? <WeeklyPlanPanel /> : null}
      <p className="form-hint mb-0">{t('ai.agent.handsFree')}</p>
    </div>
  );
}

export default AgentTab;
