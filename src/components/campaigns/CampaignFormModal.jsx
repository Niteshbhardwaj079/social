import { useState } from 'react';
import Modal from '../common/Modal';
import PlatformSelector from '../posts/PlatformSelector';
import TextField from '../../components/forms/TextField';
import DatePickerField from '../../components/forms/DatePickerField';
import { PLATFORMS } from '../../config/platforms';
import { CAMPAIGN_STATUS } from '../../config/constants';

const CAMPAIGN_OBJECTIVES = ['Awareness', 'Engagement', 'Conversions', 'Traffic'];

const EMPTY_FORM_VALUES = {
  name: '',
  description: '',
  objective: CAMPAIGN_OBJECTIVES[0],
  startDate: null,
  endDate: null,
};

function toDateOnlyString(date) {
  return date ? date.toISOString().slice(0, 10) : null;
}

// `ownerName` is the signed-in person, shown for the mock's own display (API mode always uses the
// real, signed-in creator — the server ignores whatever this sends and derives it from the token).
function CampaignFormModal({ isOpen, onClose, onSubmit, ownerName }) {
  const [formValues, setFormValues] = useState(EMPTY_FORM_VALUES);
  const [selectedPlatforms, setSelectedPlatforms] = useState([]);

  function handleChange(field, value) {
    setFormValues((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit({
      ...formValues,
      startDate: toDateOnlyString(formValues.startDate),
      endDate: toDateOnlyString(formValues.endDate),
      platforms: selectedPlatforms,
      status: CAMPAIGN_STATUS.SCHEDULED,
      owner: ownerName,
    });
    setFormValues(EMPTY_FORM_VALUES);
    setSelectedPlatforms([]);
  }

  const footer = (
    <>
      <button type="button" className="btn btn-outline-secondary-custom" onClick={onClose}>
        Cancel
      </button>
      <button type="submit" form="campaign-form" className="btn btn-primary">
        Create Campaign
      </button>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Campaign" footer={footer} size="lg">
      <form id="campaign-form" onSubmit={handleSubmit}>
        <TextField
          id="campaignName"
          label="Campaign name"
          value={formValues.name}
          onChange={(event) => handleChange('name', event.target.value)}
          required
        />
        <div className="mb-4">
          <label htmlFor="campaignDescription" className="form-label-custom">
            Description
          </label>
          <textarea
            id="campaignDescription"
            className="form-control"
            rows={3}
            value={formValues.description}
            onChange={(event) => handleChange('description', event.target.value)}
          />
        </div>
        <div className="mb-4">
          <label htmlFor="campaignObjective" className="form-label-custom">
            Objective
          </label>
          <select
            id="campaignObjective"
            className="form-select"
            value={formValues.objective}
            onChange={(event) => handleChange('objective', event.target.value)}
          >
            {CAMPAIGN_OBJECTIVES.map((objective) => (
              <option key={objective} value={objective}>
                {objective}
              </option>
            ))}
          </select>
        </div>
        <div className="row g-3 mb-4">
          <div className="col-6">
            <DatePickerField
              id="campaignStartDate"
              label="Start date"
              selected={formValues.startDate}
              onChange={(date) => handleChange('startDate', date)}
              placeholderText="Select start date"
              className="mb-0"
            />
          </div>
          <div className="col-6">
            <DatePickerField
              id="campaignEndDate"
              label="End date"
              selected={formValues.endDate}
              onChange={(date) => handleChange('endDate', date)}
              minDate={formValues.startDate}
              placeholderText="Select end date"
              className="mb-0"
            />
          </div>
        </div>
        <div className="mb-0">
          <span className="form-label-custom d-block">Platforms</span>
          <PlatformSelector
            selectedPlatforms={selectedPlatforms}
            onChange={setSelectedPlatforms}
            connectedPlatformKeys={PLATFORMS.map((platform) => platform.key)}
          />
        </div>
      </form>
    </Modal>
  );
}

export default CampaignFormModal;
