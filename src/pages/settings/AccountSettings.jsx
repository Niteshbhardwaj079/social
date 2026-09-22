import { useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import TextField from '../../components/forms/TextField';
import PasswordField from '../../components/forms/PasswordField';
import Avatar from '../../components/common/Avatar';
import ImageCropModal from '../../components/common/ImageCropModal';
import { useToast } from '../../components/common/ToastProvider';
import { updateProfilePhoto } from '../../store/slices/authSlice';
import { USER_ROLE_LABELS } from '../../config/constants';
import { formatFileSize } from '../../utils/formatters';

function AccountSettings() {
  const { showToast } = useToast();
  const dispatch = useDispatch();
  const currentUser = useSelector((state) => state.auth.currentUser);
  const photoInputRef = useRef(null);
  const [pendingPhotoFile, setPendingPhotoFile] = useState(null);

  const [profileValues, setProfileValues] = useState({
    name: currentUser?.name || '',
    email: currentUser?.email || '',
  });
  const [passwordValues, setPasswordValues] = useState({ currentPassword: '', newPassword: '' });

  function handleProfileSubmit(event) {
    event.preventDefault();
    showToast({ type: 'success', title: 'Profile updated' });
  }

  function handlePhotoFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) setPendingPhotoFile(file);
  }

  function handlePhotoCropComplete({ dataUrl, sizeBytes }) {
    dispatch(updateProfilePhoto(dataUrl));
    setPendingPhotoFile(null);
    showToast({ type: 'success', title: 'Profile photo updated', message: formatFileSize(sizeBytes) });
  }

  function handleRemovePhoto() {
    dispatch(updateProfilePhoto(null));
    showToast({ type: 'info', title: 'Profile photo removed' });
  }

  function handlePasswordSubmit(event) {
    event.preventDefault();
    setPasswordValues({ currentPassword: '', newPassword: '' });
    showToast({ type: 'success', title: 'Password updated' });
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
        />
        </div>

        <button type="submit" className="btn btn-primary">
          Save Profile
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
        <button type="submit" className="btn btn-primary">
          Update Password
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
