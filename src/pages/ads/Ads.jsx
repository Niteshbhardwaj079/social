import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import Icon from '../../components/common/Icon';
import PlatformIcon from '../../components/common/PlatformIcon';
import StatusBadge from '../../components/common/StatusBadge';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { SkeletonKpiRow } from '../../components/common/LoadingSkeleton';
import { StatCardGrid } from '../../components/common/StatCard';
import { BulkActionBar, Pager, RowCheckbox, SelectAllCheckbox, TableToolbar } from '../../components/common/DataTableParts';
import AdsPerformanceChart from '../../components/ads/AdsPerformanceChart';
import DownloadReportMenu from '../../components/ads/DownloadReportMenu';
import NetworkIcons from '../../components/ads/NetworkIcons';
import TemplateFormModal from '../../components/ads/TemplateFormModal';
import RuleFormModal from '../../components/ads/RuleFormModal';
import usePagination from '../../hooks/usePagination';
import useRowSelection from '../../hooks/useRowSelection';
import useMediaQuery from '../../hooks/useMediaQuery';
import {
  getAds,
  getAdAccounts,
  syncAdAccounts,
  updateAdsStatus,
  deleteAds,
  getAdCreativeTemplates,
  createAdCreativeTemplate,
  updateAdCreativeTemplate,
  deleteAdCreativeTemplate,
  getAdRules,
  createAdRule,
  updateAdRule,
  deleteAdRule,
} from '../../services/api/adsApi';
import { getMediaItems } from '../../services/api/mediaApi';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { AD_DATE_RANGES, AD_NETWORKS, AD_OBJECTIVES, AD_RULE_COMPARATORS, AD_RULE_METRICS, AD_STATUS } from '../../config/adPlatforms';
import { getPlatformByKey, PLATFORMS } from '../../config/platforms';
import { MEDIA_TYPE, REQUEST_STATUS } from '../../config/constants';
import { adsToday, percentChange, seriesForAds, spendByPlatform, sliceRange, sumDaily, totalsForAds } from '../../utils/adMetrics';
import { downloadAdsDailyCsv, downloadAdsSummaryCsv, printAdsReport } from '../../utils/adReports';
import { formatCompactNumber, formatCurrency, formatDate, formatNumber, formatPercent, formatRelativeTime } from '../../utils/formatters';
import { useToast } from '../../components/common/ToastProvider';
import { useI18n } from '../../i18n/useI18n';

const AD_PLATFORM_KEYS = [...new Set(AD_NETWORKS.flatMap((network) => network.platforms))];
const TABS = [
  { key: 'overview', labelKey: 'overview' },
  { key: 'accounts', labelKey: 'accounts' },
  { key: 'library', labelKey: 'library' },
  { key: 'rules', labelKey: 'rules' },
];

// Compared with the period just before; a huge jump means there was nothing to compare with.
const deltaHint = (change, t) => {
  if (change === null) return undefined;
  if (change > 300) return t('ads.newActivity');
  return t('ads.vsBeforeTemplate', { arrow: change >= 0 ? '▲' : '▼', percent: Math.abs(change).toFixed(1) });
};
const objectiveLabel = (key, t) => {
  const objective = AD_OBJECTIVES.find((item) => item.key === key);
  return objective ? t(`ads.objectives.${objective.labelKey}`) : key;
};

const EMPTY_AD_ACCOUNTS = { facebookConnected: false, hasAdsToken: false, hasAdsPermission: false, accounts: [] };

// Turns a rule's raw fields into the one-line sentence its card shows — e.g.
// "If Spend is more than ₹1,000 over the last 7 days".
function describeRule(rule, t) {
  const metric = AD_RULE_METRICS.find((item) => item.key === rule.metric);
  const comparator = AD_RULE_COMPARATORS.find((item) => item.key === rule.comparator);
  const value = metric?.unit === 'currency' ? formatCurrency(rule.threshold) : metric?.unit === 'percent' ? formatPercent(rule.threshold) : formatNumber(rule.threshold);
  const metricLabel = metric ? t(`ads.ruleMetrics.${metric.labelKey}`) : rule.metric;
  const comparatorLabel = comparator ? t(`ads.ruleComparators.${comparator.labelKey}`) : rule.comparator;
  const unit = t(rule.windowDays === 1 ? 'ads.windowDayOne' : 'ads.windowDayOther');
  return t('ads.ruleDescription', { metric: metricLabel, comparator: comparatorLabel, value, windowDays: rule.windowDays, unit });
}

function Ads() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = ['accounts', 'library', 'rules'].includes(searchParams.get('tab')) ? searchParams.get('tab') : 'overview';

  const [ads, setAds] = useState([]);
  const [adAccountsData, setAdAccountsData] = useState(EMPTY_AD_ACCOUNTS);
  const [templates, setTemplates] = useState([]);
  const [rules, setRules] = useState([]);
  const [images, setImages] = useState([]);
  const [requestStatus, setRequestStatus] = useState(REQUEST_STATUS.LOADING);
  const [isSyncing, setIsSyncing] = useState(false);
  const [days, setDays] = useState(30);
  const [platformFilter, setPlatformFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [adAccountFilter, setAdAccountFilter] = useState('all');
  const [campaignFilter, setCampaignFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [isTemplateFormOpen, setIsTemplateFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [deleteTemplateTarget, setDeleteTemplateTarget] = useState(null);
  const [isRuleFormOpen, setIsRuleFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [deleteRuleTarget, setDeleteRuleTarget] = useState(null);
  const selection = useRowSelection();

  function load() {
    setRequestStatus(REQUEST_STATUS.LOADING);
    Promise.all([getAds(), getAdAccounts(), getAdCreativeTemplates(), getAdRules(), getMediaItems()])
      .then(([adList, accountData, templateList, ruleList, mediaList]) => {
        setAds(adList);
        setAdAccountsData(accountData);
        setTemplates(templateList);
        setRules(ruleList);
        setImages(mediaList.filter((item) => item.type === MEDIA_TYPE.IMAGE));
        setRequestStatus(REQUEST_STATUS.SUCCEEDED);
      })
      .catch(() => setRequestStatus(REQUEST_STATUS.FAILED));
  }

  useEffect(() => {
    load();
  }, []);

  function handleCreateOrUpdateTemplate(payload) {
    const request = editingTemplate ? updateAdCreativeTemplate(editingTemplate.id, payload) : createAdCreativeTemplate(payload);
    request
      .then((template) => {
        setTemplates((current) => (editingTemplate ? current.map((item) => (item.id === template.id ? template : item)) : [template, ...current]));
        setIsTemplateFormOpen(false);
        setEditingTemplate(null);
        showToast({ type: 'success', title: t(editingTemplate ? 'ads.templateUpdatedToast' : 'ads.templateSavedToast'), message: template.name });
      })
      .catch((error) => showToast({ type: 'error', title: t('ads.templateSaveError'), message: apiErrorMessage(error) }));
  }

  function handleDeleteTemplateConfirmed() {
    const id = deleteTemplateTarget.id;
    deleteAdCreativeTemplate(id).then(() => {
      setTemplates((current) => current.filter((item) => item.id !== id));
      setDeleteTemplateTarget(null);
      showToast({ type: 'success', title: t('ads.templateDeletedToast') });
    });
  }

  function handleCreateOrUpdateRule(payload) {
    const request = editingRule ? updateAdRule(editingRule.id, payload) : createAdRule(payload);
    request
      .then((rule) => {
        setRules((current) => (editingRule ? current.map((item) => (item.id === rule.id ? rule : item)) : [rule, ...current]));
        setIsRuleFormOpen(false);
        setEditingRule(null);
        showToast({ type: 'success', title: t(editingRule ? 'ads.ruleUpdatedToast' : 'ads.ruleCreatedToast'), message: rule.name });
      })
      .catch((error) => showToast({ type: 'error', title: t('ads.ruleSaveError'), message: apiErrorMessage(error) }));
  }

  function handleToggleRule(rule) {
    updateAdRule(rule.id, { ...rule, isActive: !rule.isActive })
      .then((updated) => {
        setRules((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        showToast({ type: 'success', title: t(updated.isActive ? 'ads.ruleTurnedOnToast' : 'ads.ruleTurnedOffToast'), message: updated.name });
      })
      .catch((error) => showToast({ type: 'error', title: t('ads.ruleUpdateError'), message: apiErrorMessage(error) }));
  }

  function handleDeleteRuleConfirmed() {
    const id = deleteRuleTarget.id;
    deleteAdRule(id).then(() => {
      setRules((current) => current.filter((item) => item.id !== id));
      setDeleteRuleTarget(null);
      showToast({ type: 'success', title: t('ads.ruleDeletedToast') });
    });
  }

  function handleSync() {
    setIsSyncing(true);
    syncAdAccounts()
      .then((accountData) => {
        setAdAccountsData(accountData);
        showToast({
          type: 'success',
          title: t('ads.accountsSyncedToast'),
          message: t(accountData.accounts.length === 1 ? 'ads.accountsFoundOne' : 'ads.accountsFoundOther', { count: accountData.accounts.length }),
        });
      })
      .catch((error) => showToast({ type: 'error', title: t('ads.syncError'), message: apiErrorMessage(error) }))
      .finally(() => setIsSyncing(false));
  }

  // Campaign names are real but auto-generated (createCampaign/createBulkCampaign always name the
  // campaign after the ad's own name — see adsService.js's present()), so this list can have
  // duplicates when several ads share one campaign (a Phase 4 bulk batch) — that's fine, the filter
  // just groups by the name shown, same as a person would expect.
  const campaignNames = useMemo(() => [...new Set(ads.map((ad) => ad.campaignName).filter(Boolean))].sort(), [ads]);

  const filteredAds = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return ads.filter((ad) => {
      const matchesPlatform = platformFilter === 'all' || ad.platforms.includes(platformFilter);
      const matchesStatus = statusFilter === 'all' || ad.status === statusFilter;
      const matchesAccount = adAccountFilter === 'all' || ad.adAccountId === adAccountFilter;
      const matchesCampaign = campaignFilter === 'all' || ad.campaignName === campaignFilter;
      const matchesSearch = !term || ad.name.toLowerCase().includes(term);
      return matchesPlatform && matchesStatus && matchesAccount && matchesCampaign && matchesSearch;
    });
  }, [ads, platformFilter, statusFilter, adAccountFilter, campaignFilter, searchTerm]);

  const pagination = usePagination(filteredAds, { resetKey: `${platformFilter}|${statusFilter}|${adAccountFilter}|${campaignFilter}|${searchTerm}|${days}`, initialSize: 25 });
  const pageIds = pagination.pageItems.map((ad) => ad.id);

  const endDate = adsToday();
  const current = useMemo(() => totalsForAds(filteredAds, days, endDate), [filteredAds, days, endDate]);
  const previous = useMemo(() => totalsForAds(filteredAds, days, endDate, 1), [filteredAds, days, endDate]);
  const series = useMemo(() => seriesForAds(filteredAds, days, endDate), [filteredAds, days, endDate]);
  const platformSpend = useMemo(() => spendByPlatform(filteredAds, days, endDate), [filteredAds, days, endDate]);
  const perAdTotals = useMemo(() => {
    const map = new Map();
    ads.forEach((ad) => map.set(ad.id, sumDaily(sliceRange(ad.daily, days, endDate))));
    return map;
  }, [ads, days, endDate]);

  function updateTab(tab) {
    setSearchParams(tab === 'overview' ? {} : { tab });
  }

  function handleBulkStatus(status) {
    const ids = [...selection.selectedIds].filter((id) => {
      const ad = ads.find((item) => item.id === id);
      return ad && (status === AD_STATUS.PAUSED ? ad.status === AD_STATUS.ACTIVE : ad.status === AD_STATUS.PAUSED);
    });
    if (ids.length === 0) {
      showToast({ type: 'info', title: t('ads.nothingToChangeTitle'), message: t(status === AD_STATUS.PAUSED ? 'ads.onlyActiveCanPause' : 'ads.onlyPausedCanResume') });
      return;
    }
    updateAdsStatus(ids, status).then(() => {
      setAds((currentAds) => currentAds.map((ad) => (ids.includes(ad.id) ? { ...ad, status } : ad)));
      selection.clear();
      const statusWord = t(status === AD_STATUS.PAUSED ? 'ads.pausedWord' : 'ads.resumedWord');
      showToast({ type: 'success', title: t(ids.length === 1 ? 'ads.bulkStatusToastOne' : 'ads.bulkStatusToastOther', { count: ids.length, statusWord }) });
    });
  }

  function handleBulkDeleteConfirmed() {
    const ids = [...selection.selectedIds];
    deleteAds(ids).then(() => {
      setAds((currentAds) => currentAds.filter((ad) => !ids.includes(ad.id)));
      selection.clear();
      setIsBulkDeleteOpen(false);
      showToast({ type: 'success', title: t(ids.length === 1 ? 'ads.bulkDeletedToastOne' : 'ads.bulkDeletedToastOther', { count: ids.length }) });
    });
  }

  const filterLabel =
    [
      platformFilter !== 'all' ? getPlatformByKey(platformFilter)?.label : null,
      statusFilter !== 'all' ? t(`common.status.${statusFilter}`) : null,
      adAccountFilter !== 'all' ? adAccountsData.accounts.find((account) => account.id === adAccountFilter)?.name : null,
      campaignFilter !== 'all' ? campaignFilter : null,
      searchTerm.trim() ? `"${searchTerm.trim()}"` : null,
    ]
      .filter(Boolean)
      .join(' · ') || t('ads.allAds');

  function handlePrint() {
    if (!printAdsReport(filteredAds, days, filterLabel)) {
      showToast({ type: 'error', title: t('ads.popupBlockedTitle'), message: t('ads.popupBlockedMessage') });
    }
  }

  const reportOptions = [
    {
      label: t('ads.reportSummaryLabel'),
      description: t('ads.reportSummaryDesc'),
      icon: 'FileSpreadsheet',
      onClick: () => {
        downloadAdsSummaryCsv(filteredAds, days);
        showToast({ type: 'success', title: t('ads.reportDownloadedToast'), message: t('ads.reportSummaryMessage', { count: filteredAds.length, days }) });
      },
    },
    {
      label: t('ads.reportDailyLabel'),
      description: t('ads.reportDailyDesc'),
      icon: 'CalendarRange',
      onClick: () => {
        downloadAdsDailyCsv(filteredAds, days);
        showToast({ type: 'success', title: t('ads.reportDownloadedToast'), message: t('ads.reportDailyMessage', { days }) });
      },
    },
    { label: t('ads.reportPdfLabel'), description: t('ads.reportPdfDesc'), icon: 'FileText', onClick: handlePrint },
  ];

  if (requestStatus === REQUEST_STATUS.LOADING) {
    return (
      <>
        <PageHeader title={t('nav.ads')} subtitle={t('ads.loading')} />
        <SkeletonKpiRow />
      </>
    );
  }

  if (requestStatus === REQUEST_STATUS.FAILED) {
    return (
      <>
        <PageHeader title={t('nav.ads')} />
        <ErrorState onRetry={load} />
      </>
    );
  }

  const connectedCount = adAccountsData.accounts.length;

  const statCards = [
    { key: 'spend', label: t('ads.statSpend'), value: formatCurrency(current.spend), icon: 'Wallet', tone: 'primary', hint: deltaHint(percentChange(current.spend, previous.spend), t) },
    { key: 'impressions', label: t('ads.statImpressions'), value: formatCompactNumber(current.impressions), icon: 'Eye', tone: 'sky', hint: deltaHint(percentChange(current.impressions, previous.impressions), t) },
    { key: 'clicks', label: t('ads.statClicks'), value: formatNumber(current.clicks), icon: 'MousePointerClick', tone: 'purple', hint: deltaHint(percentChange(current.clicks, previous.clicks), t) },
    { key: 'ctr', label: t('ads.statCtr'), value: formatPercent(current.ctr), icon: 'Percent', tone: 'green' },
    { key: 'cpc', label: t('ads.statCpc'), value: formatCurrency(current.cpc), icon: 'Coins', tone: 'amber' },
    { key: 'results', label: t('ads.statResults'), value: t('ads.notTracked'), icon: 'Target', tone: 'red', hint: t('ads.noPixelHint') },
  ];

  return (
    <div className="fade-in">
      <PageHeader
        title={t('nav.ads')}
        subtitle={t('pages.ads')}
        guideChapterId="ads"
        actions={
          <>
            <DownloadReportMenu options={reportOptions} disabled={filteredAds.length === 0} label={t('ads.downloadReportButton')} />
            <button type="button" className="btn btn-primary" onClick={() => navigate('/ads/create')}>
              <Icon name="Plus" size={16} />
              {t('ads.createAd')}
            </button>
          </>
        }
      />

      <div className="tab-strip mb-4">
        {TABS.map((tab) => (
          <button key={tab.key} type="button" className={`tab-strip__item ${activeTab === tab.key ? 'is-active' : ''}`.trim()} onClick={() => updateTab(tab.key)}>
            {t(`ads.tabs.${tab.labelKey}`)}
            {tab.key === 'accounts' ? <span className="ads-tab-count">{connectedCount}</span> : null}
          </button>
        ))}
      </div>

      {activeTab === 'accounts' ? (
        <>
          <div className="callout-banner callout-banner--info">
            <Icon name="Wallet" size={16} />
            <span>
              {t('ads.accountsInfo1')}<strong>{t('ads.accountsInfoBold')}</strong>{t('ads.accountsInfo2')}
            </span>
          </div>

          {!adAccountsData.facebookConnected ? (
            <div className="callout-banner callout-banner--warning">
              <Icon name="AlertTriangle" size={16} />
              <span>
                {t('ads.fbNotConnected1')}<Link to="/social-accounts/connect/facebook">{t('ads.fbNotConnectedLink')}</Link>{t('ads.fbNotConnected2')}
              </span>
            </div>
          ) : !adAccountsData.hasAdsToken ? (
            <div className="callout-banner callout-banner--warning">
              <Icon name="AlertTriangle" size={16} />
              <span>
                {t('ads.noToken1')}
                <Link to="/social-accounts/connect/facebook">{t('ads.noTokenLink')}</Link>{t('ads.noToken2')}
              </span>
            </div>
          ) : !adAccountsData.hasAdsPermission ? (
            <div className="callout-banner callout-banner--warning">
              <Icon name="AlertTriangle" size={16} />
              <span>
                {t('ads.noPermission1')}
                <Link to="/social-accounts/connect/facebook">{t('ads.noTokenLink')}</Link>{t('ads.noPermission2')}
              </span>
            </div>
          ) : (
            <div className="panel-card mb-4">
              <div className="panel-card__body d-flex align-items-center justify-content-between flex-wrap gap-3">
                <div>
                  <div className="fw-semibold">{t('ads.connectionReady')}</div>
                  <p className="text-muted-custom small mb-0">{t('ads.connectionReadyText')}</p>
                </div>
                <button type="button" className="btn btn-outline-primary-custom" onClick={handleSync} disabled={isSyncing}>
                  {isSyncing ? (
                    <>
                      <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" /> {t('ads.syncing')}
                    </>
                  ) : (
                    <>
                      <Icon name="RefreshCw" size={16} /> {t('ads.syncButton')}
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {adAccountsData.accounts.length === 0 ? (
            <EmptyState
              icon="Wallet"
              title={t('ads.noAccountsTitle')}
              description={t(adAccountsData.hasAdsPermission ? 'ads.noAccountsDescSynced' : 'ads.noAccountsDescNotConnected')}
            />
          ) : (
            <div className="connect-list">
              {adAccountsData.accounts.map((account) => (
                <div key={account.id} className="connect-row">
                  <NetworkIcons network={{ platforms: ['facebook', 'instagram'], subtitle: t('ads.metaSubtitle') }} size={52} />
                  <span className="connect-row__text">
                    <span className="connect-row__label">{account.name}</span>
                    <span className="connect-row__badge">
                      {account.externalAccountId} · {account.currency}
                      {account.timezone ? ` · ${account.timezone}` : ''}
                      {account.businessName ? ` · ${account.businessName}` : ''}
                    </span>
                    {account.disableReason ? (
                      <span className="network-placements">
                        <span className="network-placement is-missing">
                          <Icon name="AlertCircle" size={12} /> {t('ads.needsAttention', { status: account.accountStatus })}
                        </span>
                      </span>
                    ) : null}
                  </span>
                  <span className="status-badge status-badge--connected ms-auto">{t('ads.readyBadge')}</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : activeTab === 'library' ? (
        <>
          <div className="callout-banner callout-banner--info">
            <Icon name="LayoutTemplate" size={16} />
            <span>{t('ads.libraryIntro')}</span>
          </div>

          <div className="d-flex justify-content-end mb-4">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setEditingTemplate(null);
                setIsTemplateFormOpen(true);
              }}
            >
              <Icon name="Plus" size={16} /> {t('ads.newTemplate')}
            </button>
          </div>

          {templates.length === 0 ? (
            <EmptyState
              icon="LayoutTemplate"
              title={t('ads.noTemplatesTitle')}
              description={t('ads.noTemplatesText')}
              actionLabel={t('ads.newTemplate')}
              onAction={() => {
                setEditingTemplate(null);
                setIsTemplateFormOpen(true);
              }}
            />
          ) : (
            <div className="campaigns-grid">
              {templates.map((template) => (
                <div key={template.id} className="panel-card">
                  <div className="panel-card__body">
                    <div className="d-flex align-items-start gap-3 mb-3">
                      {template.mediaUrl ? (
                        <img src={template.mediaUrl} alt={template.name} className="ad-template-thumb" />
                      ) : (
                        <div className="ad-template-thumb ad-template-thumb--empty">
                          <Icon name="Image" size={20} />
                        </div>
                      )}
                      <div className="flex-grow-1 overflow-hidden">
                        <div className="table-row-title text-truncate">{template.name}</div>
                        <div className="table-row-subtitle text-truncate">{template.headline || t('ads.noHeadline')}</div>
                      </div>
                    </div>
                    <p className="text-secondary-custom small mb-3 ad-template-text">{template.text || t('ads.noAdText')}</p>
                    <div className="d-flex gap-2">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary-custom flex-grow-1"
                        onClick={() => {
                          setEditingTemplate(template);
                          setIsTemplateFormOpen(true);
                        }}
                      >
                        <Icon name="Pencil" size={14} /> {t('common.edit')}
                      </button>
                      <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setDeleteTemplateTarget(template)}>
                        <Icon name="Trash2" size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : activeTab === 'rules' ? (
        <>
          <div className="callout-banner callout-banner--info">
            <Icon name="Zap" size={16} />
            <span>
              {t('ads.rulesIntro1')}<strong>{t('ads.rulesIntroBold')}</strong>{t('ads.rulesIntro2')}
            </span>
          </div>

          <div className="d-flex justify-content-end mb-4">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setEditingRule(null);
                setIsRuleFormOpen(true);
              }}
              disabled={adAccountsData.accounts.length === 0}
            >
              <Icon name="Plus" size={16} /> {t('ads.newRule')}
            </button>
          </div>

          {rules.length === 0 ? (
            <EmptyState
              icon="Zap"
              title={t('ads.noRulesTitle')}
              description={t(adAccountsData.accounts.length === 0 ? 'ads.noRulesDescNoAccount' : 'ads.noRulesDescHasAccount')}
              actionLabel={adAccountsData.accounts.length > 0 ? t('ads.newRule') : undefined}
              onAction={adAccountsData.accounts.length > 0 ? () => setIsRuleFormOpen(true) : undefined}
            />
          ) : (
            <div className="d-flex flex-column gap-3">
              {rules.map((rule) => (
                <div key={rule.id} className="panel-card">
                  <div className="panel-card__body d-flex align-items-center gap-3 flex-wrap">
                    <div className="flex-grow-1">
                      <div className="d-flex align-items-center gap-2 mb-1">
                        <span className="table-row-title">{rule.name}</span>
                        <StatusBadge status={rule.isActive ? 'active' : 'paused'} label={rule.isActive ? t('common.status.active') : t('common.off')} />
                      </div>
                      <p className="text-secondary-custom small mb-1">{describeRule(rule, t)} → {t(`ads.ruleActions.${rule.action}`)}</p>
                      <p className="text-muted-custom small mb-0">
                        {rule.adAccountName} · {rule.lastFiredAt ? t('ads.lastActed', { when: formatRelativeTime(rule.lastFiredAt) }) : t('ads.neverFired')}
                      </p>
                    </div>
                    <div className="d-flex align-items-center gap-2">
                      <div className="form-check form-switch mb-0" title={t(rule.isActive ? 'ads.turnOffAria' : 'ads.turnOnAria', { name: rule.name })}>
                        <input className="form-check-input" type="checkbox" role="switch" checked={rule.isActive} onChange={() => handleToggleRule(rule)} aria-label={t(rule.isActive ? 'ads.turnOffAria' : 'ads.turnOnAria', { name: rule.name })} />
                      </div>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary-custom"
                        onClick={() => {
                          setEditingRule(rule);
                          setIsRuleFormOpen(true);
                        }}
                      >
                        <Icon name="Pencil" size={14} /> {t('common.edit')}
                      </button>
                      <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setDeleteRuleTarget(rule)}>
                        <Icon name="Trash2" size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {connectedCount === 0 ? (
            <div className="callout-banner callout-banner--warning">
              <Icon name="AlertTriangle" size={16} />
              <span>
                {t('ads.noAccountBanner1')}<Link to="/ads?tab=accounts">{t('ads.setupAccountsLink')}</Link>{t('ads.noAccountBanner2')}
              </span>
            </div>
          ) : null}

          <div className="panel-card mb-4">
            <div className="panel-card__body filter-bar">
              <div className="filter-bar__field">
                <span className="filter-bar__label">
                  <Icon name="CalendarRange" size={13} /> {t('ads.period')}
                </span>
                <select className="form-select" value={days} onChange={(event) => setDays(Number(event.target.value))}>
                  {AD_DATE_RANGES.map((range) => (
                    <option key={range.value} value={range.value}>
                      {t(`ads.dateRanges.${range.labelKey}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="filter-bar__field">
                <span className="filter-bar__label">
                  <Icon name="Share2" size={13} /> {t('ads.platformFilter')}
                </span>
                <select className="form-select" value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)}>
                  <option value="all">{t('ads.allPlatforms')}</option>
                  {PLATFORMS.filter((platform) => AD_PLATFORM_KEYS.includes(platform.key)).map((platform) => (
                    <option key={platform.key} value={platform.key}>
                      {platform.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="filter-bar__field">
                <span className="filter-bar__label">
                  <Icon name="Activity" size={13} /> {t('posts.colStatus')}
                </span>
                <select className="form-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="all">{t('ads.allStatuses')}</option>
                  {Object.values(AD_STATUS).map((status) => (
                    <option key={status} value={status}>
                      {t(`common.status.${status}`)}
                    </option>
                  ))}
                </select>
              </div>
              {adAccountsData.accounts.length > 1 ? (
                <div className="filter-bar__field">
                  <span className="filter-bar__label">
                    <Icon name="Wallet" size={13} /> {t('ads.adAccount')}
                  </span>
                  <select className="form-select" value={adAccountFilter} onChange={(event) => setAdAccountFilter(event.target.value)}>
                    <option value="all">{t('ads.allAdAccounts')}</option>
                    {adAccountsData.accounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                </div>
              ) : null}
              {campaignNames.length > 1 ? (
                <div className="filter-bar__field">
                  <span className="filter-bar__label">
                    <Icon name="Megaphone" size={13} /> {t('composer.campaign')}
                  </span>
                  <select className="form-select" value={campaignFilter} onChange={(event) => setCampaignFilter(event.target.value)}>
                    <option value="all">{t('ads.allCampaigns')}</option>
                    {campaignNames.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="filter-bar__field">
                <span className="filter-bar__label">
                  <Icon name="Search" size={13} /> {t('ads.adName')}
                </span>
                <input type="search" className="form-control" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder={t('ads.searchAdsPlaceholder')} />
              </div>
            </div>
          </div>

          <StatCardGrid cards={statCards} className="stat-card-grid--three" />

          <div className="ads-chart-grid">
            <AdsPerformanceChart series={series} title={t('ads.performanceTitle')} />
            <div className="panel-card">
              <div className="panel-card__header">
                <h3 className="panel-card__title">{t('ads.spendByPlatform')}</h3>
                <span
                  data-tooltip={t('ads.spendByPlatformTooltip')}
                  data-tooltip-position="bottom"
                >
                  <Icon name="Info" size={14} className="text-muted-custom" />
                </span>
              </div>
              <div className="panel-card__body d-flex flex-column gap-3">
                {platformSpend.length === 0 ? (
                  <p className="text-muted-custom mb-0">{t('ads.noSpendInPeriod')}</p>
                ) : (
                  platformSpend.map((row) => {
                    const share = current.spend ? (row.spend / current.spend) * 100 : 0;
                    return (
                      <div key={row.platform} className="d-flex align-items-center gap-3">
                        <PlatformIcon platformKey={row.platform} size={28} />
                        <div className="flex-grow-1">
                          <div className="d-flex justify-content-between small mb-1">
                            <span>{getPlatformByKey(row.platform)?.label}</span>
                            <span className="text-muted-custom">
                              {formatCurrency(row.spend)} · {Math.round(share)}%
                            </span>
                          </div>
                          <div className="progress platform-performance-bar">
                            <div className="progress-bar" role="progressbar" style={{ width: `${share}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="panel-card">
            <div className="panel-card__header">
              <h3 className="panel-card__title">{t('ads.yourAds')}</h3>
              <span className="text-muted-custom small">{t('ads.filteredOfTotal', { filtered: filteredAds.length, total: ads.length })}</span>
            </div>
            {filteredAds.length > 0 ? <TableToolbar pagination={pagination} /> : null}
            <BulkActionBar selection={selection} show={filteredAds.length > 0}>
              <button type="button" className="btn btn-sm btn-outline-secondary-custom" onClick={() => handleBulkStatus(AD_STATUS.PAUSED)}>
                <Icon name="Pause" size={14} /> {t('ads.pause')}
              </button>
              <button type="button" className="btn btn-sm btn-outline-secondary-custom" onClick={() => handleBulkStatus(AD_STATUS.ACTIVE)}>
                <Icon name="Play" size={14} /> {t('ads.resume')}
              </button>
              <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setIsBulkDeleteOpen(true)}>
                <Icon name="Trash2" size={14} /> {t('common.delete')}
              </button>
            </BulkActionBar>

            <div className="panel-card__body panel-card__body--flush">
              {ads.length === 0 ? (
                <EmptyState icon="Megaphone" title={t('ads.noAdsYetTitle')} description={t('ads.noAdsYetText')} actionLabel={t('ads.createAd')} onAction={() => navigate('/ads/create')} />
              ) : filteredAds.length === 0 ? (
                <EmptyState icon="Megaphone" title={t('ads.noAdsMatchTitle')} description={t('ads.noAdsMatchText')} />
              ) : isMobile ? (
                <div className="d-flex flex-column gap-3 p-4">
                  {pagination.pageItems.map((ad) => {
                    const totals = perAdTotals.get(ad.id);
                    return (
                      <div key={ad.id} className="surface-card">
                        <div className="d-flex align-items-start gap-2">
                          <RowCheckbox id={ad.id} selection={selection} label={t('ads.selectAdAria', { name: ad.name })} />
                          <div className="flex-grow-1 overflow-hidden" role="button" tabIndex={0} onClick={() => navigate(`/ads/${ad.id}`)}>
                            <div className="table-row-title text-truncate">{ad.name}</div>
                            <div className="table-row-subtitle">{objectiveLabel(ad.objective, t)}</div>
                          </div>
                          <StatusBadge status={ad.status} />
                        </div>
                        <div className="ad-mobile-metrics" onClick={() => navigate(`/ads/${ad.id}`)} role="button" tabIndex={0}>
                          <div><span>{t('ads.spent')}</span><strong>{formatCurrency(totals.spend)}</strong></div>
                          <div><span>{t('ads.statClicks')}</span><strong>{formatNumber(totals.clicks)}</strong></div>
                          <div><span>{t('ads.statCtr')}</span><strong>{formatPercent(totals.ctr)}</strong></div>
                          <div><span>{t('ads.statResults')}</span><strong className="text-muted-custom">{t('ads.notTracked')}</strong></div>
                        </div>
                        <div className="d-flex gap-1 mt-2">
                          {ad.platforms.map((key) => <PlatformIcon key={key} platformKey={key} size={22} />)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="data-table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th className="table-checkbox-col"><SelectAllCheckbox ids={pageIds} selection={selection} /></th>
                        <th>{t('ads.colAd')}</th>
                        <th>{t('posts.colStatus')}</th>
                        <th>{t('ads.colBudget')}</th>
                        <th className="text-end">{t('ads.spent')}</th>
                        <th className="text-end">{t('ads.statImpressions')}</th>
                        <th className="text-end">{t('ads.statClicks')}</th>
                        <th className="text-end">{t('ads.statCtr')}</th>
                        <th className="text-end">{t('ads.statResults')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagination.pageItems.map((ad) => {
                        const totals = perAdTotals.get(ad.id);
                        return (
                          <tr key={ad.id} className={selection.isSelected(ad.id) ? 'is-selected' : ''}>
                            <td className="table-checkbox-col"><RowCheckbox id={ad.id} selection={selection} label={t('ads.selectAdAria', { name: ad.name })} /></td>
                            <td role="button" onClick={() => navigate(`/ads/${ad.id}`)}>
                              <div className="d-flex align-items-center gap-3">
                                <div className="d-flex gap-1">
                                  {ad.platforms.map((key) => <PlatformIcon key={key} platformKey={key} size={24} />)}
                                </div>
                                <div>
                                  <div className="table-row-title">{ad.name}</div>
                                  <div className="table-row-subtitle">{objectiveLabel(ad.objective, t)} · {formatDate(ad.startDate)} – {formatDate(ad.endDate)}</div>
                                </div>
                              </div>
                            </td>
                            <td><StatusBadge status={ad.status} /></td>
                            <td>{formatCurrency(ad.budget)}<span className="text-muted-custom small"> {t(ad.budgetType === 'daily' ? 'ads.perDay' : 'ads.totalBudget')}</span></td>
                            <td className="text-end">{formatCurrency(totals.spend)}</td>
                            <td className="text-end">{formatNumber(totals.impressions)}</td>
                            <td className="text-end">{formatNumber(totals.clicks)}</td>
                            <td className="text-end">{formatPercent(totals.ctr)}</td>
                            <td className="text-end text-muted-custom">{t('ads.notTracked')}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <Pager pagination={pagination} />
          </div>
        </>
      )}

      <ConfirmDialog
        isOpen={isBulkDeleteOpen}
        onClose={() => setIsBulkDeleteOpen(false)}
        onConfirm={handleBulkDeleteConfirmed}
        title={t(selection.count === 1 ? 'ads.bulkDeleteTitleOne' : 'ads.bulkDeleteTitleOther', { count: selection.count })}
        message={t('ads.bulkDeleteMessage')}
        confirmLabel={t('common.delete')}
        isDanger
      />

      <TemplateFormModal
        isOpen={isTemplateFormOpen}
        onClose={() => {
          setIsTemplateFormOpen(false);
          setEditingTemplate(null);
        }}
        onSubmit={handleCreateOrUpdateTemplate}
        template={editingTemplate}
        images={images}
      />
      <ConfirmDialog
        isOpen={Boolean(deleteTemplateTarget)}
        onClose={() => setDeleteTemplateTarget(null)}
        onConfirm={handleDeleteTemplateConfirmed}
        title={t('ads.deleteNamedTitle', { name: deleteTemplateTarget?.name })}
        message={t('ads.deleteTemplateMessage')}
        confirmLabel={t('common.delete')}
        isDanger
      />

      <RuleFormModal
        isOpen={isRuleFormOpen}
        onClose={() => {
          setIsRuleFormOpen(false);
          setEditingRule(null);
        }}
        onSubmit={handleCreateOrUpdateRule}
        rule={editingRule}
        accounts={adAccountsData.accounts}
      />
      <ConfirmDialog
        isOpen={Boolean(deleteRuleTarget)}
        onClose={() => setDeleteRuleTarget(null)}
        onConfirm={handleDeleteRuleConfirmed}
        title={t('ads.deleteNamedTitle', { name: deleteRuleTarget?.name })}
        message={t('ads.deleteRuleMessage')}
        confirmLabel={t('common.delete')}
        isDanger
      />
    </div>
  );
}

export default Ads;
