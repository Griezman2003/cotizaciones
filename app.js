(() => {
  const $ = id => document.getElementById(id);
  const KEYS = { 
    user: 'partflow_user_v1', 
    session: 'partflow_session_v1', 
    records: 'partflow_records_v1' 
  };

  const getUser = () => { try { return JSON.parse(localStorage.getItem(KEYS.user)); } catch { return null; } };
  const isSessionActive = localStorage.getItem(KEYS.session) === 'true';
  const user = getUser();

  const path = window.location.pathname;
  const isLoginPage = Boolean($('authView'));
  const isDeniedPage = path.endsWith('acceso-denegado.html') || path.includes('acceso-denegado');

  if (!isLoginPage && !isDeniedPage && (!user || !isSessionActive)) {
    window.location.replace('acceso-denegado.html');
    return;
  }
  // ==========================================================

  let records = [];
  const PAGE_SIZE = 10;
  let cotizPage = 1, pedidosPage = 1, mlPage = 1;
  let weeklyChartInstance = null;

  const getLocalDateString = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const todayStr = getLocalDateString(new Date());

  const getRecords = () => { try { const x = JSON.parse(localStorage.getItem(KEYS.records) || '[]'); return Array.isArray(x) ? x : []; } catch { return []; } };
  const saveRecords = () => localStorage.setItem(KEYS.records, JSON.stringify(records));

  records = getRecords();

  const sidebar = $('sidebar'), overlay = $('sidebarOverlay');
  let isCollapsed = true;

  if ($('collapseBtn')) {
    $('collapseBtn').onclick = () => {
      isCollapsed = !isCollapsed;
      if (window.innerWidth >= 1024) {
        if (isCollapsed) {
          sidebar.classList.remove('w-64'); sidebar.classList.add('w-20');
          document.querySelectorAll('.sidebar-text').forEach(el => el.classList.add('hidden'));
        } else {
          sidebar.classList.remove('w-20'); sidebar.classList.add('w-64');
          document.querySelectorAll('.sidebar-text').forEach(el => el.classList.remove('hidden'));
        }
      } else {
        sidebar.classList.toggle('-translate-x-full');
        if (overlay) overlay.classList.toggle('hidden');
      }
    };
  }

  if ($('mobileToggle')) {
    $('mobileToggle').onclick = () => { sidebar.classList.remove('-translate-x-full'); if (overlay) overlay.classList.remove('hidden'); };
  }
  if (overlay) {
    overlay.onclick = () => { sidebar.classList.add('-translate-x-full'); overlay.classList.add('hidden'); };
  }

  if ($('authView')) {
    if (!user || !isSessionActive) {
      $('authView').classList.remove('hidden');
      if ($('appView')) $('appView').classList.add('hidden');
      if (user && $('loginUser')) {
        $('loginUser').value = user.username;
      }
    } else {
      $('authView').classList.add('hidden');
      if ($('appView')) $('appView').classList.remove('hidden');
      if ($('welcomeUser')) $('welcomeUser').textContent = user.username;
      if ($('userInitial')) $('userInitial').textContent = user.username.charAt(0).toUpperCase();
      initDashboard();
    }

    if ($('showRegister')) $('showRegister').onclick = () => { $('loginForm').classList.add('hidden'); $('registerForm').classList.remove('hidden'); };
    if ($('showLogin')) $('showLogin').onclick = () => { $('registerForm').classList.add('hidden'); $('loginForm').classList.remove('hidden'); };

    if ($('doRegister')) {
      $('doRegister').addEventListener('submit', e => {
        e.preventDefault();
        if ($('newPin').value !== $('confirmPin').value) { $('registerError').textContent = 'Las contraseñas no coinciden.'; return; }
        const newUserObj = { username: $('newUser').value.trim(), pin: $('newPin').value };
        localStorage.setItem(KEYS.user, JSON.stringify(newUserObj));
        localStorage.setItem(KEYS.session, 'true');
        location.reload();
      });
    }

    if ($('doLogin')) {
      $('doLogin').addEventListener('submit', e => {
        e.preventDefault();
        const u = getUser();
        if (!u || $('loginUser').value.trim() !== u.username || $('loginPin').value !== u.pin) {
          $('loginError').textContent = 'Usuario o contraseña incorrectos.'; return;
        }
        localStorage.setItem(KEYS.session, 'true');
        location.reload();
      });
    }
  }

  if (user && $('welcomeUser')) {
    $('welcomeUser').textContent = user.username;
    if ($('userInitial')) $('userInitial').textContent = user.username.charAt(0).toUpperCase();
  }

  if ($('logout')) {
    $('logout').onclick = () => {
      localStorage.removeItem(KEYS.session);
      window.location.replace('index.html');
    };
  }

  if ($('cotizForm')) {
    const opDatePicker = flatpickr("#operationDate", { locale: "es", defaultDate: todayStr, dateFormat: "Y-m-d" });
    opDatePicker.setDate(todayStr, true);

    $('cotizForm').addEventListener('submit', e => {
      e.preventDefault();
      const key = $('key').value.trim().toUpperCase();
      const entity = $('entity').value.trim().toUpperCase();
      const minutes = Number($('minutes').value);
      const opDate = $('operationDate').value || todayStr;

      if (!Number.isFinite(minutes) || minutes <= 0) { $('entryError').textContent = 'Ingresa un tiempo válido.'; return; }

      const newRecord = {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        type: 'Cotización',
        key,
        entity,
        minutes,
        date: opDate
      };

      records.unshift(newRecord);
      saveRecords();
      $('key').value = ''; $('entity').value = ''; $('minutes').value = ''; $('entryError').textContent = '';
      opDatePicker.setDate(todayStr, true);
      cotizPage = 1;
      renderCotizaciones();
    });

    if ($('prevCotiz')) $('prevCotiz').onclick = () => { if (cotizPage > 1) { cotizPage--; renderCotizaciones(); } };
    if ($('nextCotiz')) $('nextCotiz').onclick = () => { cotizPage++; renderCotizaciones(); };

    renderCotizaciones();
  }

  function renderCotizaciones() {
    const cotizList = records.filter(r => r.type === 'Cotización');
    const totalPages = Math.ceil(cotizList.length / PAGE_SIZE) || 1;
    if (cotizPage > totalPages) cotizPage = totalPages;
    const start = (cotizPage - 1) * PAGE_SIZE;
    const toRender = cotizList.slice(start, start + PAGE_SIZE);

    if ($('cotizPageInfo')) $('cotizPageInfo').textContent = `Página ${cotizPage} de ${totalPages}`;
    if ($('prevCotiz')) $('prevCotiz').disabled = cotizPage === 1;
    if ($('nextCotiz')) $('nextCotiz').disabled = cotizPage >= totalPages;

    const tbody = $('cotizBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if ($('emptyCotiz')) $('emptyCotiz').classList.toggle('hidden', cotizList.length > 0);

    toRender.forEach(r => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-800/40 transition-colors';
      tr.innerHTML = `
        <td class="p-3.5 text-slate-300">${r.date || todayStr}</td>
        <td class="p-3.5 font-medium text-white uppercase">${r.key}</td>
        <td class="p-3.5 text-slate-300 uppercase">${r.entity || ''}</td>
        <td class="p-3.5 text-brand-400 font-semibold">${Number(r.minutes).toFixed(1)} min</td>
      `;
      const tdAction = document.createElement('td'); tdAction.className = 'p-3.5 text-right';
      const del = document.createElement('button');
      del.className = 'px-2.5 py-1 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 border border-rose-500/30 rounded-lg transition';
      del.textContent = 'Eliminar';
      del.onclick = () => {
        if (confirm('¿Eliminar esta cotización?')) {
          records = records.filter(x => x.id !== r.id);
          saveRecords();
          renderCotizaciones();
        }
      };
      tdAction.appendChild(del);
      tr.appendChild(tdAction);
      tbody.appendChild(tr);
    });
  }

  if ($('pedidoForm')) {
    const opDatePicker = flatpickr("#operationDate", { locale: "es", defaultDate: todayStr, dateFormat: "Y-m-d" });
    opDatePicker.setDate(todayStr, true);
    const arrivalDatePicker = flatpickr("#arrivalDate", { locale: "es", defaultDate: todayStr, dateFormat: "Y-m-d" });
    arrivalDatePicker.setDate(todayStr, true);

    $('pedidoForm').addEventListener('submit', e => {
      e.preventDefault();
      const newRecord = {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        type: 'Pedido especial',
        key: $('key').value.trim().toUpperCase(),
        description: $('description').value.trim().toUpperCase(),
        branch: $('branch').value.trim().toUpperCase(),
        attention: $('attention').value.trim().toUpperCase(),
        date: $('operationDate').value || todayStr,
        arrivalDate: $('arrivalDate').value,
        supplier: $('supplier').value.trim().toUpperCase(),
        folio: $('folio').value.trim().toUpperCase(),
        responsible: $('responsible').value.trim().toUpperCase(),
        status: $('status').value.trim().toUpperCase(),
        ticket: $('ticket').value.trim().toUpperCase(),
        comment: $('comment').value.trim().toUpperCase()
      };

      records.unshift(newRecord);
      saveRecords();

      ['key', 'description', 'branch', 'attention', 'supplier', 'folio', 'responsible', 'status', 'ticket', 'comment'].forEach(id => {
        if ($(id)) $(id).value = '';
      });
      opDatePicker.setDate(todayStr, true);
      arrivalDatePicker.setDate(todayStr, true);
      pedidosPage = 1;
      renderPedidos();
    });

    if ($('prevPedidos')) $('prevPedidos').onclick = () => { if (pedidosPage > 1) { pedidosPage--; renderPedidos(); } };
    if ($('nextPedidos')) $('nextPedidos').onclick = () => { pedidosPage++; renderPedidos(); };

    renderPedidos();
  }

  function renderPedidos() {
    const pedidosList = records.filter(r => r.type === 'Pedido especial');
    const totalPages = Math.ceil(pedidosList.length / PAGE_SIZE) || 1;
    if (pedidosPage > totalPages) pedidosPage = totalPages;
    const start = (pedidosPage - 1) * PAGE_SIZE;
    const toRender = pedidosList.slice(start, start + PAGE_SIZE);

    if ($('pedidosPageInfo')) $('pedidosPageInfo').textContent = `Página ${pedidosPage} de ${totalPages}`;
    if ($('prevPedidos')) $('prevPedidos').disabled = pedidosPage === 1;
    if ($('nextPedidos')) $('nextPedidos').disabled = pedidosPage >= totalPages;

    const tbody = $('pedidosBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if ($('emptyPedidos')) $('emptyPedidos').classList.toggle('hidden', pedidosList.length > 0);

    toRender.forEach(r => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-800/40 transition-colors';
      tr.innerHTML = `
        <td class="p-3 font-medium text-white uppercase">${r.key || ''}</td>
        <td class="p-3 text-slate-300 uppercase">${r.description || ''}</td>
        <td class="p-3 text-slate-300 uppercase">${r.branch || ''}</td>
        <td class="p-3 text-slate-300 uppercase">${r.attention || ''}</td>
        <td class="p-3 text-slate-300">${r.date || todayStr}</td>
        <td class="p-3 text-emerald-400 font-medium">${r.arrivalDate || ''}</td>
        <td class="p-3 text-slate-300 uppercase">${r.supplier || ''}</td>
        <td class="p-3 text-slate-300 uppercase">${r.folio || ''}</td>
        <td class="p-3 text-slate-300 uppercase">${r.responsible || ''}</td>
        <td class="p-3 text-slate-300 uppercase">${r.status || ''}</td>
        <td class="p-3 text-slate-300 uppercase">${r.ticket || ''}</td>
        <td class="p-3 text-slate-300 uppercase">${r.comment || ''}</td>
      `;

      const tdAction = document.createElement('td'); tdAction.className = 'p-3 text-right';
      const del = document.createElement('button');
      del.className = 'px-2.5 py-1 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 border border-rose-500/30 rounded-lg transition';
      del.textContent = 'Eliminar';
      del.onclick = () => {
        if (confirm('¿Eliminar pedido?')) {
          records = records.filter(x => x.id !== r.id);
          saveRecords();
          renderPedidos();
        }
      };
      tdAction.appendChild(del); tr.appendChild(tdAction); tbody.appendChild(tr);
    });
  }

  if ($('mlForm')) {
    $('mlForm').addEventListener('submit', e => {
      e.preventDefault();
      const mlLink = $('mlUrlInput').value.trim();
      const newRecord = {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        type: 'Pedido Mercado Libre',
        date: todayStr,
        mlLink
      };

      records.unshift(newRecord);
      saveRecords();
      $('mlUrlInput').value = '';
      mlPage = 1;
      renderMl();
    });

    if ($('prevMl')) $('prevMl').onclick = () => { if (mlPage > 1) { mlPage--; renderMl(); } };
    if ($('nextMl')) $('nextMl').onclick = () => { mlPage++; renderMl(); };

    renderMl();
  }

  function renderMl() {
    const mlList = records.filter(r => r.type === 'Pedido Mercado Libre');
    const totalPages = Math.ceil(mlList.length / PAGE_SIZE) || 1;
    if (mlPage > totalPages) mlPage = totalPages;
    const start = (mlPage - 1) * PAGE_SIZE;
    const toRender = mlList.slice(start, start + PAGE_SIZE);

    if ($('mlViewPageInfo')) $('mlViewPageInfo').textContent = `Página ${mlPage} de ${totalPages}`;
    if ($('prevMl')) $('prevMl').disabled = mlPage === 1;
    if ($('nextMl')) $('nextMl').disabled = mlPage >= totalPages;

    const tbody = $('mlTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if ($('emptyMlView')) $('emptyMlView').classList.toggle('hidden', mlList.length > 0);

    toRender.forEach(r => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-800/40 transition-colors';
      tr.innerHTML = `<td class="p-3.5 text-slate-300">${r.date || todayStr}</td><td class="p-3.5"><a href="${r.mlLink}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-400 hover:bg-sky-500/20 font-semibold transition">🔗 Abrir enlace</a></td>`;

      const tdAction = document.createElement('td'); tdAction.className = 'p-3.5 text-right';
      const del = document.createElement('button');
      del.className = 'px-2.5 py-1 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 border border-rose-500/30 rounded-lg transition';
      del.textContent = 'Eliminar';
      del.onclick = () => {
        if (confirm('¿Eliminar enlace?')) {
          records = records.filter(x => x.id !== r.id);
          saveRecords();
          renderMl();
        }
      };
      tdAction.appendChild(del); tr.appendChild(tdAction); tbody.appendChild(tr);
    });
  }

  function initDashboard() {
    const cotizList = records.filter(r => r.type === 'Cotización');

    const firstDayMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
    const defaultStart = firstDayMonth;
    const defaultEnd = todayStr;

    updateDashboardMetrics(cotizList, defaultStart, defaultEnd);

    flatpickr("#reportRangeSelector", {
      mode: "range", locale: "es", dateFormat: "Y-m-d", defaultDate: [defaultStart, defaultEnd],
      onChange: function(selectedDates, dateStr, instance) {
        if (selectedDates.length === 2) {
          const start = instance.formatDate(selectedDates[0], "Y-m-d");
          const end = instance.formatDate(selectedDates[1], "Y-m-d");
          updateDashboardMetrics(cotizList, start, end);
          $('weeklyRangeTitle').textContent = `Rango personalizado (${start} al ${end})`;
        }
      }
    });

    if ($('exportBtn')) {
      $('exportBtn').onclick = () => {
        const cotiz = records.filter(r => r.type === 'Cotización');
        const pedidos = records.filter(r => r.type === 'Pedido especial');
        const ml = records.filter(r => r.type === 'Pedido Mercado Libre');

        if (cotiz.length) downloadJson(cotiz, 'cotizaciones.json');
        if (pedidos.length) downloadJson(pedidos, 'pedidos-especiales.json');
        if (ml.length) downloadJson(ml, 'mercado-libre.json');
        alert('Archivos JSON exportados correctamente con todos los campos actualizados.');
      };
    }

    if ($('importFile')) {
      $('importFile').onchange = async e => {
        const files = e.target.files;
        if (!files.length) return;
        let all = [...records];
        for (let f of files) {
          try {
            const json = JSON.parse(await f.text());
            const incoming = Array.isArray(json) ? json : (json.records || []);
            incoming.forEach(inc => {
              const existingIndex = all.findIndex(r => r.id === inc.id);
              if (existingIndex !== -1) {
                all[existingIndex] = { ...all[existingIndex], ...inc };
              } else {
                all.push(inc);
              }
            });
          } catch (err) { console.error(err); }
        }
        records = all; saveRecords(); alert('¡Importación completada exitosamente!'); location.reload();
      };
    }

    if ($('purgeBtn')) {
      $('purgeBtn').onclick = () => {
        if (confirm('¿Estás seguro de eliminar todos los registros guardados?')) {
          records = [];
          saveRecords();
          alert('¡Se han borrado todos los registros exitosamente!');
          location.reload();
        }
      };
    }

    if ($('downloadReportImg')) {
      $('downloadReportImg').onclick = async () => {
        const canvas = await html2canvas($('weeklyReportCapture'), { backgroundColor: '#0f172a', scale: 2 });
        const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = 'reporte-estadistico.png'; a.click();
      };
    }
  }

  function updateDashboardMetrics(cotizList, startDate, endDate) {
    const periodCotiz = cotizList.filter(r => {
      const d = r.date || todayStr;
      return d >= startDate && d <= endDate;
    });

    const N = periodCotiz.length;
    const suma = periodCotiz.reduce((acc, r) => acc + Number(r.minutes), 0);
    const promedio = N > 0 ? suma / N : 0;
    const varianza = N > 0 ? periodCotiz.reduce((acc, r) => acc + Math.pow(Number(r.minutes) - promedio, 2), 0) / N : 0;
    const desvStd = Math.sqrt(varianza);

    if ($('statN')) $('statN').textContent = N;
    if ($('statSum')) $('statSum').textContent = suma.toFixed(1) + ' min';
    if ($('statMean')) $('statMean').textContent = promedio.toFixed(2) + ' min';
    if ($('statVariance')) $('statVariance').textContent = varianza.toFixed(2);
    if ($('statStdDev')) $('statStdDev').textContent = desvStd.toFixed(2);

    if ($('weeklyRangeTitle')) {
      $('weeklyRangeTitle').textContent = `Mes en curso (${startDate} al ${endDate})`;
    }

    const explanationBox = $('chartExplanationBox');
    if (explanationBox) {
      const highValues = [...new Set(periodCotiz.map(r => Number(r.minutes)))]
        .filter(m => m > (promedio + desvStd))
        .sort((a, b) => a - b);
      
      const highStr = highValues.length > 0 ? highValues.join(', ') + ' min' : 'ninguno';

      explanationBox.innerHTML = `
        <p>- La desviación estándar de los <strong>${N}</strong> datos es <strong>${desvStd.toFixed(2)} min</strong></p>
        <p>- Esto indica que, en términos generales, los datos se encuentran aproximadamente a <strong>${desvStd.toFixed(2)} min</strong> de distancia de la media (<strong>${promedio.toFixed(2)} min</strong>).</p>
        <p>- En resumen: <strong>${desvStd.toFixed(2)} min</strong> es una dispersión ${desvStd > 5 ? 'considerable' : 'moderada'} ya que varios valores están alejados del promedio: <strong>${highStr}</strong>.</p>
      `;
    }

    renderReport(periodCotiz, promedio, desvStd);
    renderExcelDaysTables(periodCotiz, promedio);
  }

  function renderExcelDaysTables(periodCotiz, globalMean) {
    const container = $('excelTablesContainer');
    if (!container) return;
    container.innerHTML = '';

    if (periodCotiz.length === 0) {
      container.innerHTML = '<div class="text-center text-slate-500 py-6 text-sm">No hay registros de cotizaciones en este rango de fechas.</div>';
      return;
    }

    const groupedByDate = {};
    periodCotiz.forEach(r => {
      const d = r.date || todayStr;
      if (!groupedByDate[d]) groupedByDate[d] = [];
      groupedByDate[d].push(r);
    });

    const sortedDates = Object.keys(groupedByDate).sort();

    sortedDates.forEach(date => {
      const items = groupedByDate[date];
      const daySum = items.reduce((acc, r) => acc + Number(r.minutes), 0);
      const dayMean = items.length > 0 ? daySum / items.length : 0;

      const card = document.createElement('div');
      card.className = 'bg-slate-950 border border-slate-800 rounded-xl overflow-hidden p-4 space-y-3';

      let html = `
        <div class="flex items-center justify-between border-b border-slate-800 pb-2">
          <span class="text-xs font-bold uppercase text-brand-400"><i class="fa-solid fa-calendar-day mr-1.5"></i> Fecha: ${date}</span>
          <span class="text-xs text-slate-400">Cotizaciones: <strong>${items.length}</strong> | Suma: <strong>${daySum.toFixed(1)} min</strong> | Promedio día: <strong class="text-brand-400">${dayMean.toFixed(1)} min</strong></span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="bg-slate-900 border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                <th class="p-2.5">N</th>
                <th class="p-2.5">Clave (xi ref)</th>
                <th class="p-2.5">Entidad</th>
                <th class="p-2.5">Minutos (xi)</th>
                <th class="p-2.5">Media (x̄)</th>
                <th class="p-2.5">Desviación (xi - x̄)</th>
                <th class="p-2.5">Cuadrático ((xi - x̄)²)</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/40">
      `;

      items.forEach((r, idx) => {
        const xi = Number(r.minutes);
        const diff = xi - globalMean;
        const diffSq = Math.pow(diff, 2);
        html += `
          <tr class="hover:bg-slate-900/50 transition">
            <td class="p-2.5 text-slate-400 font-mono">${idx + 1}</td>
            <td class="p-2.5 text-white font-semibold uppercase">${r.key}</td>
            <td class="p-2.5 text-slate-300 uppercase">${r.entity || ''}</td>
            <td class="p-2.5 text-brand-400 font-bold">${xi.toFixed(1)} min</td>
            <td class="p-2.5 text-slate-300">${globalMean.toFixed(2)}</td>
            <td class="p-2.5 text-slate-300">${diff.toFixed(2)}</td>
            <td class="p-2.5 text-slate-400 font-mono">${diffSq.toFixed(2)}</td>
          </tr>
        `;
      });

      html += `
            </tbody>
          </table>
        </div>
      `;
      card.innerHTML = html;
      container.appendChild(card);
    });
  }

  function renderReport(periodCotiz, globalMean, globalStd) {
    if (!$('weeklyChart')) return;

    if (periodCotiz.length === 0) {
      if (weeklyChartInstance) { weeklyChartInstance.destroy(); weeklyChartInstance = null; }
      return;
    }

    const sortedCotiz = [...periodCotiz].sort((a, b) => (a.date || todayStr).localeCompare(b.date || todayStr));

    const chartLabels = sortedCotiz.map((r, idx) => `#${idx + 1} (${r.key || 'N/A'})`);
    const chartData = sortedCotiz.map(r => Number(Number(r.minutes).toFixed(1)));
    const meanLineData = sortedCotiz.map(() => Number(globalMean.toFixed(1)));

    const ctx = $('weeklyChart').getContext('2d');
    if (weeklyChartInstance) weeklyChartInstance.destroy();
    weeklyChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: chartLabels,
        datasets: [
          { 
            label: 'Cotización Individual (xi min)', 
            data: chartData, 
            borderColor: '#4ce0a0', 
            backgroundColor: '#4ce0a0', 
            borderWidth: 2, 
            pointRadius: 4,
            tension: 0.1 
          },
          { 
            label: 'Media Global (x̄)', 
            data: meanLineData, 
            borderColor: '#38bdf8', 
            borderDash: [5, 5], 
            borderWidth: 1.5, 
            pointRadius: 0 
          }
        ]
      },
      options: { 
        responsive: true, 
        maintainAspectRatio: false, 
        plugins: { 
          legend: { labels: { color: '#cbd5e1' } },
          tooltip: {
            callbacks: {
              title: function(context) {
                const index = context[0].dataIndex;
                const item = sortedCotiz[index];
                return `Fecha: ${item.date || todayStr} | Clave: ${item.key} | Entidad: ${item.entity || 'N/A'}`;
              },
              afterBody: function() {
                return `Desv. Estándar Global (s): ${globalStd.toFixed(2)} min`;
              }
            }
          }
        }, 
        scales: { 
          x: { ticks: { color: '#94a3b8', maxTicksLimit: 15 } }, 
          y: { beginAtZero: true, ticks: { color: '#94a3b8' } } 
        } 
      }
    });
  }

  function downloadJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
  }

  (function() {
    const line1Text = "Autopartes, Toro";
    const line2Text = " Dept. Cotizaciones.";
    const typingSpeed = 100, erasingSpeed = 60, pauseTime = 2000;

    function iniciarEfectoTypewriter() {
      const elLine1 = document.getElementById('typedLine1');
      const elLine2 = document.getElementById('typedLine2');
      if (!elLine1 || !elLine2) return;

      let i = 0, j = 0, isDeleting = false;
      function loop() {
        if (!isDeleting && i <= line1Text.length) {
          elLine1.textContent = line1Text.substring(0, i); i++; setTimeout(loop, typingSpeed);
        } else if (!isDeleting && j <= line2Text.length) {
          elLine2.textContent = line2Text.substring(0, j); j++; setTimeout(loop, typingSpeed);
        } else if (!isDeleting && i > line1Text.length && j > line2Text.length) {
          isDeleting = true; setTimeout(loop, pauseTime);
        } else if (isDeleting && j > 0) {
          j--; elLine2.textContent = line2Text.substring(0, j); setTimeout(loop, erasingSpeed);
        } else if (isDeleting && i > 0) {
          i--; elLine1.textContent = line1Text.substring(0, i); setTimeout(loop, erasingSpeed);
        } else if (isDeleting && i === 0 && j === 0) {
          isDeleting = false; setTimeout(loop, 500);
        }
      }
      loop();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciarEfectoTypewriter);
    else iniciarEfectoTypewriter();
  })();
    
})();