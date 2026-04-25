// js/features/sampleActions.js

import { appState } from '../state.js';

export function bindSampleActionEvents({
  makeDbDirty,
  refreshAllViews,
} = {}) {
  bindArchiveSelectedButton({ makeDbDirty, refreshAllViews });
  bindDeleteSelectedButton({ makeDbDirty, refreshAllViews });
  bindUnarchiveSelectedButton({ makeDbDirty, refreshAllViews });
  bindDeleteArchivedButton({ makeDbDirty, refreshAllViews });
}

function bindArchiveSelectedButton({ makeDbDirty, refreshAllViews } = {}) {
  const btn = document.getElementById('btn-archive-selected');
  if (!btn) return;

  btn.addEventListener('click', () => {
    if (!appState.db) return;

    const checked = Array.from(document.querySelectorAll('.sample-select:checked'));

    if (checked.length === 0) {
      alert('No samples selected.');
      return;
    }

    if (!confirm(`Archive ${checked.length} selected samples?`)) return;

    const stmt = appState.db.prepare(
      'UPDATE samples SET status = ? WHERE id = ?'
    );

    checked.forEach(cb => {
      const id = parseInt(cb.getAttribute('data-id'), 10);
      stmt.run(['archived', id]);
    });

    stmt.free();

    if (typeof makeDbDirty === 'function') {
      makeDbDirty();
    }

    if (typeof refreshAllViews === 'function') {
      refreshAllViews();
    }
  });
}

function bindDeleteSelectedButton({ makeDbDirty, refreshAllViews } = {}) {
  const btn = document.getElementById('btn-delete-selected');
  if (!btn) return;

  btn.addEventListener('click', () => {
    if (!appState.db) return;

    const checked = Array.from(document.querySelectorAll('.sample-select:checked'));

    if (checked.length === 0) {
      alert('No samples selected.');
      return;
    }

    if (
      !confirm(
        `Permanently DELETE ${checked.length} selected samples? This is intended only for erroneous rows.`
      )
    ) {
      return;
    }

    const stmt = appState.db.prepare('DELETE FROM samples WHERE id = ?');

    checked.forEach(cb => {
      const id = parseInt(cb.getAttribute('data-id'), 10);
      stmt.run([id]);
    });

    stmt.free();

    if (typeof makeDbDirty === 'function') {
      makeDbDirty();
    }

    if (typeof refreshAllViews === 'function') {
      refreshAllViews();
    }
  });
}

function bindUnarchiveSelectedButton({ makeDbDirty, refreshAllViews } = {}) {
  const btn = document.getElementById('btn-unarchive-selected');
  if (!btn) return;

  btn.addEventListener('click', () => {
    if (!appState.db) return;

    const checked = Array.from(document.querySelectorAll('.archived-select:checked'));

    if (checked.length === 0) {
      alert('No samples selected.');
      return;
    }

    if (
      !confirm(
        `Unarchive ${checked.length} selected samples? They will move back to the active Sample List.`
      )
    ) {
      return;
    }

    const stmt = appState.db.prepare(
      'UPDATE samples SET status = ? WHERE id = ?'
    );

    checked.forEach(cb => {
      const id = parseInt(cb.getAttribute('data-id'), 10);
      stmt.run([null, id]);
    });

    stmt.free();

    if (typeof makeDbDirty === 'function') {
      makeDbDirty();
    }

    if (typeof refreshAllViews === 'function') {
      refreshAllViews();
    }
  });
}

function bindDeleteArchivedButton({ makeDbDirty, refreshAllViews } = {}) {
  const btn = document.getElementById('btn-delete-archived');
  if (!btn) return;

  btn.addEventListener('click', () => {
    if (!appState.db) return;

    const checked = Array.from(document.querySelectorAll('.archived-select:checked'));

    if (checked.length === 0) {
      alert('No samples selected.');
      return;
    }

    if (!confirm(`Permanently DELETE ${checked.length} archived samples?`)) {
      return;
    }

    const stmt = appState.db.prepare('DELETE FROM samples WHERE id = ?');

    checked.forEach(cb => {
      const id = parseInt(cb.getAttribute('data-id'), 10);
      stmt.run([id]);
    });

    stmt.free();

    if (typeof makeDbDirty === 'function') {
      makeDbDirty();
    }

    if (typeof refreshAllViews === 'function') {
      refreshAllViews();
    }
  });
}