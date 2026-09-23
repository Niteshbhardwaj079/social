import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import Icon from './Icon';
import TextField from '../forms/TextField';
import { buildUtmUrl, parseUtmParams, stripUtmParams, UTM_MEDIUMS, UTM_SOURCES } from '../../utils/utm';
import { copyToClipboard } from '../../utils/clipboard';
import { useToast } from './ToastProvider';

const CUSTOM = '__custom__';

/** A `<select>` of presets, falling back to a free-text field when "Custom" is chosen (a UTM value is never actually restricted to the preset list — it's just a convenience). */
function PresetField({ id, label, value, presets, onChange }) {
  const isCustom = value !== '' && !presets.includes(value);
  return (
    <div className="mb-4">
      <label htmlFor={id} className="form-label-custom">{label}</label>
      <select
        id={id}
        className="form-select mb-2"
        value={isCustom ? CUSTOM : value}
        // Picking "Custom..." with nothing typed yet needs a non-empty value so `isCustom` (derived
        // straight from props, not local state — safe across the parent's own prefill effect timing)
        // keeps the text input open instead of collapsing back to "Choose one"; a lone space trims
        // away to nothing everywhere this value is actually used (buildUtmUrl, canApply).
        onChange={(event) => onChange(event.target.value === CUSTOM ? ' ' : event.target.value)}
      >
        <option value="">Choose one</option>
        {presets.map((preset) => <option key={preset} value={preset}>{preset}</option>)}
        <option value={CUSTOM}>Custom...</option>
      </select>
      {isCustom ? <input type="text" className="form-control" value={value.trim()} onChange={(event) => onChange(event.target.value)} placeholder={`Your own ${label.toLowerCase()}`} /> : null}
    </div>
  );
}

/**
 * Builds a campaign-tracked (UTM) version of a URL — source, medium and campaign are the three Google
 * Analytics treats as a complete link (matches ga's own convention); term/content are optional, for
 * paid-search keywords or A/B-testing which exact creative someone clicked. Purely a URL utility — no
 * backend call, so this can open from anywhere a destination URL is authored.
 */
function UtmBuilderModal({ isOpen, onClose, onApply, initialUrl = '' }) {
  const { showToast } = useToast();
  const [baseUrl, setBaseUrl] = useState('');
  const [source, setSource] = useState('');
  const [medium, setMedium] = useState('');
  const [campaign, setCampaign] = useState('');
  const [term, setTerm] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setBaseUrl(stripUtmParams(initialUrl));
    const parsed = parseUtmParams(initialUrl);
    setSource(parsed.source);
    setMedium(parsed.medium);
    setCampaign(parsed.campaign);
    setTerm(parsed.term);
    setContent(parsed.content);
  }, [isOpen, initialUrl]);

  const taggedUrl = useMemo(
    () => buildUtmUrl(baseUrl, { source: source.trim(), medium: medium.trim(), campaign, term, content }),
    [baseUrl, source, medium, campaign, term, content]
  );
  const canApply = Boolean(taggedUrl && source.trim() && medium.trim() && campaign.trim());

  function handleCopy() {
    if (!taggedUrl) return;
    copyToClipboard(taggedUrl).then((copied) => showToast(copied ? { type: 'success', title: 'Copied to clipboard' } : { type: 'error', title: 'Could not copy' }));
  }

  function handleApply(event) {
    event.preventDefault();
    if (!canApply) return;
    onApply(taggedUrl);
  }

  const footer = (
    <>
      <button type="button" className="btn btn-outline-secondary-custom" onClick={onClose}>
        Cancel
      </button>
      <button type="submit" form="utm-builder-form" className="btn btn-primary" disabled={!canApply}>
        Use This Link
      </button>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Build a Campaign Link (UTM)" footer={footer} size="lg">
      <form id="utm-builder-form" onSubmit={handleApply}>
        <TextField id="utmBaseUrl" label="Website URL" type="url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://yoursite.com/offer" required />
        <div className="form-grid-2">
          <PresetField id="utmSource" label="Campaign Source" value={source} presets={UTM_SOURCES} onChange={setSource} />
          <PresetField id="utmMedium" label="Campaign Medium" value={medium} presets={UTM_MEDIUMS} onChange={setMedium} />
        </div>
        <TextField id="utmCampaign" label="Campaign Name" value={campaign} onChange={(event) => setCampaign(event.target.value)} placeholder="e.g. diwali-sale-2026" required />
        <div className="form-grid-2">
          <TextField id="utmTerm" label="Campaign Term (optional)" value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Paid search keyword" />
          <TextField id="utmContent" label="Campaign Content (optional)" value={content} onChange={(event) => setContent(event.target.value)} placeholder="Which ad/link variant" />
        </div>
        <div className="mb-0">
          <span className="form-label-custom d-block">Resulting link</span>
          <div className="d-flex gap-2 align-items-start">
            <code className="utm-preview flex-grow-1">{taggedUrl || 'Fill in the website URL, source, medium and campaign name above.'}</code>
            <button type="button" className="btn btn-icon-sm btn-outline-secondary-custom" onClick={handleCopy} disabled={!taggedUrl} aria-label="Copy link">
              <Icon name="Copy" size={14} />
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default UtmBuilderModal;
