import { useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import TextField from '../../components/forms/TextField';
import PasswordField from '../../components/forms/PasswordField';
import Avatar from '../../components/common/Avatar';
import ImageCropModal from '../../components/common/ImageCropModal';
import { useToast } from '../../components/common/ToastProvider';
import { setCurrentUser, updateProfilePhoto } from '../../store/slices/authSlice';
import { updateProfileRequest, changePasswordRequest } from '../../services/api/authApi';
import { uploadMediaItem } from '../../services/api/mediaApi';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { API_ENABLED } from '../../config/runtime';
import { USER_ROLE_LABELS } from '../../config/constants';
import { formatFileSize } from '../../utils/formatters';

function AccountSettings() {
  const { showToast } = useToast();
  const dispatch = useDispatch();
  const currentUser = useSelector((state) => state.auth.currentUser);
  const photoInputRef = useRef(null);
  const [pendingPhotoFile, setPendingPhotoFile] = useState(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const [profileValues, setProfileValues] = useState({
    name: currentUser?.name || '',
    email: currentUser?.email || '',
  });
  const [passwordValues, setPasswordValues] = useState({ currentPassword: '', newPassword: '' });

  function handleProfileSubmit(event) {
    event.preventDefault();
    if (!API_ENABLED) {
      showToast({ type: 'success', title: 'Profile updated' });
      return;
    }
    setIsSavingProfile(true);
    updateProfileRequest({ name: profileValues.name.trim() })
      .then((user) => {
        dispatch(setCurrentUser(user));
        showToast({ type: 'success', title: 'Profile updated' });
      })
      .catch((error) => showToast({ type: 'error', title: 'Could not update your profile', message: apiErrorMessage(error) }))
      .finally(() => setIsSavingProfile(false));
  }

  function handlePhotoFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) setPendingPhotoFile(file);
  }

  function handlePhotoCropComplete({ dataUrl, blob, sizeBytes }) {
    setPendingPhotoFile(null);
    if (!API_ENABLED) {
      dispatch(updateProfilePhoto(dataUrl));
      showToast({ type: 'success', title: 'Profile photo updated', message: formatFileSize(sizeBytes) });
      return;
    }
    uploadMediaItem({ name: 'avatar.png', folder: 'Avatars' }, blob)
      .then((item) => updateProfileRequest({ avatarUrl: item.publicUrl || item.url }))
      .then((user) => {
        dispatch(setCurrentUser(user));
        showToast({ type: 'success', title: 'Profile photo updated', message: formatFileSize(sizeBytes) });
      })
      .catch((error) => showToast({ type: 'error', title: 'Could not update your photo', message: apiErrorMessage(error) }));
  }

  function handleRemovePhoto() {
    if (!API_ENABLED) {
      dispatch(updateProfilePhoto(null));
      showToast({ type: 'info', title: 'Profile photo removed' });
      return;
    }
    updateProfileRequest({ avatarUrl: null })
      .then((user) => {
        dispatch(setCurrentUser(user));
        showToast({ type: 'info', title: 'Profile photo removed' });
      })
      .catch((error) => showToast({ type: 'error', title: 'Could not remove your photo', message: apiErrorMessage(error) }));
  }

  function handlePasswordSubmit(event) {
    event.preventDefault();
    if (!API_ENABLED) {
      setPasswordValues({ currentPassword: '', newPassword: '' });
      showToast({ type: 'success', title: 'Password updated' });
      return;
    }
    setIsSavingPassword(true);
    changePasswordRequest(passwordValues)
      .then(({ user }) => {
        dispatch(setCurrentUser(user));
        setPasswordValues({ currentPassword: '', newPassword: '' });
        showToast({ type: 'success', title: 'Password updated', message: 'Every other device was signed out for safety.' });
      })
      .catch((error) => showToast({ type: 'error', title: 'Could not change your password', message: apiErrorMessage(error) }))
      .finally(() => setIsSavingPassword(false));
  }

  return (
    <div className="d-flex flex-column gap-5">
      <form className="surface-card" onSubmit={handleProfileSubmit}>
        <h3 className="h5 mb-4">Profile</h3>
        <div className="d-flex align-items-center gap-3 mb-4">
          <Avatar name={currentUser?.name} imageUrl={currentUser?.avatarUrl} size="lg" />
          <div>
            <div className="d-flex gap-2 flex-wrap">
              <button type="button" className="btn btn-sm btn-outline-secondary-custom" onClick={() => photoInputRef.current?.click()}>
                Change Photo
              </button>
              {currentUser?.avatarUrl ? (
                <button type="button" className="btn btn-sm btn-outline-secondary-custom text-danger" onClick={handleRemovePhoto}>
                  Remove
                </button>
              ) : null}
            </div>
            <input ref={photoInputRef} type="file" accept="image/*" hidden onChange={handlePhotoFileChange} />
            <p className="form-hint mb-0 mt-2">{USER_ROLE_LABELS[currentUser?.role]}</p>
          </div>
        </div>

        <div className="form-grid-2">
        <TextField
          id="accountName"
          label="Full name"
          value={profileValues.name}
          onChange={(event) => setProfileValues((current) => ({ ...current, name: event.target.value }))}
        />
        <TextField
          id="accountEmail"
          label="Email address"
          type="email"
          value={profileValues.email}
          onChange={(event) => setProfileValues((current) => ({ ...current, email: event.target.value }))}
          disabled={API_ENABLED}
          hint={API_ENABLED ? 'Contact an admin to change your sign-in email.' : undefined}
        />
        </div>

        <button type="submit" className="btn btn-primary" disabled={isSavingProfile}>
          {isSavingProfile ? 'Saving...' : 'Save Profile'}
        </button>
      </form>

      <form className="surface-card" onSubmit={handlePasswordSubmit}>
        <h3 className="h5 mb-4">Change Password</h3>
        <div className="form-grid-2">
        <PasswordField
          id="currentPassword"
          label="Current password"
          value={passwordValues.currentPassword}
          onChange={(event) => setPasswordValues((current) => ({ ...current, currentPassword: event.target.value }))}
        />
        <PasswordField
          id="newPassword"
          label="New password"
          value={passwordValues.newPassword}
          onChange={(event) => setPasswordValues((current) => ({ ...current, newPassword: event.target.value }))}
        />
        </div>
        <button type="submit" className="btn btn-primary" disabled={isSavingPassword}>
          {isSavingPassword ? 'Updating...' : 'Update Password'}
        </button>
      </form>

      <ImageCropModal
        isOpen={Boolean(pendingPhotoFile)}
        file={pendingPhotoFile}
        aspectRatio={1}
        onClose={() => setPendingPhotoFile(null)}
        onComplete={handlePhotoCropComplete}
      />
    </div>
  );
}

export default AccountSettings;
