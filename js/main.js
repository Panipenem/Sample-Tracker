import { 
    appState 
} from './state.js';

import {
  R2_API_BASE,
  FREEZER_LIST_KEY,
  FREEZER_LIST_PREFIX,
  LAST_DB_KEY,
  LAST_DB_NAME_KEY,
  LAST_SYNC_VERSION_KEY,
  MASTER_DB_FILENAME,
} from './config.js';

import { 
    uint8ToBase64, 
    base64ToUint8 
} from './utils/encoding.js';

import {
  normalizeFreezerName,
  cellToString,
  parseSeqFromSampleId,
} from './utils/string.js';
  
import { 
    downloadBlob 
} from './utils/download.js';

import {
  queryAll,
  runSql,
  beginTransaction,
  commitTransaction,
  rollbackTransaction,
} from './db/query.js';

import { 
    getMeta, 
    setMeta 
} from './db/meta.js';

import { 
    initSchema 
} from './db/schema.js';

import {
  cacheDbToLocalStorage,
  updateLocalCacheFromCurrentDb,
  tryAutoLoadLastDb,
} from './services/localCache.js';

import { 
    saveDbToR2, 
    loadDbFromR2 
} from './services/r2Service.js';

import {
  addFreezerToListByTemp,
  refreshFreezerMenus,
  getFreezerNoFromUI,
  getBatchFreezerNoFromUI,
} from './features/freezerSelect.js';

import { 
    bindDbControlEvents 
} from './features/dbControls.js';

import { 
    bindTabEvents 
} from './features/tabs.js';

import {
  refreshDbStatus,
  updateVersionBadge,
  makeDbDirty,
} from './features/dbStatus.js';

import { 
    bindSampleSelectionEvents 
} from './features/sampleSelection.js';

import { 
    bindSampleFilterEvents 
} from './features/sampleFilters.js';

import { 
    bindSampleActionEvents 
} from './features/sampleActions.js';

import { 
    bindSampleIdEvents 
} from './features/sampleId.js';

import {
  renderSamples as renderSamplesBase,
  renderArchivedSamples,
  renderDeletedSamples,
  bindSampleColumnEvents,
} from './features/sampleRender.js';

import { 
    renderBoxes 
} from './features/boxView.js';

import {
  renderAuditLog,
  bindAuditLogEvents,
} from './features/auditLog.js';

import {
  renderDataQuality,
} from './features/dataQuality.js';

import {
  bindSampleDetailEvents,
} from './features/sampleDetail.js';

import { 
    bindBatchEditEvents 
} from './features/batchEdit.js';

import { 
    bindWizardEvents 
} from './features/secondaryWizard.js';

import { 
    bindFreezerControlEvents 
} from './features/freezerControls.js';

import {
  bindSampleFormEvents,
  resetForm,
} from './features/sampleForm.js';

import { 
    bindImportExportEvents 
} from './features/importExport.js';

import { 
    initSampleTypeSelect 
} from './features/sampleTypeControls.js';

import {
  bindPresetSettingsEvents,
  refreshPresetSettingsPanel,
} from './features/presetSettings.js';

import {
  bindScanWorkflowEvents,
  renderScanWorkflow,
} from './features/scanWorkflow.js?v=scan-camera';


  // Initialize sql.js
  initSqlJs({ locateFile: file => 'sql-wasm.wasm' }).then(SQLLib => {
    appState.SQL = SQLLib;
    document.getElementById('db-status').textContent = 'sql.js loaded. Click "New in-memory DB" or load a .sqlite file.';
    updateVersionBadge();
    // sql.js 就绪后尝试自动加载上一次缓存的 DB
    tryAutoLoadLastDb({
        refreshAllViews,
        refreshFreezerMenus,
    });
    refreshFreezerMenus();
  });

  function refreshAllViews() {
    renderSamples();
    renderArchivedSamples();
    renderDeletedSamples();
    renderAuditLog();
    renderDataQuality();
    renderBoxes();
    renderScanWorkflow();
    initSampleTypeSelect();
    refreshPresetSettingsPanel();
  }

  function renderSamples() {
    renderSamplesBase({
        makeDbDirty,
        refreshAllViews,
    });
  }

  window.updateVersionBadge = updateVersionBadge;



  // 自动根据日期生成 Sample ID：YYYYMMDD-001, 002, ...
  bindSampleIdEvents();

  bindTabEvents('form');

  bindFreezerControlEvents();

  bindSampleSelectionEvents();

  bindSampleFilterEvents({
    renderSamples,
    renderArchivedSamples,
    renderDeletedSamples,
  });

  bindSampleColumnEvents();

  bindSampleActionEvents({
    makeDbDirty,
    refreshAllViews,
  });

  bindSampleDetailEvents({
    makeDbDirty,
    refreshAllViews,
  });

  bindAuditLogEvents({
    renderAuditLog,
  });

  bindBatchEditEvents({
    refreshAllViews,
    refreshFreezerMenus,
    makeDbDirty,
  });

  bindWizardEvents({
    refreshAllViews,
    makeDbDirty,
  });

  bindSampleFormEvents({
    makeDbDirty,
    refreshAllViews,
  });

  bindImportExportEvents({
    refreshAllViews,
    makeDbDirty,
  });

  bindPresetSettingsEvents({
    refreshSampleTypeSelect: initSampleTypeSelect,
    makeDbDirty,
  });

  bindScanWorkflowEvents({
    makeDbDirty,
    refreshAllViews,
  });

  bindDbControlEvents({
    refreshAllViews,
    refreshFreezerMenus,
    updateVersionBadge,
  });

  initSampleTypeSelect();

  // 在关闭 / 刷新页面前，如果有未导出的更改，提示用户
  window.addEventListener('beforeunload', function (e) {
    // 如果没有数据库 or 没有未保存修改，就不拦截
    if (!appState.db || !appState.dbDirty) return;

    // 有未保存修改：阻止默认行为并设置 returnValue
    e.preventDefault();
    // 某些浏览器会忽略自定义文本，但设了 returnValue 才会弹出提示框
    e.returnValue = 'You have unsaved changes in the sample database. If you leave now, new or edited samples will be lost unless you have exported the DB.';

    // 不需要 return 任何值，现代浏览器会使用默认提示语
  });
