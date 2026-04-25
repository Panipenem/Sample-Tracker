export function bindSampleFilterEvents({
  renderSamples,
  renderArchivedSamples,
} = {}) {
  const searchInput = document.getElementById('search-input');
  if (searchInput && typeof renderSamples === 'function') {
    searchInput.addEventListener('input', () => {
      renderSamples();
    });
  }

  const statusFilter = document.getElementById('status-filter');
  if (statusFilter && typeof renderSamples === 'function') {
    statusFilter.addEventListener('change', () => {
      renderSamples();
    });
  }

  const archivedSearch = document.getElementById('archived-search-input');
  if (archivedSearch && typeof renderArchivedSamples === 'function') {
    archivedSearch.addEventListener('input', () => {
      renderArchivedSamples();
    });
  }
}