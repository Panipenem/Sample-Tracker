import {
  resetArchivedPagination,
  resetDeletedPagination,
  resetSamplePagination,
} from './sampleRender.js';

export function bindSampleFilterEvents({
  renderSamples,
  renderArchivedSamples,
  renderDeletedSamples,
} = {}) {
  const searchInput = document.getElementById('search-input');
  if (searchInput && typeof renderSamples === 'function') {
    searchInput.addEventListener('input', () => {
      resetSamplePagination();
      renderSamples();
    });
  }

  const statusFilter = document.getElementById('status-filter');
  if (statusFilter && typeof renderSamples === 'function') {
    statusFilter.addEventListener('change', () => {
      resetSamplePagination();
      renderSamples();
    });
  }

  const archivedSearch = document.getElementById('archived-search-input');
  if (archivedSearch && typeof renderArchivedSamples === 'function') {
    archivedSearch.addEventListener('input', () => {
      resetArchivedPagination();
      renderArchivedSamples();
    });
  }

  const deletedSearch = document.getElementById('deleted-search-input');
  if (deletedSearch && typeof renderDeletedSamples === 'function') {
    deletedSearch.addEventListener('input', () => {
      resetDeletedPagination();
      renderDeletedSamples();
    });
  }
}
