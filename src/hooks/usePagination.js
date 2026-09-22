import { useEffect, useMemo, useState } from 'react';

// Page-size choices shown above every long list. 'all' shows everything on one page.
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 150, 'all'];

// Slices an already-filtered list into pages. `resetKey` is anything that
// should send the reader back to page 1 (a search term, a status filter...).
function usePagination(items, { initialSize = 50, resetKey = '' } = {}) {
  const [pageSize, setPageSizeState] = useState(initialSize);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  const total = items.length;
  const sizeNumber = pageSize === 'all' ? Math.max(total, 1) : pageSize;
  const totalPages = Math.max(1, Math.ceil(total / sizeNumber));
  // The list can shrink under the reader (after a delete or a filter) — never sit past the last page.
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * sizeNumber;

  const pageItems = useMemo(() => items.slice(startIndex, startIndex + sizeNumber), [items, startIndex, sizeNumber]);

  return {
    pageItems,
    page: currentPage,
    pageSize,
    totalPages,
    total,
    from: total === 0 ? 0 : startIndex + 1,
    to: Math.min(startIndex + sizeNumber, total),
    setPage,
    setPageSize(nextSize) {
      setPageSizeState(nextSize);
      setPage(1);
    },
  };
}

export default usePagination;
