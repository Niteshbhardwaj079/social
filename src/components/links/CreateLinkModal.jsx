import { useState } from 'react';
import Modal from '../common/Modal';
import TextField from '../forms/TextField';
import brand from '../../config/brand';

const EMPTY_FORM_VALUES = { destinationUrl: '', customSlug: '', label: '' };

function CreateLinkModal({ isOpen, onClose, onSubmit }) {
  const [formValues, setFormValues] = useState(EMPTY_FORM_VALUES);

  function handleChange(field, value) {
    setFormValues((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit(formValues);
    setFormValues(EMPTY_FORM_VALUES);
  }

  const footer = (
    <>
      <button type="button" className="btn btn-outline-secondary-custom" onClick={onClose}>
        Cancel
      </button>
      <button type="submit" form="create-link-form" className="btn btn-primary" disabled={!formValues.destinationUrl.trim()}>
        Create Link
      </button>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Link" footer={footer}>
      <form id="create-link-form" onSubmit={handleSubmit}>
        <TextField
          id="destinationUrl"
          label="Destination URL"
          type="url"
          placeholder="https://example.com/your-page"
          value={formValues.destinationUrl}
          onChange={(event) => handleChange('destinationUrl', event.target.value)}
          required
        />
        <TextField
          id="linkLabel"
          label="Label"
          placeholder="Diwali Festive Offer"
          hint="Shown in your links list — not part of the short URL itself."
          value={formValues.label}
          onChange={(event) => handleChange('label', event.target.value)}
        />
        <div className="mb-0">
          <label htmlFor="customSlug" className="form-label-custom">
            Custom short link (optional)
          </label>
          <div className="link-slug-input">
            <span className="link-slug-input__prefix">{brand.website}/l/</span>
            <input
              id="customSlug"
              type="text"
              className="form-control"
              placeholder="auto-generated"
              value={formValues.customSlug}
              onChange={(event) => handleChange('customSlug', event.target.value)}
            />
          </div>
          <p className="form-hint mb-0">
            On your own domain — no third-party shortener, so this never costs anything as traffic grows.
          </p>
        </div>
      </form>
    </Modal>
  );
}

export default CreateLinkModal;
