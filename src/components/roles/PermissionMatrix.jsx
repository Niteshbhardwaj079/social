import { ROLE_PERMISSION_GROUPS } from '../../config/rolePermissions';

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
            <th>Permission</th>
            <th className="text-center">Allowed</th>
          </tr>
        </thead>
        <tbody>
          {ROLE_PERMISSION_GROUPS.map((group) =>
            group.rows.map((row, index) => (
              <tr key={row.key}>
                {index === 0 ? <td className="table-row-title" rowSpan={group.rows.length}>{group.module}</td> : null}
                <td>
                  <div>{row.label}</div>
                  <p className="small text-muted-custom mb-0">{row.description}</p>
                </td>
                <td className="text-center">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    checked={Boolean(permissions[row.key])}
                    onChange={() => toggle(row.key)}
                    disabled={disabled}
                    aria-label={`${group.module} - ${row.label}`}
                  />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default PermissionMatrix;
