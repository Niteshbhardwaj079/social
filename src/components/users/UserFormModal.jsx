import { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import { LANGUAGES } from '../../i18n/languages';
import TextField from '../forms/TextField';
import { USER_ROLES } from '../../config/constants';
import { useI18n } from '../../i18n/useI18n';

function UserFormModal({ isOpen, onClose, onSubmit, editingUser }) {
  const { t, enabledLanguages, defaultLanguage } = useI18n();
  // A new person starts in the workspace's default language.
  const emptyValues = { name: '', email: '', role: USER_ROLES.CONTRIBUTOR, language: defaultLanguage };
  const [formValues, setFormValues] = useState(emptyValues);

  useEffect(() => {
    setFormValues(
      editingUser
        ? { name: editingUser.name, email: editingUser.email, role: editingUser.role, language: editingUser.language || defaultLanguage }
        : { name: '', email: '', role: USER_ROLES.CONTRIBUTOR, language: defaultLanguage }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingUser, isOpen]);

  const languageChoices = LANGUAGES.filter(
    (item) => enabledLanguages.some((enabled) => enabled.code === item.code) || item.code === editingUser?.language
  );

  function handleChange(field, value) {
    setFormValues((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit(formValues);
  }

  const footer = (
    <>
      <button type="button" className="btn btn-outline-secondary-custom" onClick={onClose}>
        {t('common.cancel')}
      </button>
      <button type="submit" form="user-form" className="btn btn-primary">
        {editingUser ? t('common.saveChanges') : t('users.invite')}
      </button>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editingUser ? t('users.editUser') : t('users.invite')} footer={footer} size="sm">
      <form id="user-form" onSubmit={handleSubmit}>
        <TextField
          id="userName"
          label={t('users.fullName')}
          value={formValues.name}
          onChange={(event) => handleChange('name', event.target.value)}
          required
        />
        <TextField
          id="userEmail"
          label={t('users.email')}
          type="email"
          value={formValues.email}
          onChange={(event) => handleChange('email', event.target.value)}
          required
        />
        <div className="mb-0">
          <label htmlFor="userRole" className="form-label-custom">
            {t('users.role')}
          </label>
          <select
            id="userRole"
            className="form-select"
            value={formValues.role}
            onChange={(event) => handleChange('role', event.target.value)}
          >
            {Object.values(USER_ROLES).map((role) => (
              <option key={role} value={role}>
                {t(`roles.${role}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-4 mb-0">
          <label htmlFor="userLanguage" className="form-label-custom">
            {t('users.language')}
          </label>
          <select
            id="userLanguage"
            className="form-select"
            value={formValues.language}
            onChange={(event) => handleChange('language', event.target.value)}
          >
            {languageChoices.map((item) => (
              <option key={item.code} value={item.code} lang={item.htmlLang}>
                {item.nativeName} — {item.name}
              </option>
            ))}
          </select>
          <div className="form-hint">{t('users.languageHint')}</div>
        </div>
      </form>
    </Modal>
  );
}

export default UserFormModal;
