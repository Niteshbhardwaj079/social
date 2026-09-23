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

const STEPS = ['Objective', 'Where', 'Ad', 'Audience', 'Budget', 'Review'];
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
    if (!form.adAccountId) list[1].push('Choose an ad account to run on.');
    else if (form.platforms.length === 0) {
      const anyConnected = network?.platforms.some(isPlacementConnected);
      list[1].push(
        anyConnected
          ? 'Pick at least one platform to show the ad on.'
          : 'None of this account’s platforms is connected in Social Accounts yet — connect one first (see below).'
      );
    }
    if (!form.isBoost) {
      if (!form.text.trim()) list[2].push('Write the ad text.');
      if (!form.headline.trim()) list[2].push('Add a headline.');
      if (!/^https?:\/\/\S+\.\S+/i.test(form.destinationUrl.trim())) list[2].push('Enter the full link people should go to (starting with https://).');
      const incompleteVariation = form.variations.some(
        (variation) => !variation.text.trim() || !variation.headline.trim() || !/^https?:\/\/\S+\.\S+/i.test(variation.destinationUrl.trim())
      );
      if (incompleteVariation) list[2].push('Fill in the text, headline and link for every variation, or remove the incomplete one.');
    }
    if (form.locations.length === 0) list[3].push('Pick at least one location.');
    if (form.ageMin > form.ageMax) list[3].push('The minimum age must not be above the maximum age.');
    if (!(Number(form.budget) >= 100)) list[4].push('The budget must be at least ₹100.');
    if (fromIso(form.endDate) < fromIso(form.startDate)) list[4].push('The end date must be on or after the start date.');
    return list;
  }, [form]);

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
      name: form.name.trim() || form.headline.trim() || (form.isBoost ? 'Boosted post' : 'Untitled ad'),
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
          title: asDraft ? 'Saved as draft' : 'Ad submitted',
          message: isBulk
            ? `${count} ad variations ${asDraft ? 'saved' : 'submitted — the platform will review them, usually within 24 hours'}.`
            : asDraft
              ? result.name
              : 'The platform will review it, usually within 24 hours.',
        });
        navigate(isBulk ? '/ads' : `/ads/${result.id}`);
      })
      .catch((error) => {
        setIsLaunching(false);
        showToast({ type: 'error', title: apiErrorMessage(error, 'The ad could not be launched.') });
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
      <Breadcrumb items={[{ label: 'Ads', to: '/ads' }, { label: 'Create ad' }]} />
      <PageHeader title="Create an ad" subtitle="Six quick steps. You pay the ad platform directly — Social never touches your ad budget." guideChapterId="ads" />

      <ol className="ad-stepper" aria-label="Steps">
        {STEPS.map((label, index) => (
          <li key={label} className={`ad-stepper__item ${index === step ? 'is-active' : ''} ${index < step ? 'is-done' : ''}`.trim()}>
            <button type="button" onClick={() => index <= step && setStep(index)} disabled={index > step}>
              <span className="ad-stepper__number">{index < step ? <Icon name="Check" size={14} /> : index + 1}</span>
              <span className="ad-stepper__label">{label}</span>
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
                <h3 className="h5 mb-1">What do you want from this ad?</h3>
                <p className="text-secondary-custom mb-4">Pick the main goal. It decides how the platform shows your ad.</p>
                <div className="ad-choice-grid">
                  {AD_OBJECTIVES.map((objective) => (
                    <button key={objective.key} type="button" className={`ad-choice ${form.objective === objective.key ? 'is-selected' : ''}`.trim()} onClick={() => update({ objective: objective.key })}>
                      <span className="ad-choice__icon"><Icon name={objective.icon} size={20} /></span>
                      <span>
                        <strong>{objective.label}</strong>
                        <span className="ad-choice__text">{objective.description}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            {step === 1 ? (
              <>
                <h3 className="h5 mb-1">Where should it run?</h3>
                <p className="text-secondary-custom mb-4">Pick one of your real ad accounts, discovered from your Facebook connection.</p>
                {accounts.length === 0 ? (
                  <Link to="/ads?tab=accounts" className="ad-choice is-locked">
                    <NetworkIcons network={{ platforms: ['facebook', 'instagram'], subtitle: 'Facebook & Instagram' }} size={40} />
                    <span>
                      <strong>No ad accounts found</strong>
                      <span className="ad-choice__text">Set up Ad accounts first</span>
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
                    <span className="form-label-custom d-block">Show the ad on</span>
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
                            title={ready ? undefined : 'Connect this account in Social Accounts first'}
                          >
                            <PlatformIcon platformKey={platformKey} size={20} />
                            {getPlatformByKey(platformKey)?.label}
                            {ready ? null : <span className="ad-chip__note">not connected</span>}
                          </button>
                        );
                      })}
                    </div>
                    {network.platforms.some((platformKey) => !isPlacementConnected(platformKey)) ? (
                      <div className="callout-banner callout-banner--warning mt-3 mb-0">
                        <Icon name="AlertTriangle" size={16} />
                        <span>
                          An ad appears <em>as</em> your social profile, so each platform must be connected in Social Accounts first:{' '}
                          {network.platforms
                            .filter((platformKey) => !isPlacementConnected(platformKey))
                            .map((platformKey, index) => (
                              <span key={platformKey}>
                                {index > 0 ? ', ' : ''}
                                <Link to={`/social-accounts/connect/${platformKey}`}>Connect {getPlatformByKey(platformKey)?.label}</Link>
                              </span>
                            ))}
                          . Facebook and Instagram are connected separately, so you can advertise on just the one you have.
                        </span>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : null}

            {step === 2 ? (
              <>
                <h3 className="h5 mb-1">Build the ad</h3>
                <p className="text-secondary-custom mb-4">Start from a post you already made, or write it fresh.</p>
                {posts.length > 0 ? (
                  <div className="mb-4">
                    <label htmlFor="adPost" className="form-label-custom">Use an existing post (optional)</label>
                    <select id="adPost" className="form-select" value={form.postId} onChange={(event) => pickPost(event.target.value)}>
                      <option value="">Write my own text</option>
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
                      This post is already live on your connected Facebook Page — Social can <strong>boost it directly</strong>, using its real text, image and existing
                      likes/comments, exactly like Facebook’s own “Boost Post” button. No separate headline, button or link needed.{' '}
                      <button type="button" className="btn btn-link p-0 align-baseline" onClick={() => update({ isBoost: false })}>
                        Write a separate ad instead
                      </button>
                    </span>
                  </div>
                ) : null}

                {form.isBoost ? (
                  <div className="surface-card mb-2">
                    <div className="form-label-custom mb-2">What you’re boosting</div>
                    <p className="mb-0 text-break">{form.text}</p>
                  </div>
                ) : (
                  <>
                    {form.postId ? (
                      <div className="callout-banner callout-banner--info mb-4">
                        <Icon name="Info" size={16} />
                        <span>
                          Starting from this post’s text and image — edit anything below, or{' '}
                          <button type="button" className="btn btn-link p-0 align-baseline" onClick={() => update({ isBoost: true, variations: [] })}>
                            boost the real post instead
                          </button>{' '}
                          if it’s already live on Facebook.
                        </span>
                      </div>
                    ) : null}
                    {templates.length > 0 ? (
                      <div className="mb-4">
                        <label htmlFor="adTemplate" className="form-label-custom">Start from a saved template (optional)</label>
                        <select id="adTemplate" className="form-select" value="" onChange={(event) => pickTemplate(event.target.value)}>
                          <option value="">Write my own text</option>
                          {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                        </select>
                      </div>
                    ) : null}
                    <div className="mb-4">
                      <label htmlFor="adText" className="form-label-custom">Ad text</label>
                      <textarea id="adText" className="form-control" rows={4} maxLength={500} value={form.text} onChange={(event) => update({ text: event.target.value })} placeholder="What do you want people to know?" />
                      <div className="form-hint">{form.text.length} / 500</div>
                    </div>
                    <div className="form-grid-2">
                      <TextField id="adHeadline" label="Headline" value={form.headline} onChange={(event) => update({ headline: event.target.value })} maxLength={80} placeholder="Short and clear" />
                      <div className="mb-4">
                        <label htmlFor="adCta" className="form-label-custom">Button</label>
                        <select id="adCta" className="form-select" value={form.cta} onChange={(event) => update({ cta: event.target.value })}>
                          {AD_CTAS.map((cta) => <option key={cta} value={cta}>{cta}</option>)}
                        </select>
                      </div>
                    </div>
                    <TextField id="adUrl" label="Where should the button go?" type="url" value={form.destinationUrl} onChange={(event) => update({ destinationUrl: event.target.value })} placeholder="https://yoursite.com/offer" hint="Tip: paste a short link from the Link Shortener to see how many clicks come from this ad." />
                    <div className="mb-2">
                      <span className="form-label-custom d-block">Image (from your Media Library)</span>
                      <div className="ad-image-grid">
                        <button type="button" className={`ad-image-option ${form.mediaId === '' ? 'is-selected' : ''}`.trim()} onClick={() => update({ mediaId: '' })}>
                          <Icon name="ImageOff" size={20} /> None
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
                          <div className="form-label-custom mb-0">Variation {index + 2}</div>
                          <button type="button" className="btn btn-sm btn-outline-secondary-custom" onClick={() => removeVariation(index)}>
                            <Icon name="X" size={14} /> Remove
                          </button>
                        </div>
                        {templates.length > 0 ? (
                          <div className="mb-4">
                            <label htmlFor={`variationTemplate-${index}`} className="form-label-custom">Start from a saved template (optional)</label>
                            <select id={`variationTemplate-${index}`} className="form-select" value="" onChange={(event) => pickVariationTemplate(index, event.target.value)}>
                              <option value="">Write my own text</option>
                              {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                            </select>
                          </div>
                        ) : null}
                        <div className="mb-4">
                          <label htmlFor={`variationText-${index}`} className="form-label-custom">Ad text</label>
                          <textarea id={`variationText-${index}`} className="form-control" rows={3} maxLength={500} value={variation.text} onChange={(event) => updateVariation(index, { text: event.target.value })} placeholder="What do you want people to know?" />
                        </div>
                        <div className="form-grid-2">
                          <TextField id={`variationHeadline-${index}`} label="Headline" value={variation.headline} onChange={(event) => updateVariation(index, { headline: event.target.value })} maxLength={80} placeholder="Short and clear" />
                          <div className="mb-4">
                            <label htmlFor={`variationCta-${index}`} className="form-label-custom">Button</label>
                            <select id={`variationCta-${index}`} className="form-select" value={variation.cta} onChange={(event) => updateVariation(index, { cta: event.target.value })}>
                              {AD_CTAS.map((cta) => <option key={cta} value={cta}>{cta}</option>)}
                            </select>
                          </div>
                        </div>
                        <TextField id={`variationUrl-${index}`} label="Where should the button go?" type="url" value={variation.destinationUrl} onChange={(event) => updateVariation(index, { destinationUrl: event.target.value })} placeholder="https://yoursite.com/offer" />
                        <div className="mb-0">
                          <span className="form-label-custom d-block">Image</span>
                          <div className="ad-image-grid">
                            <button type="button" className={`ad-image-option ${variation.mediaId === '' ? 'is-selected' : ''}`.trim()} onClick={() => updateVariation(index, { mediaId: '' })}>
                              <Icon name="ImageOff" size={20} /> None
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
                          <Icon name="Plus" size={16} /> Add another variation
                        </button>
                      ) : null}
                      {form.variations.length > 0 ? (
                        <p className="form-hint mt-2 mb-0">
                          Creating {form.variations.length + 1} ad variations, testing different headlines/images — all sharing this same audience, budget and schedule (up to {MAX_AD_VARIATIONS} at a time).
                        </p>
                      ) : null}
                    </div>
                  </>
                )}
              </>
            ) : null}

            {step === 3 ? (
              <>
                <h3 className="h5 mb-1">Who should see it?</h3>
                <p className="text-secondary-custom mb-4">Leave interests empty to show it to a broad audience.</p>
                <span className="form-label-custom d-block">Locations</span>
                <div className="ad-chip-row mb-4">
                  {AD_LOCATIONS.map((location) => (
                    <button key={location} type="button" className={`ad-chip ${form.locations.includes(location) ? 'is-selected' : ''}`.trim()} onClick={() => update({ locations: toggleInList(form.locations, location) })}>{location}</button>
                  ))}
                </div>
                <div className="form-grid-2">
                  <div className="mb-4">
                    <label htmlFor="adAgeMin" className="form-label-custom">Age from</label>
                    <select id="adAgeMin" className="form-select" value={form.ageMin} onChange={(event) => update({ ageMin: Number(event.target.value) })}>
                      {Array.from({ length: 48 }, (_, index) => 18 + index).map((age) => <option key={age} value={age}>{age}</option>)}
                    </select>
                  </div>
                  <div className="mb-4">
                    <label htmlFor="adAgeMax" className="form-label-custom">Age to</label>
                    <select id="adAgeMax" className="form-select" value={form.ageMax} onChange={(event) => update({ ageMax: Number(event.target.value) })}>
                      {Array.from({ length: 48 }, (_, index) => 18 + index).map((age) => <option key={age} value={age}>{age}{age === 65 ? '+' : ''}</option>)}
                    </select>
                  </div>
                </div>
                <span className="form-label-custom d-block">Gender</span>
                <div className="ad-chip-row mb-4">
                  {[['all', 'All'], ['women', 'Women'], ['men', 'Men']].map(([value, label]) => (
                    <button key={value} type="button" className={`ad-chip ${form.gender === value ? 'is-selected' : ''}`.trim()} onClick={() => update({ gender: value })}>{label}</button>
                  ))}
                </div>
                <span className="form-label-custom d-block">Interests</span>
                <div className="ad-chip-row">
                  {AD_INTERESTS.map((interest) => (
                    <button key={interest} type="button" className={`ad-chip ${form.interests.includes(interest) ? 'is-selected' : ''}`.trim()} onClick={() => update({ interests: toggleInList(form.interests, interest) })}>{interest}</button>
                  ))}
                </div>
              </>
            ) : null}

            {step === 4 ? (
              <>
                <h3 className="h5 mb-1">Budget and schedule</h3>
                <p className="text-secondary-custom mb-4">This is the most you will spend. The platform bills you directly and never goes over it.</p>
                <span className="form-label-custom d-block">Budget type</span>
                <div className="ad-chip-row mb-4">
                  {[['daily', 'Daily budget'], ['lifetime', 'Lifetime budget']].map(([value, label]) => (
                    <button key={value} type="button" className={`ad-chip ${form.budgetType === value ? 'is-selected' : ''}`.trim()} onClick={() => update({ budgetType: value })}>{label}</button>
                  ))}
                </div>
                <div className="form-grid-2">
                  <TextField id="adBudget" label={form.budgetType === 'daily' ? 'Amount per day (₹)' : 'Total amount (₹)'} type="number" min="100" value={form.budget} onChange={(event) => update({ budget: event.target.value })} />
                  <div className="mb-4">
                    <span className="form-label-custom d-block">Total for {days} {days === 1 ? 'day' : 'days'}</span>
                    <div className="ad-total">{formatCurrency(totalBudget)}</div>
                  </div>
                </div>
                <div className="form-grid-2">
                  <DatePickerField id="adStart" label="Start date" selected={fromIso(form.startDate)} onChange={(date) => date && update({ startDate: toIso(date), endDate: fromIso(form.endDate) < date ? toIso(date) : form.endDate })} />
                  <DatePickerField id="adEnd" label="End date" selected={fromIso(form.endDate)} minDate={fromIso(form.startDate)} onChange={(date) => date && update({ endDate: toIso(date) })} />
                </div>
              </>
            ) : null}

            {step === 5 ? (
              <>
                <h3 className="h5 mb-1">Review and launch</h3>
                <p className="text-secondary-custom mb-4">Check everything, then launch. The platform reviews new ads before they run.</p>
                <TextField id="adName" label="Ad name (only you see this)" value={form.name} onChange={(event) => update({ name: event.target.value })} placeholder={form.headline || 'e.g. Diwali offer'} />
                <dl className="ad-review">
                  <dt>Goal</dt><dd>{AD_OBJECTIVES.find((item) => item.key === form.objective)?.label}</dd>
                  <dt>Runs on</dt><dd>{selectedAccount?.name} ({network?.label}) — {form.platforms.map((key) => getPlatformByKey(key)?.label).join(', ')}</dd>
                  <dt>Audience</dt><dd>{form.locations.join(', ')} · {form.ageMin}–{form.ageMax} · {form.gender === 'all' ? 'All genders' : form.gender}{form.interests.length ? ` · ${form.interests.join(', ')}` : ''}</dd>
                  <dt>Budget</dt><dd>{formatCurrency(form.budget)} {form.budgetType === 'daily' ? 'per day' : 'lifetime'} ({formatCurrency(totalBudget)} over {days} {days === 1 ? 'day' : 'days'})</dd>
                  <dt>Schedule</dt><dd>{form.startDate} to {form.endDate}</dd>
                  {form.isBoost ? (
                    <>
                      <dt>Creative</dt><dd>Boosting your existing Facebook post directly — its real text, image and engagement.</dd>
                    </>
                  ) : form.variations.length > 0 ? (
                    <>
                      <dt>Creative</dt>
                      <dd>
                        {form.variations.length + 1} variations, one ad each, sharing this audience/budget/schedule:
                        <ul className="mb-0 ps-3">
                          <li>{form.headline || '(untitled)'}</li>
                          {form.variations.map((variation, index) => <li key={index}>{variation.headline || '(untitled)'}</li>)}
                        </ul>
                      </dd>
                    </>
                  ) : (
                    <>
                      <dt>Button link</dt><dd className="text-break">{form.destinationUrl}</dd>
                    </>
                  )}
                </dl>
                <div className="callout-banner callout-banner--info mb-0">
                  <Icon name="Wallet" size={16} />
                  <span>{network?.label} bills up to <strong>{formatCurrency(totalBudget)}</strong> to the payment method on your ad account. Social does not charge anything for running ads.</span>
                </div>
              </>
            ) : null}
          </div>

          <div className="ad-create-footer">
            <button type="button" className="btn btn-outline-secondary-custom" onClick={goBack} disabled={step === 0 || isLaunching}>
              <Icon name="ChevronLeft" size={16} /> Back
            </button>
            <div className="d-flex gap-2 flex-wrap justify-content-end">
              <button type="button" className="btn btn-outline-secondary-custom" onClick={() => launch(true)} disabled={isLaunching}>Save as draft</button>
              {step < STEPS.length - 1 ? (
                <button type="button" className="btn btn-primary" onClick={goNext}>Next <Icon name="ChevronRight" size={16} /></button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={() => launch(false)} disabled={isLaunching}>
                  <Icon name="Rocket" size={16} /> {isLaunching ? 'Launching...' : 'Launch ad'}
                </button>
              )}
            </div>
          </div>
        </div>

        <aside className="ad-create-side">
          <div className="panel-card">
            <div className="panel-card__header"><h3 className="panel-card__title">Preview</h3></div>
            <div className="panel-card__body">
              <AdPreview creative={{ headline: form.headline, text: form.text, cta: form.cta, destinationUrl: form.destinationUrl }} platformKey={form.platforms[0]} imageUrl={selectedImage?.url} />
            </div>
          </div>
          <div className="panel-card">
            <div className="panel-card__header"><h3 className="panel-card__title">Estimated results</h3></div>
            <div className="panel-card__body">
              <div className="ad-estimate">
                <div><span>Impressions</span><strong>{formatCompactNumber(estimate.impressionsLow)} – {formatCompactNumber(estimate.impressionsHigh)}</strong></div>
                <div><span>Clicks</span><strong>{formatCompactNumber(estimate.clicksLow)} – {formatCompactNumber(estimate.clicksHigh)}</strong></div>
              </div>
              <p className="form-hint mb-0 mt-3">Only a rough guide from your budget. Real results depend on the platform, your audience and your ad.</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default CreateAd;
