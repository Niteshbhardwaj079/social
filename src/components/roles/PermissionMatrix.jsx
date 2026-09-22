import { PERMISSION_MODULES, PERMISSION_ACTIONS } from '../../config/constants';

function PermissionMatrix({ permissions, onChange, disabled = false }) {
  function isChecked(moduleName, action) {
    return (permissions[moduleName] || []).includes(action);
  }

  function isRowFullySelected(moduleName) {
    const currentActions = permissions[moduleName] || [];
    return PERMISSION_ACTIONS.every((action) => currentActions.includes(action));
  }

  function toggleAction(moduleName, action) {
    if (disabled) return;
    const currentActions = permissions[moduleName] || [];
    const nextActions = currentActions.includes(action)
      ? currentActions.filter((item) => item !== action)
      : [...currentActions, action];
    onChange({ ...permissions, [moduleName]: nextActions });
  }

  function toggleRow(moduleName) {
    if (disabled) return;
    const nextActions = isRowFullySelected(moduleName) ? [] : [...PERMISSION_ACTIONS];
    onChange({ ...permissions, [moduleName]: nextActions });
  }

  return (
    <div className="data-table-wrapper">
      <table className="data-table permission-matrix">
        <thead>
          <tr>
            <th>Section</th>
            {PERMISSION_ACTIONS.map((action) => (
              <th key={action} className="text-center">
                {action}
              </th>
            ))}
            <th className="text-center">Select All</th>
          </tr>
        </thead>
        <tbody>
          {PERMISSION_MODULES.map((moduleName) => (
            <tr key={moduleName}>
              <td className="table-row-title">{moduleName}</td>
              {PERMISSION_ACTIONS.map((action) => (
                <td key={action} className="text-center">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    checked={isChecked(moduleName, action)}
                    onChange={() => toggleAction(moduleName, action)}
                    disabled={disabled}
                    aria-label={`${moduleName} - ${action}`}
                  />
                </td>
              ))}
              <td className="text-center">
                <input
                  type="checkbox"
                  className="form-check-input"
                  checked={isRowFullySelected(moduleName)}
                  onChange={() => toggleRow(moduleName)}
                  disabled={disabled}
                  aria-label={`${moduleName} - select all`}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default PermissionMatrix;
