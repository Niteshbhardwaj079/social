import { useCallback, useState } from 'react';

// Which rows are ticked. Works with ids from any page, so a selection survives
// paging; `selectAll(ids, true)` is meant to be called with the ids currently visible.
function useRowSelection() {
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const toggleOne = useCallback((id) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((ids, shouldSelect) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      ids.forEach((id) => (shouldSelect ? next.add(id) : next.delete(id)));
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelectedIds(new Set()), []);

  return { selectedIds, count: selectedIds.size, toggleOne, selectAll, clear, isSelected: (id) => selectedIds.has(id) };
}

export default useRowSelection;
