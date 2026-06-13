// js/features/sampleActions.js

import { appState } from '../state.js';
import { recordSampleEvent } from '../db/audit.js';
import { queryAll, runSql, withTransaction } from '../db/query.js';

export function bindSampleActionEvents({
  makeDbDirty,
  refreshAllViews,
} = {}) {
  bindArchiveSelectedButton({ makeDbDirty, refreshAllViews });
  bindDeleteSelectedButton({ makeDbDirty, refreshAllViews });
  bindUnarchiveSelectedButton({ makeDbDirty, refreshAllViews });
  bindDeleteArchivedButton({ makeDbDirty, refreshAllViews });
  bindRestoreDeletedButton({ makeDbDirty, refreshAllViews });
  bindPurgeDeletedButton({ makeDbDirty, refreshAllViews });
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

    withTransaction(() => {
      const stmt = appState.db.prepare(
        'UPDATE samples SET status = ?, deleted_at = NULL, updated_at = datetime(\'now\') WHERE id = ?'
      );

      try {
        checked.forEach(cb => {
          const id = parseInt(cb.getAttribute('data-id'), 10);
          const sample = queryAll('SELECT sample_id FROM samples WHERE id = ? LIMIT 1;', [id])[0] || {};
          stmt.run(['archived', id]);
          recordSampleEvent({
            sampleRowId: id,
            sampleId: sample.sample_id,
            action: 'archive',
            details: { source: 'bulk_action' },
          });
        });
      } finally {
        stmt.free();
      }
    });

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
        `Soft delete ${checked.length} selected samples? Records will move to the Deleted tab and remain recoverable.`
      )
    ) {
      return;
    }

    withTransaction(() => {
      const stmt = appState.db.prepare(
        'UPDATE samples SET status = ?, deleted_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ?'
      );

      try {
        checked.forEach(cb => {
          const id = parseInt(cb.getAttribute('data-id'), 10);
          const sample = queryAll('SELECT sample_id FROM samples WHERE id = ? LIMIT 1;', [id])[0] || {};
          stmt.run(['deleted', id]);
          recordSampleEvent({
            sampleRowId: id,
            sampleId: sample.sample_id,
            action: 'delete',
            details: { source: 'bulk_action', mode: 'soft_delete' },
          });
        });
      } finally {
        stmt.free();
      }
    });

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

    withTransaction(() => {
      const stmt = appState.db.prepare(
        'UPDATE samples SET status = ?, deleted_at = NULL, updated_at = datetime(\'now\') WHERE id = ?'
      );

      try {
        checked.forEach(cb => {
          const id = parseInt(cb.getAttribute('data-id'), 10);
          const sample = queryAll('SELECT sample_id FROM samples WHERE id = ? LIMIT 1;', [id])[0] || {};
          stmt.run(['available', id]);
          recordSampleEvent({
            sampleRowId: id,
            sampleId: sample.sample_id,
            action: 'unarchive',
            details: { source: 'bulk_action' },
          });
        });
      } finally {
        stmt.free();
      }
    });

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

    if (!confirm(`Soft delete ${checked.length} archived samples? Records will move to the Deleted tab and remain recoverable.`)) {
      return;
    }

    withTransaction(() => {
      const stmt = appState.db.prepare(
        'UPDATE samples SET status = ?, deleted_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ?'
      );

      try {
        checked.forEach(cb => {
          const id = parseInt(cb.getAttribute('data-id'), 10);
          const sample = queryAll('SELECT sample_id FROM samples WHERE id = ? LIMIT 1;', [id])[0] || {};
          stmt.run(['deleted', id]);
          recordSampleEvent({
            sampleRowId: id,
            sampleId: sample.sample_id,
            action: 'delete',
            details: { source: 'archived_bulk_action', mode: 'soft_delete' },
          });
        });
      } finally {
        stmt.free();
      }
    });

    if (typeof makeDbDirty === 'function') {
      makeDbDirty();
    }

    if (typeof refreshAllViews === 'function') {
      refreshAllViews();
    }
  });
}

function bindRestoreDeletedButton({ makeDbDirty, refreshAllViews } = {}) {
  const btn = document.getElementById('btn-restore-deleted');
  if (!btn) return;

  btn.addEventListener('click', () => {
    if (!appState.db) return;

    const checked = Array.from(document.querySelectorAll('.deleted-select:checked'));

    if (checked.length === 0) {
      alert('No deleted samples selected.');
      return;
    }

    if (!confirm(`Restore ${checked.length} deleted samples to the active Sample List?`)) {
      return;
    }

    withTransaction(() => {
      const stmt = appState.db.prepare(
        'UPDATE samples SET status = ?, deleted_at = NULL, updated_at = datetime(\'now\') WHERE id = ?'
      );

      try {
        checked.forEach(cb => {
          const id = parseInt(cb.getAttribute('data-id'), 10);
          const sample = queryAll('SELECT sample_id FROM samples WHERE id = ? LIMIT 1;', [id])[0] || {};
          stmt.run(['available', id]);
          recordSampleEvent({
            sampleRowId: id,
            sampleId: sample.sample_id,
            action: 'restore_deleted',
            details: { source: 'deleted_tab' },
          });
        });
      } finally {
        stmt.free();
      }
    });

    if (typeof makeDbDirty === 'function') {
      makeDbDirty();
    }

    if (typeof refreshAllViews === 'function') {
      refreshAllViews();
    }
  });
}

function bindPurgeDeletedButton({ makeDbDirty, refreshAllViews } = {}) {
  const btn = document.getElementById('btn-purge-deleted');
  if (!btn) return;

  btn.addEventListener('click', () => {
    if (!appState.db) return;

    const checked = Array.from(document.querySelectorAll('.deleted-select:checked'));

    if (checked.length === 0) {
      alert('No deleted samples selected.');
      return;
    }

    if (
      !confirm(
        `Permanently delete ${checked.length} selected deleted samples? This cannot be restored from the Deleted tab.`
      )
    ) {
      return;
    }

    const typed = prompt('Type PURGE to permanently delete the selected records:') || '';
    if (typed.trim().toUpperCase() !== 'PURGE') {
      alert('Purge cancelled.');
      return;
    }

    withTransaction(() => {
      checked.forEach(cb => {
        const id = parseInt(cb.getAttribute('data-id'), 10);
        const sample = queryAll(
          'SELECT sample_id, status FROM samples WHERE id = ? LIMIT 1;',
          [id]
        )[0] || {};

        if (String(sample.status || '').toLowerCase() !== 'deleted') {
          return;
        }

        recordSampleEvent({
          sampleRowId: id,
          sampleId: sample.sample_id,
          action: 'purge',
          details: { source: 'deleted_tab', mode: 'permanent_delete' },
        });

        runSql('DELETE FROM samples WHERE id = ?;', [id]);
      });
    });

    if (typeof makeDbDirty === 'function') {
      makeDbDirty();
    }

    if (typeof refreshAllViews === 'function') {
      refreshAllViews();
    }
  });
}
