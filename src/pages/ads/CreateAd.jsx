import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Breadcrumb from '../../components/common/Breadcrumb';
import PageHeader from '../../components/common/PageHeader';
import Icon from '../../components/common/Icon';
import PlatformIcon from '../../components/common/PlatformIcon';
import TextField from '../../components/forms/TextField';
import DatePickerField from '../../components/forms/DatePickerField';
import AdPreview from '../../components/ads/AdPreview';
import NetworkIcons from '../../components/ads/NetworkIcons';
import UtmBuilderModal from '../../components/common/UtmBuilderModal';
import { createAd, createBulkAd, getAdAccounts, getAdCreativeTemplates, isPlacementConnected } from '../../services/api/adsApi';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { getPosts } from '../../services/api/postsApi';
import { getMediaItems } from '../../services/api/mediaApi';
import { AD_CTAS, AD_INTERESTS, AD_LOCATIONS, AD_OBJECTIVES, AD_STATUS, MAX_AD_VARIATIONS, getAdNetwork } from '../../config/adPlatforms';
import { getPlatformByKey } from '../../config/platforms';
import { MEDIA_TYPE, POST_STATUS } from '../../config/constants';
import { estimateResults } from '../../utils/adMetrics';
import { formatCompactNumber, formatCurrency } from '../../utils/formatters';
import { useToast } from '../../components/common/ToastProvider';
import { useI18n } from '../../i18n/useI18n';

// The label of each step is adCreate.steps.<key>.
const STEPS = ['objective', 'where', 'ad', 'audience', 'budget', 'review'];
const DAY_MS = 24 * 60 * 60 * 1000;
const toIso = (date) => date.toISOString().slice(0, 10);
const fromIso = (value) => new Date(`${value}T00:00:00`);

function initialForm() {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  const end = new Date(start.getTime() + 13 * DAY_MS);
  return {
    name: '',
    objective: 'traffic',
    adAccountId: '',
    platforms: [],
    postId: '',
    isBoost: false,
    mediaId: '',
    headline: '',
    text: '',
    cta: 'Learn more',
    destinationUrl: '',
    // Phase 4: bulk ad creation. Extra creative variations beyond the one above — each one shares this
    // same ad account/platforms/audience/budget/schedule, differing only in their own headline/text/
    // cta/destinationUrl/image. Empty means a normal single ad; one or more means a bulk request.
    variations: [],
    locations: ['India'],
    ageMin: 18,
    ageMax: 45,
    gender: 'all',
    interests: [],
    budgetType: 'daily',
    budget: 1000,
    startDate: toIso(start),
    endDate: toIso(end),
  };
}

function toggleInList(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function CreateAd() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(initialForm);
  const [accounts, setAccounts] = useState([]);
  const [posts, setPosts] = useState([]);
  const [images, setImages] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [isLaunching, setIsLaunching] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  // Phase 6: UTM builder. Which destination URL field it's editing — 'primary' or a variation index —
  // or null when closed; a single shared modal instance covers the primary creative and every variation.
  const [utmTarget, setUtmTarget] = useState(null);

  useEffect(() => {
    Promise.all([getAdAccounts(), getPosts(), getMediaItems(), getAdCreativeTemplates()]).then(([accountData, postList, mediaList, templateList]) => {
      setAccounts(accountData.accounts);
      setPosts(postList.filter((post) => post.status === POST_STATUS.PUBLISHED || post.status === POST_STATUS.SCHEDULED));
      setImages(mediaList.filter((item) => item.type === MEDIA_TYPE.IMAGE));
      setTemplates(templateList);
    });
  }, []);

  const update = (patch) => setForm((current) => ({ ...current, ...patch }));
  const selectedAccount = accounts.find((item) => item.id === form.adAccountId);
  // Only Meta ad accounts can be discovered today — see backend/README.md's Ads section — so a chosen
  // account always runs on Facebook + Instagram placements, same list Meta Ads has always offered.
  const network = selectedAccount ? getAdNetwork(selectedAccount.network) : null;
  const selectedImage = images.find((item) => item.id === form.mediaId);

  const days = Math.max(1, Math.round((fromIso(form.endDate) - fromIso(form.startDate)) / DAY_MS) + 1);
  const totalBudget = form.budgetType === 'daily' ? form.budget * days : form.budget;
  const estimate = useMemo(() => estimateResults({ totalBudget }), [totalBudget]);

  // What is missing on each step — shown when the person tries to continue.
  const problems = useMemo(() => {
    const list = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [] };
    if (!form.adAccountId) list[1].push(t('adCreate.problems.account'));
    else if (form.platforms.length === 0) {
      const anyConnected = network?.platforms.some(isPlacementConnected);
      list[1].push(anyConnected ? t('adCreate.problems.platform') : t('adCreate.problems.noneConnected'));
    }
    if (!form.isBoost) {
      if (!form.text.trim()) list[2].push(t('adCreate.problems.text'));
      if (!form.headline.trim()) list[2].push(t('adCreate.problems.headline'));
      if (!/^https?:\/\/\S+\.\S+/i.test(form.destinationUrl.trim())) list[2].push(t('adCreate.problems.link'));
      const incompleteVariation = form.variations.some(
        (variation) => !variation.text.trim() || !variation.headline.trim() || !/^https?:\/\/\S+\.\S+/i.test(variation.destinationUrl.trim())
      );
      if (incompleteVariation) list[2].push(t('adCreate.problems.variation'));
    }
    if (form.locations.length === 0) list[3].push(t('adCreate.problems.location'));
    if (form.ageMin > form.ageMax) list[3].push(t('adCreate.problems.age'));
    if (!(Number(form.budget) >= 100)) list[4].push(t('adCreate.problems.budget'));
    if (fromIso(form.endDate) < fromIso(form.startDate)) list[4].push(t('adCreate.problems.dates'));
    return list;
  }, [form, network, t]);

  function goNext() {
    if (problems[step].length > 0) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  }

  function goBack() {
    setShowErrors(false);
    setStep((current) => Math.max(current - 1, 0));
  }

  function launch(asDraft = false) {
    const firstProblem = Object.entries(problems).find(([, list]) => list.length > 0);
    if (!asDraft && firstProblem) {
      setStep(Number(firstProblem[0]));
      setShowErrors(true);
      return;
    }
    setIsLaunching(true);
    const shared = {
      name: form.name.trim() || form.headline.trim() || (form.isBoost ? t('adCreate.boostedPost') : t('adCreate.untitledAd')),
      objective: form.objective,
      adAccountId: form.adAccountId,
      platforms: form.platforms,
      budgetType: form.budgetType,
      budget: Number(form.budget),
      startDate: form.startDate,
      endDate: form.endDate,
      audience: { locations: form.locations, ageMin: form.ageMin, ageMax: form.ageMax, gender: form.gender, interests: form.interests },
      status: asDraft ? AD_STATUS.DRAFT : undefined,
    };
    const isBulk = !form.isBoost && form.variations.length > 0;
    const request = isBulk
      ? createBulkAd({
          ...shared,
          creatives: [
            { headline: form.headline, text: form.text, cta: form.cta, destinationUrl: form.destinationUrl, mediaId: form.mediaId || null },
            ...form.variations.map((variation) => ({ ...variation, mediaId: variation.mediaId || null })),
          ],
        })
      : createAd({
          ...shared,
          ...(form.isBoost
            ? { sourcePostId: form.postId }
            : { creative: { headline: form.headline, text: form.text, cta: form.cta, destinationUrl: form.destinationUrl, mediaId: form.mediaId || null } }),
        });

    request
      .then((result) => {
        const count = isBulk ? result.length : 1;
        showToast({
          type: 'success',
          title: asDraft ? t('ai.draft.savedTitle') : t('adCreate.submitted'),
          message: isBulk
            ? t(asDraft ? 'adCreate.bulkSaved' : 'adCreate.bulkSubmitted', { count })
            : asDraft
              ? result.name
              : t('adCreate.reviewSoon'),
        });
        navigate(isBulk ? '/ads' : `/ads/${result.id}`);
      })
      .catch((error) => {
        setIsLaunching(false);
        showToast({ type: 'error', title: apiErrorMessage(error, t('adCreate.launchFailed')) });
      });
  }

  function addVariation() {
    setForm((current) => (current.variations.length + 1 >= MAX_AD_VARIATIONS ? current : { ...current, variations: [...current.variations, { headline: '', text: '', cta: 'Learn more', destinationUrl: '', mediaId: '' }] }));
  }

  function updateVariation(index, patch) {
    setForm((current) => ({ ...current, variations: current.variations.map((variation, i) => (i === index ? { ...variation, ...patch } : variation)) }));
  }

  function removeVariation(index) {
    setForm((current) => ({ ...current, variations: current.variations.filter((_, i) => i !== index) }));
  }

  const utmInitialUrl = utmTarget === 'primary' ? form.destinationUrl : utmTarget !== null ? form.variations[utmTarget]?.destinationUrl || '' : '';

  function applyUtmUrl(taggedUrl) {
    if (utmTarget === 'primary') update({ destinationUrl: taggedUrl });
    else if (utmTarget !== null) updateVariation(utmTarget, { destinationUrl: taggedUrl });
    setUtmTarget(null);
  }

  // Phase 5: Creative Library. Prefills the primary creative's fields from a saved template — a plain
  // starting point, not a link, so editing it afterwards never changes the saved template itself.
  function pickTemplate(templateId) {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    update({ headline: template.headline, text: template.text, cta: template.cta, destinationUrl: template.destinationUrl, mediaId: template.mediaId || '' });
  }

  function pickVariationTemplate(index, templateId) {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    updateVariation(index, { headline: template.headline, text: template.text, cta: template.cta, destinationUrl: template.destinationUrl, mediaId: template.mediaId || '' });
  }

  function pickPost(postId) {
    const post = posts.find((item) => item.id === postId);
    if (!post) {
      update({ postId: '', isBoost: false });
      return;
    }
    // A real, already-published Facebook post can be genuinely boosted (Meta reuses its own text and
    // image directly — see backend/README.md's Ads section) — offered as the default when available,
    // since it's the most accurate way to turn a post into an ad. Any other post just seeds a fresh
    // ad's starting text/image, which stays fully editable.
    const canBoost = post.targets?.some((target) => target.platform === 'facebook' && target.status === 'published');
    update({
      postId,
      isBoost: canBoost,
      platforms: canBoost ? ['facebook'] : form.platforms,
      text: post.content,
      mediaId: post.media?.[0]?.id || '',
      // A real boost is a single, specific Facebook post — bulk variations don't apply to it.
      variations: canBoost ? [] : form.variations,
    });
  }

  const errorList = showErrors ? problems[step] : [];

  return (
    <div className="fade-in">
      <Breadcrumb items={[{ label: t('nav.ads'), to: '/ads' }, { label: t('adCreate.breadcrumb') }]} />
      <PageHeader title={t('adCreate.title')} subtitle={t('adCreate.subtitle')} guideChapterId="ads" />

      <ol className="ad-stepper" aria-label={t('adCreate.stepsLabel')}>
        {STEPS.map((key, index) => (
          <li key={key} className={`ad-stepper__item ${index === step ? 'is-active' : ''} ${index < step ? 'is-done' : ''}`.trim()}>
            <button type="button" onClick={() => index <= step && setStep(index)} disabled={index > step}>
              <span className="ad-stepper__number">{index < step ? <Icon name="Check" size={14} /> : index + 1}</span>
              <span className="ad-stepper__label">{t(`adCreate.steps.${key}`)}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="ad-create-layout">
        <div className="panel-card ad-create-main">
          <div className="panel-card__body">
            {errorList.length > 0 ? (
              <div className="callout-banner callout-banner--danger" role="alert">
                <Icon name="AlertCircle" size={16} />
                <span>{errorList.join(' ')}</span>
              </div>
            ) : null}

            {step === 0 ? (
              <>
                <h3 className="h5 mb-1">{t('adCreate.goalTitle')}</h3>
                <p className="text-secondary-custom mb-4">{t('adCreate.goalText')}</p>
                <div className="ad-choice-grid">
                  {AD_OBJECTIVES.map((objective) => (
                    <button key={objective.key} type="button" className={`ad-choice ${form.objective === objective.key ? 'is-selected' : ''}`.trim()} onClick={() => update({ objective: objective.key })}>
                      <span className="ad-choice__icon"><Icon name={objective.icon} size={20} /></span>
                      <span>
                        <strong>{t(`ads.objectives.${objective.labelKey}`)}</strong>
                        <span className="ad-choice__text">{t(`adCreate.objectiveText.${objective.key}`)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            {step === 1 ? (
              <>
                <h3 className="h5 mb-1">{t('adCreate.whereTitle')}</h3>
                <p className="text-secondary-custom mb-4">{t('adCreate.whereText')}</p>
                {accounts.length === 0 ? (
                  <Link to="/ads?tab=accounts" className="ad-choice is-locked">
                    <NetworkIcons network={{ platforms: ['facebook', 'instagram'], subtitle: 'Facebook & Instagram' }} size={40} />
                    <span>
                      <strong>{t('adCreate.noAccounts')}</strong>
                      <span className="ad-choice__text">{t('adCreate.setUpAccounts')}</span>
                    </span>
                  </Link>
                ) : (
                  <div className="ad-choice-grid">
                    {accounts.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`ad-choice ${form.adAccountId === item.id ? 'is-selected' : ''}`.trim()}
                        onClick={() =>
                          update({
                            adAccountId: item.id,
                            platforms: form.adAccountId === item.id ? form.platforms : getAdNetwork(item.network)?.platforms.filter(isPlacementConnected) || [],
                          })
                        }
                      >
                        <NetworkIcons network={{ platforms: ['facebook', 'instagram'], subtitle: 'Facebook & Instagram' }} size={40} />
                        <span>
                          <strong>{item.name}</strong>
                          <span className="ad-choice__text">{item.externalAccountId} · {item.currency}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {network ? (
                  <div className="mt-4">
                    <span className="form-label-custom d-block">{t('adCreate.showOn')}</span>
                    <div className="ad-chip-row">
                      {network.platforms.map((platformKey) => {
                        const ready = isPlacementConnected(platformKey);
                        return (
                          <button
                            key={platformKey}
                            type="button"
                            disabled={!ready}
                            className={`ad-chip ${form.platforms.includes(platformKey) ? 'is-selected' : ''}`.trim()}
                            onClick={() => update({ platforms: toggleInList(form.platforms, platformKey) })}
                            title={ready ? undefined : t('adCreate.connectFirst')}
                          >
                            <PlatformIcon platformKey={platformKey} size={20} />
                            {getPlatformByKey(platformKey)?.label}
                            {ready ? null : <span className="ad-chip__note">{t('adCreate.notConnected')}</span>}
                          </button>
                        );
                      })}
                    </div>
                    {network.platforms.some((platformKey) => !isPlacementConnected(platformKey)) ? (
                      <div className="callout-banner callout-banner--warning mt-3 mb-0">
                        <Icon name="AlertTriangle" size={16} />
                        <span>
                          {t('adCreate.mustConnect')}{' '}
                          {network.platforms
                            .filter((platformKey) => !isPlacementConnected(platformKey))
                            .map((platformKey, index) => (
                              <span key={platformKey}>
                                {index > 0 ? ', ' : ''}
                                <Link to={`/social-accounts/connect/${platformKey}`}>{t('adCreate.connectPlatform', { platform: getPlatformByKey(platformKey)?.label })}</Link>
                              </span>
                            ))}
                          . {t('adCreate.connectedSeparately')}
                        </span>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : null}

            {step === 2 ? (
              <>
                <h3 className="h5 mb-1">{t('adCreate.buildTitle')}</h3>
                <p className="text-secondary-custom mb-4">{t('adCreate.buildText')}</p>
                {posts.length > 0 ? (
                  <div className="mb-4">
                    <label htmlFor="adPost" className="form-label-custom">{t('adCreate.usePost')}</label>
                    <select id="adPost" className="form-select" value={form.postId} onChange={(event) => pickPost(event.target.value)}>
                      <option value="">{t('adCreate.ownText')}</option>
                      {posts.map((post) => (
                        <option key={post.id} value={post.id}>{post.content.slice(0, 70)}</option>
                      ))}
                    </select>
                  </div>
                ) : null}

                {form.postId && form.isBoost ? (
                  <div className="callout-banner callout-banner--info mb-4">
                    <Icon name="Megaphone" size={16} />
                    <span>
                      {t('adCreate.boostInfo')}{' '}
                      <button type="button" className="btn btn-link p-0 align-baseline" onClick={() => update({ isBoost: false })}>
                        {t('adCreate.writeSeparate')}
                      </button>
                    </span>
                  </div>
                ) : null}

                {form.isBoost ? (
                  <div className="surface-card mb-2">
                    <div className="form-label-custom mb-2">{t('adCreate.boosting')}</div>
                    <p className="mb-0 text-break">{form.text}</p>
                  </div>
                ) : (
                  <>
                    {form.postId ? (
                      <div className="callout-banner callout-banner--info mb-4">
                        <Icon name="Info" size={16} />
                        <span>
                          {t('adCreate.startingFromPost')}{' '}
                          <button type="button" className="btn btn-link p-0 align-baseline" onClick={() => update({ isBoost: true, variations: [] })}>
                            {t('adCreate.boostInstead')}
                          </button>
                        </span>
                      </div>
                    ) : null}
                    {templates.length > 0 ? (
                      <div className="mb-4">
                        <label htmlFor="adTemplate" className="form-label-custom">{t('adCreate.useTemplate')}</label>
                        <select id="adTemplate" className="form-select" value="" onChange={(event) => pickTemplate(event.target.value)}>
                          <option value="">{t('adCreate.ownText')}</option>
                          {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                        </select>
                      </div>
                    ) : null}
                    <div className="mb-4">
                      <label htmlFor="adText" className="form-label-custom">{t('adCreate.adText')}</label>
                      <textarea id="adText" className="form-control" rows={4} maxLength={500} value={form.text} onChange={(event) => update({ text: event.target.value })} placeholder={t('adCreate.adTextPlaceholder')} />
                      <div className="form-hint">{form.text.length} / 500</div>
                    </div>
                    <div className="form-grid-2">
                      <TextField id="adHeadline" label={t('adCreate.headline')} value={form.headline} onChange={(event) => update({ headline: event.target.value })} maxLength={80} placeholder={t('adCreate.headlinePlaceholder')} />
                      <div className="mb-4">
                        <label htmlFor="adCta" className="form-label-custom">{t('adCreate.button')}</label>
                        <select id="adCta" className="form-select" value={form.cta} onChange={(event) => update({ cta: event.target.value })}>
                          {AD_CTAS.map((cta) => <option key={cta} value={cta}>{cta}</option>)}
                        </select>
                      </div>
                    </div>
                    <TextField
                      id="adUrl"
                      label={t('adCreate.buttonLink')}
                      type="url"
                      value={form.destinationUrl}
                      onChange={(event) => update({ destinationUrl: event.target.value })}
                      placeholder="https://yoursite.com/offer"
                      hint={t('adCreate.buttonLinkHint')}
                    />
                    <button type="button" className="btn btn-link p-0 mb-4" onClick={() => setUtmTarget('primary')}>
                      {t('adCreate.addUtm')}
                    </button>
                    <div className="mb-2">
                      <span className="form-label-custom d-block">{t('adCreate.imageFromLibrary')}</span>
                      <div className="ad-image-grid">
                        <button type="button" className={`ad-image-option ${form.mediaId === '' ? 'is-selected' : ''}`.trim()} onClick={() => update({ mediaId: '' })}>
                          <Icon name="ImageOff" size={20} /> {t('adCreate.none')}
                        </button>
                        {images.slice(0, 8).map((image) => (
                          <button key={image.id} type="button" className={`ad-image-option ${form.mediaId === image.id ? 'is-selected' : ''}`.trim()} onClick={() => update({ mediaId: image.id })} title={image.name}>
                            {image.url ? <img src={image.url} alt={image.name} /> : <Icon name="Image" size={20} />}
                            <span className="ad-image-option__name">{image.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {form.variations.map((variation, index) => (
                      <div key={index} className="surface-card mt-4 mb-0">
                        <div className="d-flex align-items-center justify-content-between mb-3">
                          <div className="form-label-custom mb-0">{t('adCreate.variation', { number: index + 2 })}</div>
                          <button type="button" className="btn btn-sm btn-outline-secondary-custom" onClick={() => removeVariation(index)}>
                            <Icon name="X" size={14} /> {t('common.remove')}
                          </button>
                        </div>
                        {templates.length > 0 ? (
                          <div className="mb-4">
                            <label htmlFor={`variationTemplate-${index}`} className="form-label-custom">{t('adCreate.useTemplate')}</label>
                            <select id={`variationTemplate-${index}`} className="form-select" value="" onChange={(event) => pickVariationTemplate(index, event.target.value)}>
                              <option value="">{t('adCreate.ownText')}</option>
                              {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                            </select>
                          </div>
                        ) : null}
                        <div className="mb-4">
                          <label htmlFor={`variationText-${index}`} className="form-label-custom">{t('adCreate.adText')}</label>
                          <textarea
                            id={`variationText-${index}`}
                            className="form-control"
                            rows={3}
                            maxLength={500}
                            value={variation.text}
                            onChange={(event) => updateVariation(index, { text: event.target.value })}
                            placeholder={t('adCreate.adTextPlaceholder')}
                          />
                        </div>
                        <div className="form-grid-2">
                          <TextField
                            id={`variationHeadline-${index}`}
                            label={t('adCreate.headline')}
                            value={variation.headline}
                            onChange={(event) => updateVariation(index, { headline: event.target.value })}
                            maxLength={80}
                            placeholder={t('adCreate.headlinePlaceholder')}
                          />
                          <div className="mb-4">
                            <label htmlFor={`variationCta-${index}`} className="form-label-custom">{t('adCreate.button')}</label>
                            <select id={`variationCta-${index}`} className="form-select" value={variation.cta} onChange={(event) => updateVariation(index, { cta: event.target.value })}>
                              {AD_CTAS.map((cta) => <option key={cta} value={cta}>{cta}</option>)}
                            </select>
                          </div>
                        </div>
                        <TextField id={`variationUrl-${index}`} label={t('adCreate.buttonLink')} type="url" value={variation.destinationUrl} onChange={(event) => updateVariation(index, { destinationUrl: event.target.value })} placeholder="https://yoursite.com/offer" />
                        <button type="button" className="btn btn-link p-0 mb-4" onClick={() => setUtmTarget(index)}>
                          {t('adCreate.addUtm')}
                        </button>
                        <div className="mb-0">
                          <span className="form-label-custom d-block">{t('adCreate.image')}</span>
                          <div className="ad-image-grid">
                            <button type="button" className={`ad-image-option ${variation.mediaId === '' ? 'is-selected' : ''}`.trim()} onClick={() => updateVariation(index, { mediaId: '' })}>
                              <Icon name="ImageOff" size={20} /> {t('adCreate.none')}
                            </button>
                            {images.slice(0, 8).map((image) => (
                              <button key={image.id} type="button" className={`ad-image-option ${variation.mediaId === image.id ? 'is-selected' : ''}`.trim()} onClick={() => updateVariation(index, { mediaId: image.id })} title={image.name}>
                                {image.url ? <img src={image.url} alt={image.name} /> : <Icon name="Image" size={20} />}
                                <span className="ad-image-option__name">{image.name}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}

                    <div className="mt-4">
                      {form.variations.length + 1 < MAX_AD_VARIATIONS ? (
                        <button type="button" className="btn btn-outline-secondary-custom" onClick={addVariation}>
                          <Icon name="Plus" size={16} /> {t('adCreate.addVariation')}
                        </button>
                      ) : null}
                      {form.variations.length > 0 ? (
                        <p className="form-hint mt-2 mb-0">{t('adCreate.variationsHint', { count: form.variations.length + 1, max: MAX_AD_VARIATIONS })}</p>
                      ) : null}
                    </div>
                  </>
                )}
              </>
            ) : null}

            {step === 3 ? (
              <>
                <h3 className="h5 mb-1">{t('adCreate.audienceTitle')}</h3>
                <p className="text-secondary-custom mb-4">{t('adCreate.audienceText')}</p>
                <span className="form-label-custom d-block">{t('adCreate.locations')}</span>
                <div className="ad-chip-row mb-4">
                  {AD_LOCATIONS.map((location) => (
                    <button key={location} type="button" className={`ad-chip ${form.locations.includes(location) ? 'is-selected' : ''}`.trim()} onClick={() => update({ locations: toggleInList(form.locations, location) })}>{location}</button>
                  ))}
                </div>
                <div className="form-grid-2">
                  <div className="mb-4">
                    <label htmlFor="adAgeMin" className="form-label-custom">{t('adCreate.ageFrom')}</label>
                    <select id="adAgeMin" className="form-select" value={form.ageMin} onChange={(event) => update({ ageMin: Number(event.target.value) })}>
                      {Array.from({ length: 48 }, (_, index) => 18 + index).map((age) => <option key={age} value={age}>{age}</option>)}
                    </select>
                  </div>
                  <div className="mb-4">
                    <label htmlFor="adAgeMax" className="form-label-custom">{t('adCreate.ageTo')}</label>
                    <select id="adAgeMax" className="form-select" value={form.ageMax} onChange={(event) => update({ ageMax: Number(event.target.value) })}>
                      {Array.from({ length: 48 }, (_, index) => 18 + index).map((age) => <option key={age} value={age}>{age}{age === 65 ? '+' : ''}</option>)}
                    </select>
                  </div>
                </div>
                <span className="form-label-custom d-block">{t('adCreate.gender')}</span>
                <div className="ad-chip-row mb-4">
                  {['all', 'women', 'men'].map((value) => (
                    <button key={value} type="button" className={`ad-chip ${form.gender === value ? 'is-selected' : ''}`.trim()} onClick={() => update({ gender: value })}>
                      {t(`adCreate.genders.${value}`)}
                    </button>
                  ))}
                </div>
                <span className="form-label-custom d-block">{t('adCreate.interests')}</span>
                <div className="ad-chip-row">
                  {AD_INTERESTS.map((interest) => (
                    <button key={interest} type="button" className={`ad-chip ${form.interests.includes(interest) ? 'is-selected' : ''}`.trim()} onClick={() => update({ interests: toggleInList(form.interests, interest) })}>{interest}</button>
                  ))}
                </div>
              </>
            ) : null}

            {step === 4 ? (
              <>
                <h3 className="h5 mb-1">{t('adCreate.budgetTitle')}</h3>
                <p className="text-secondary-custom mb-4">{t('adCreate.budgetText')}</p>
                <span className="form-label-custom d-block">{t('adCreate.budgetType')}</span>
                <div className="ad-chip-row mb-4">
                  {['daily', 'lifetime'].map((value) => (
                    <button key={value} type="button" className={`ad-chip ${form.budgetType === value ? 'is-selected' : ''}`.trim()} onClick={() => update({ budgetType: value })}>
                      {t(`adCreate.budgetTypes.${value}`)}
                    </button>
                  ))}
                </div>
                <div className="form-grid-2">
                  <TextField
                    id="adBudget"
                    label={form.budgetType === 'daily' ? t('adCreate.amountPerDay') : t('adCreate.totalAmount')}
                    type="number"
                    min="100"
                    value={form.budget}
                    onChange={(event) => update({ budget: event.target.value })}
                  />
                  <div className="mb-4">
                    <span className="form-label-custom d-block">{t('adCreate.totalForDays', { days })}</span>
                    <div className="ad-total">{formatCurrency(totalBudget)}</div>
                  </div>
                </div>
                <div className="form-grid-2">
                  <DatePickerField id="adStart" label={t('adCreate.startDate')} selected={fromIso(form.startDate)} onChange={(date) => date && update({ startDate: toIso(date), endDate: fromIso(form.endDate) < date ? toIso(date) : form.endDate })} />
                  <DatePickerField id="adEnd" label={t('adCreate.endDate')} selected={fromIso(form.endDate)} minDate={fromIso(form.startDate)} onChange={(date) => date && update({ endDate: toIso(date) })} />
                </div>
              </>
            ) : null}

            {step === 5 ? (
              <>
                <h3 className="h5 mb-1">{t('adCreate.reviewTitle')}</h3>
                <p className="text-secondary-custom mb-4">{t('adCreate.reviewText')}</p>
                <TextField
                  id="adName"
                  label={t('adCreate.adName')}
                  value={form.name}
                  onChange={(event) => update({ name: event.target.value })}
                  placeholder={form.headline || t('adCreate.adNamePlaceholder')}
                />
                <dl className="ad-review">
                  <dt>{t('adCreate.review.goal')}</dt>
                  <dd>{t(`ads.objectives.${AD_OBJECTIVES.find((item) => item.key === form.objective)?.labelKey}`)}</dd>
                  <dt>{t('adCreate.review.runsOn')}</dt>
                  <dd>
                    {selectedAccount?.name} ({network?.label}) — {form.platforms.map((key) => getPlatformByKey(key)?.label).join(', ')}
                  </dd>
                  <dt>{t('adCreate.review.audience')}</dt>
                  <dd>
                    {form.locations.join(', ')} · {form.ageMin}–{form.ageMax} · {form.gender === 'all' ? t('adCreate.allGenders') : t(`adCreate.genders.${form.gender}`)}
                    {form.interests.length ? ` · ${form.interests.join(', ')}` : ''}
                  </dd>
                  <dt>{t('adCreate.review.budget')}</dt>
                  <dd>
                    {t(form.budgetType === 'daily' ? 'adCreate.budgetPerDay' : 'adCreate.budgetLifetime', { amount: formatCurrency(form.budget) })}{' '}
                    ({t('adCreate.budgetOver', { total: formatCurrency(totalBudget), days })})
                  </dd>
                  <dt>{t('adCreate.review.schedule')}</dt>
                  <dd>{t('adCreate.scheduleRange', { start: form.startDate, end: form.endDate })}</dd>
                  {form.isBoost ? (
                    <>
                      <dt>{t('adCreate.review.creative')}</dt>
                      <dd>{t('adCreate.boostingCreative')}</dd>
                    </>
                  ) : form.variations.length > 0 ? (
                    <>
                      <dt>{t('adCreate.review.creative')}</dt>
                      <dd>
                        {t('adCreate.variationsSummary', { count: form.variations.length + 1 })}
                        <ul className="mb-0 ps-3">
                          <li>{form.headline || `(${t('adCreate.untitled')})`}</li>
                          {form.variations.map((variation, index) => (
                            <li key={index}>{variation.headline || `(${t('adCreate.untitled')})`}</li>
                          ))}
                        </ul>
                      </dd>
                    </>
                  ) : (
                    <>
                      <dt>{t('adCreate.review.buttonLink')}</dt>
                      <dd className="text-break">{form.destinationUrl}</dd>
                    </>
                  )}
                </dl>
                <div className="callout-banner callout-banner--info mb-0">
                  <Icon name="Wallet" size={16} />
                  <span>{t('adCreate.billing', { network: network?.label ?? '', total: formatCurrency(totalBudget) })}</span>
                </div>
              </>
            ) : null}
          </div>

          <div className="ad-create-footer">
            <button type="button" className="btn btn-outline-secondary-custom" onClick={goBack} disabled={step === 0 || isLaunching}>
              <Icon name="ChevronLeft" size={16} /> {t('billing.invoicePage.back')}
            </button>
            <div className="d-flex gap-2 flex-wrap justify-content-end">
              <button type="button" className="btn btn-outline-secondary-custom" onClick={() => launch(true)} disabled={isLaunching}>
                {t('adCreate.saveDraft')}
              </button>
              {step < STEPS.length - 1 ? (
                <button type="button" className="btn btn-primary" onClick={goNext}>
                  {t('adCreate.next')} <Icon name="ChevronRight" size={16} />
                </button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={() => launch(false)} disabled={isLaunching}>
                  <Icon name="Rocket" size={16} /> {isLaunching ? t('adCreate.launching') : t('adCreate.launch')}
                </button>
              )}
            </div>
          </div>
        </div>

        <aside className="ad-create-side">
          <div className="panel-card">
            <div className="panel-card__header"><h3 className="panel-card__title">{t('adCreate.preview')}</h3></div>
            <div className="panel-card__body">
              <AdPreview creative={{ headline: form.headline, text: form.text, cta: form.cta, destinationUrl: form.destinationUrl }} platformKey={form.platforms[0]} imageUrl={selectedImage?.url} />
            </div>
          </div>
          <div className="panel-card">
            <div className="panel-card__header"><h3 className="panel-card__title">{t('adCreate.estimate')}</h3></div>
            <div className="panel-card__body">
              <div className="ad-estimate">
                <div><span>{t('ads.ruleMetrics.impressions')}</span><strong>{formatCompactNumber(estimate.impressionsLow)} – {formatCompactNumber(estimate.impressionsHigh)}</strong></div>
                <div><span>{t('ads.ruleMetrics.clicks')}</span><strong>{formatCompactNumber(estimate.clicksLow)} – {formatCompactNumber(estimate.clicksHigh)}</strong></div>
              </div>
              <p className="form-hint mb-0 mt-3">{t('adCreate.estimateHint')}</p>
            </div>
          </div>
        </aside>
      </div>

      <UtmBuilderModal isOpen={utmTarget !== null} onClose={() => setUtmTarget(null)} onApply={applyUtmUrl} initialUrl={utmInitialUrl} />
    </div>
  );
}

export default CreateAd;
