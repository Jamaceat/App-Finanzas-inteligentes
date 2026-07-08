import { useState } from 'react';

export function usePagination({
  pageSize,
  totalCount,
  resetKey,
}: {
  pageSize: number;
  totalCount: number;
  resetKey?: unknown;
}) {
  const [page, setPage] = useState(0);
  const [trackedResetKey, setTrackedResetKey] = useState(resetKey);

  // Reset to the first page when the reset key changes, following React's
  // recommended "adjust state during render" pattern instead of an effect.
  if (resetKey !== trackedResetKey) {
    setTrackedResetKey(resetKey);
    setPage(0);
  }

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const clampedPage = Math.min(Math.max(page, 0), pageCount - 1);

  const offset = clampedPage * pageSize;
  const hasPreviousPage = clampedPage > 0;
  const hasNextPage = clampedPage < pageCount - 1;

  return {
    page: clampedPage,
    pageCount,
    pageSize,
    offset,
    totalCount,
    hasPreviousPage,
    hasNextPage,
    goToPage: (target: number) => setPage(Math.min(Math.max(target, 0), pageCount - 1)),
    goToNextPage: () => setPage((current) => Math.min(current + 1, pageCount - 1)),
    goToPreviousPage: () => setPage((current) => Math.max(current - 1, 0)),
  };
}
