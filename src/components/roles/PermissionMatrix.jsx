import { PERMISSION_COLUMNS, ROLE_PERMISSION_MODULES } from '../../config/rolePermissions';

function PermissionMatrix({ permissions, onChange, disabled = false }) {
  function toggle(key) {
    if (disabled) return;
    onChange({ ...permissions, [key]: !permissions[key] });
  }

  return (
    <div className="data-table-wrapper">
      <table className="data-table permission-matrix">
        <thead>
          <tr>
            <th>Module</th>
            {PERMISSION_COLUMNS.map((column) => (
              <th key={column.id} className="text-center">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROLE_PERMISSION_MODULES.map((group) => (
            <tr key={group.module}>
              <td className="table-row-title">{group.module}</td>
              {PERMISSION_COLUMNS.map((column) => {
                const cell = group.cells[column.id];
                if (!cell) return <td key={column.id} className="text-center" />;
                return (
                  <td key={column.id} className="text-center" title={cell.description}>
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={Boolean(permissions[cell.key])}
                      onChange={() => toggle(cell.key)}
                      disabled={disabled}
                      aria-label={`${group.module} - ${column.label}: ${cell.description}`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default PermissionMatrix;
