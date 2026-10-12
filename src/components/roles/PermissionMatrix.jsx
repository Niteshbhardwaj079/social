import { PERMISSION_COLUMNS, ROLE_PERMISSION_MODULES } from '../../config/rolePermissions';
import { useI18n } from '../../i18n/useI18n';

const COLUMN_LABEL_KEY = { view: 'common.view', create: 'common.create', edit: 'common.edit', delete: 'common.delete' };

function PermissionMatrix({ permissions, onChange, disabled = false }) {
  const { t } = useI18n();

  function toggle(key) {
    if (disabled) return;
    onChange({ ...permissions, [key]: !permissions[key] });
  }

  return (
    <div className="data-table-wrapper">
      <table className="data-table permission-matrix">
        <thead>
          <tr>
            <th>{t('rolesPanel.moduleColumn')}</th>
            {PERMISSION_COLUMNS.map((column) => (
              <th key={column.id} className="text-center">
                {t(COLUMN_LABEL_KEY[column.id])}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROLE_PERMISSION_MODULES.map((group) => (
            <tr key={group.module}>
              <td className="table-row-title">{t(`rolesPanel.modules.${group.moduleKey}`)}</td>
              {PERMISSION_COLUMNS.map((column) => {
                const cell = group.cells[column.id];
                if (!cell) return <td key={column.id} className="text-center" />;
                const description = t(`rolesPanel.descriptions.${cell.key}`);
                return (
                  <td key={column.id} className="text-center" title={description}>
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={Boolean(permissions[cell.key])}
                      onChange={() => toggle(cell.key)}
                      disabled={disabled}
                      aria-label={`${t(`rolesPanel.modules.${group.moduleKey}`)} - ${t(COLUMN_LABEL_KEY[column.id])}: ${description}`}
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
