const TAB_SECTION_IDS = {
  form: 'section-form',
  samples: 'section-samples',
  archived: 'section-archived',
  boxes: 'section-boxes',
};

export function bindTabEvents(defaultTab = 'form') {
  const tabButtons = document.querySelectorAll('.tab-button');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      setActiveTab(tabName);
    });
  });

  setActiveTab(defaultTab);
}

export function setActiveTab(name) {
  Object.entries(TAB_SECTION_IDS).forEach(([key, sectionId]) => {
    const section = document.getElementById(sectionId);
    if (!section) return;

    section.style.display = key === name ? 'block' : 'none';
  });

  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === name);
  });
}