import DropdownMenu from '../common/DropdownMenu';
import Icon from '../common/Icon';

// One "Download report" button that offers every format. `options` is
// [{ label, description, icon, onClick }]; the menu closes after a choice.
function DownloadReportMenu({ options, label = 'Download report', disabled = false }) {
  return (
    <DropdownMenu
      trigger={
        <button type="button" className="btn btn-outline-secondary-custom" disabled={disabled}>
          <Icon name="Download" size={16} />
          {label}
          <Icon name="ChevronDown" size={14} />
        </button>
      }
    >
      {({ close }) => (
        <div className="report-menu">
          {options.map((option) => (
            <button
              key={option.label}
              type="button"
              className="dropdown-item report-menu__item"
              onClick={() => {
                option.onClick();
                close();
              }}
            >
              <Icon name={option.icon} size={18} />
              <span>
                <strong>{option.label}</strong>
                <span className="report-menu__desc">{option.description}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </DropdownMenu>
  );
}

export default DownloadReportMenu;
