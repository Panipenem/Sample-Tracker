import { appState } from '../state.js';
import { queryAll, runSql, withTransaction } from '../db/query.js';
import { escapeHtml } from '../utils/string.js';
import { makeDbDirty } from './dbStatus.js';

export function renderBoxes() {
  const container = document.getElementById('boxes-container');
  if (!container) return;

  container.innerHTML = '';
  if (!appState.db) return;

  const boxes = queryAll(`
    SELECT
      b.id,
      b.storage_temperature,
      b.freezer_no,
      b.rack,
      b.box_label,
      b.capacity,
      COUNT(s.id) AS sample_count
    FROM boxes b
    LEFT JOIN samples s 
      ON s.box_id = b.id
     AND (s.status IS NULL OR s.status NOT IN ('archived','retired','discarded','consumed','deleted'))
    GROUP BY b.id, b.storage_temperature, b.freezer_no, b.rack, b.box_label, b.capacity
    ORDER BY b.storage_temperature, b.freezer_no, b.rack, b.box_label;
  `);

  if (!boxes || boxes.length === 0) {
    container.textContent = 'No boxes found.';
    return;
  }

  const groups = {};
  boxes.forEach(b => {
    const temp = b.storage_temperature || 'Unknown';
    const freezer = b.freezer_no || 'N/A';
    const key = `${temp}||${freezer}`;

    if (!groups[key]) {
      groups[key] = {
        storage_temperature: temp,
        freezer_no: freezer,
        boxes: [],
      };
    }

    groups[key].boxes.push(b);
  });

  const groupKeys = Object.keys(groups).sort((a, b) => {
    const ga = groups[a];
    const gb = groups[b];
    const tA = String(ga.storage_temperature || '');
    const tB = String(gb.storage_temperature || '');

    if (tA === tB) {
      const fA = String(ga.freezer_no || '');
      const fB = String(gb.freezer_no || '');
      return fA.localeCompare(fB, 'en', { numeric: true });
    }

    return tA.localeCompare(tB, 'en', { numeric: true });
  });

  groupKeys.forEach(key => {
    const group = groups[key];

    const groupDiv = document.createElement('div');
    groupDiv.className = 'box-group';

    const header = document.createElement('div');
    header.className = 'box-group-header';
    header.textContent = `${group.storage_temperature} | Freezer: ${group.freezer_no}`;
    groupDiv.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'box-grid';

    const groupBoxes = group.boxes.slice().sort((a, b) => {
      const rA = String(a.rack || '');
      const rB = String(b.rack || '');

      if (rA === rB) {
        const xA = String(a.box_label || '');
        const xB = String(b.box_label || '');
        return xA.localeCompare(xB, 'en', { numeric: true });
      }

      return rA.localeCompare(rB, 'en', { numeric: true });
    });

    groupBoxes.forEach(box => {
      const card = document.createElement('div');
      card.className = 'box-card';
      const capacity = Number(box.capacity) || 0;
      if (capacity > 0 && Number(box.sample_count) > capacity) {
        card.classList.add('box-card-over-capacity');
      }

      const cardHeader = document.createElement('div');
      cardHeader.style.display = 'flex';
      cardHeader.style.alignItems = 'center';
      cardHeader.style.gap = '6px';

      const infoDiv = document.createElement('div');
      const rackText = box.rack ? `Rack: ${box.rack}` : '';
      const capacityText = capacity > 0
        ? `${box.sample_count} / ${capacity} tubes`
        : `${box.sample_count} tubes`;
      infoDiv.innerHTML = `
        <div><strong>${escapeHtml(box.box_label)}</strong></div>
        <div class="small">${escapeHtml(rackText)}${rackText ? ' · ' : ''}${escapeHtml(capacityText)}</div>
      `;
      cardHeader.appendChild(infoDiv);

      let toggleBtn = null;
      if (box.sample_count > 0) {
        toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'sample-toggle small';
        toggleBtn.textContent = `Show samples (${box.sample_count})`;
        cardHeader.appendChild(toggleBtn);
      }

      card.appendChild(cardHeader);

      const capacityEditor = document.createElement('div');
      capacityEditor.className = 'box-capacity-row';
      capacityEditor.innerHTML = `
        <label class="small" for="box-capacity-${box.id}">Capacity</label>
        <input
          id="box-capacity-${box.id}"
          type="number"
          min="0"
          step="1"
          value="${capacity > 0 ? capacity : ''}"
          placeholder="optional"
          data-box-capacity-id="${box.id}"
        >
        <button type="button" class="btn-save-box-capacity" data-box-id="${box.id}">Save</button>
      `;
      card.appendChild(capacityEditor);

      if (capacity > 0 && Number(box.sample_count) > capacity) {
        const warning = document.createElement('div');
        warning.className = 'small box-capacity-warning';
        warning.textContent = `Over capacity by ${Number(box.sample_count) - capacity} tubes.`;
        card.appendChild(warning);
      }

      const samples = queryAll(`
        SELECT sample_id, status, date, species_genotype, model, tissue, sample_type, processing, project
        FROM samples
        WHERE box_id = ?
          AND (status IS NULL OR status NOT IN ('archived','retired','discarded','consumed','deleted'))
        ORDER BY date ASC, sample_id ASC;
      `, [box.id]);

      let listWrapper = null;
      if (samples.length > 0) {
        listWrapper = document.createElement('div');
        const ul = document.createElement('ul');
        ul.className = 'box-sample-list';

        samples.forEach(s => {
          const li = document.createElement('li');

          const main = document.createElement('span');
          main.className = 'sample-main';
          main.textContent = s.sample_id || '';
          li.appendChild(main);

          if (s.status) {
            const statusSpan = document.createElement('span');
            let cls = 'tag sample-status';
            const statusLower = String(s.status).toLowerCase();

            if (statusLower.startsWith('available')) {
              cls += ' tag-available';
            } else if (statusLower.startsWith('low')) {
              cls += ' tag-low';
            }

            statusSpan.className = cls;
            statusSpan.textContent = s.status;
            li.appendChild(statusSpan);
          }

          const metaParts1 = [];
          if (s.date) metaParts1.push(s.date);
          if (s.species_genotype) metaParts1.push(s.species_genotype);
          if (s.model) metaParts1.push(s.model);
          if (metaParts1.length) {
            const meta1 = document.createElement('span');
            meta1.className = 'sample-meta';
            meta1.textContent = metaParts1.join(' · ');
            li.appendChild(meta1);
          }

          const metaParts2 = [];
          if (s.tissue) metaParts2.push(s.tissue);
          if (s.sample_type) metaParts2.push(s.sample_type);
          if (s.processing) metaParts2.push(s.processing);
          if (metaParts2.length) {
            const meta2 = document.createElement('span');
            meta2.className = 'sample-meta';
            meta2.textContent = metaParts2.join(' · ');
            li.appendChild(meta2);
          }

          if (s.project) {
            const projSpan = document.createElement('span');
            projSpan.className = 'tag sample-status';
            projSpan.textContent = s.project;
            li.appendChild(projSpan);
          }

          ul.appendChild(li);
        });

        listWrapper.appendChild(ul);
        card.appendChild(listWrapper);
      }

      if (toggleBtn && listWrapper) {
        listWrapper.style.display = 'none';
        toggleBtn.textContent = `Show samples (${box.sample_count})`;

        toggleBtn.addEventListener('click', () => {
          const hidden = listWrapper.style.display === 'none';
          listWrapper.style.display = hidden ? 'block' : 'none';
          toggleBtn.textContent = hidden
            ? `Hide samples (${box.sample_count})`
            : `Show samples (${box.sample_count})`;
        });
      }

      grid.appendChild(card);
    });

    groupDiv.appendChild(grid);
    container.appendChild(groupDiv);
  });

  container.querySelectorAll('.btn-save-box-capacity').forEach(btn => {
    btn.addEventListener('click', () => {
      const boxId = parseInt(btn.getAttribute('data-box-id'), 10);
      const input = container.querySelector(`[data-box-capacity-id="${boxId}"]`);
      const rawValue = input?.value || '';
      const capacity = rawValue.trim() === '' ? null : parseInt(rawValue, 10);

      if (rawValue.trim() !== '' && (!Number.isFinite(capacity) || capacity < 0)) {
        alert('Capacity must be empty or a non-negative number.');
        return;
      }

      withTransaction(() => {
        runSql('UPDATE boxes SET capacity = ? WHERE id = ?;', [capacity, boxId]);
      });

      makeDbDirty();
      renderBoxes();
    });
  });
}
