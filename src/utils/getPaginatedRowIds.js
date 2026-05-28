export function getOrderedRowIds(rows, sortModel = []) {
  if (!sortModel.length) {
    return rows.map((row) => row.appId);
  }

  const { field, sort } = sortModel[0];
  return [...rows]
    .sort((a, b) => {
      const aValue = a[field] ?? "";
      const bValue = b[field] ?? "";
      if (aValue < bValue) return sort === "asc" ? -1 : 1;
      if (aValue > bValue) return sort === "asc" ? 1 : -1;
      return 0;
    })
    .map((row) => row.appId);
}

export function getPaginatedRowIds(rowIds, paginationModel) {
  const start = paginationModel.page * paginationModel.pageSize;
  return rowIds.slice(start, start + paginationModel.pageSize);
}

export function handlePageScopedRowSelectionChange(newSelection, allRowIds, pageRowIds) {
  if (newSelection.length === allRowIds.length && allRowIds.length > pageRowIds.length) {
    return pageRowIds;
  }
  return newSelection;
}
