const TAB_SECTION_IDS = {
  form: 'section-form',
  samples: 'section-samples',
  archived: 'section-archived',
  quality: 'section-quality',
  boxes: 'section-boxes',
  scan: 'section-scan-workflow',
  settings: 'section-settings',
};

const SETTINGS_PANEL_IDS = {
  deleted: 'settings-panel-deleted',
  audit: 'settings-panel-audit',
  boxes: 'settings-panel-boxes',
  presets: 'settings-panel-presets',
};

export function bindTabEvents(defaultTab = 'form') {
  const tabButtons = document.querySelectorAll('.tab-button');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      setActiveTab(tabName);
    });
  });

  bindSettingsTabEvents();
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

export function setActiveSettingsPanel(name) {
  Object.entries(SETTINGS_PANEL_IDS).forEach(([key, panelId]) => {
    const panel = document.getElementById(panelId);
    if (!panel) return;

    panel.classList.toggle('hidden', key !== name);
  });

  document.querySelectorAll('.settings-tab-button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.settingsTab === name);
  });
}

function bindSettingsTabEvents() {
  document.querySelectorAll('.settings-tab-button').forEach(btn => {
    btn.addEventListener('click', () => {
      setActiveSettingsPanel(btn.dataset.settingsTab);
    });
  });

  setActiveSettingsPanel('boxes');
}
