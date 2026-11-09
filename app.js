(() => {
  const $ = id => document.getElementById(id);
  const KEYS = { user:'partflow_user_v1', records:'partflow_records_v1' };
  let records = [];
  let weeklyChartInstance = null;
  let reportRangePicker = null;
  
  // Paginación fija de máximo 10 elementos por página
  const PAGE_SIZE = 10;
  let cotizPage = 1;
  let pedidosPage = 1;
  let mlPage = 1;

  let isSidebarCollapsed = false;

  const getLocalDateString = (d = new Date()) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const todayStr = getLocalDateString(new Date());

  let startDateFilter = todayStr;
  let endDateFilter = todayStr;
  let reportStart = todayStr;
  let reportEnd = todayStr;

  const operationDatePicker = flatpickr("#operationDate", { locale: "es", defaultDate: todayStr, dateFormat: "Y-m-d" });
  operationDatePicker.setDate(todayStr, true);
  
  const arrivalDatePicker = flatpickr("#arrivalDate", { locale: "es", defaultDate: todayStr, dateFormat: "Y-m-d" });
  arrivalDatePicker.setDate(todayStr, true);
  
  const rangePicker = flatpickr("#rangePicker", {
    mode: "range", locale: "es", dateFormat: "Y-m-d", defaultDate: [todayStr, todayStr], 
    onClose: function(selectedDates, dateStr, instance) {
      if (selectedDates.length === 2) {
        startDateFilter = instance.formatDate(selectedDates[0], "Y-m-d");
        endDateFilter = instance.formatDate(selectedDates[1], "Y-m-d");
      } else if (selectedDates.length === 1) {
        startDateFilter = instance.formatDate(selectedDates[0], "Y-m-d");
        endDateFilter = startDateFilter;
      } else {
        startDateFilter = ''; endDateFilter = '';
      }
      cotizPage = 1; pedidosPage = 1;
      render();
    }
  });
  rangePicker.setDate([todayStr, todayStr], true);

  reportRangePicker = flatpickr("#reportRangeSelector", {
    mode: "range", locale: "es", dateFormat: "Y-m-d", defaultDate: [todayStr, todayStr],
    onChange: function(selectedDates, dateStr, instance) {
      if (selectedDates.length === 2) {
        reportStart = instance.formatDate(selectedDates[0], "Y-m-d");
        reportEnd = instance.formatDate(selectedDates[1], "Y-m-d");
        $('weeklyRangeTitle').textContent = `Del ${reportStart} al ${reportEnd}`;
        renderReport(reportStart, reportEnd);
      } else if (selectedDates.length === 1) {
        reportStart = instance.formatDate(selectedDates[0], "Y-m-d");
        reportEnd = reportStart;
        $('weeklyRangeTitle').textContent = `Día ${reportStart}`;
        renderReport(reportStart, reportEnd);
      }
    }
  });

  // Sidebar Colapsable
  const sidebar = $('sidebar');
  const overlay = $('sidebarOverlay');

  $('collapseBtn').onclick = () => {
    isSidebarCollapsed = !isSidebarCollapsed;
    if (window.innerWidth >= 1024) {
      if (isSidebarCollapsed) {
        sidebar.classList.remove('w-64'); sidebar.classList.add('w-20');
        document.querySelectorAll('.sidebar-text').forEach(el => el.classList.add('hidden'));
      } else {
        sidebar.classList.remove('w-20'); sidebar.classList.add('w-64');
        document.querySelectorAll('.sidebar-text').forEach(el => el.classList.remove('hidden'));
      }
    } else {
      sidebar.classList.add('-translate-x-full'); overlay.classList.add('hidden');
    }
  };

  $('mobileToggle').onclick = () => { sidebar.classList.remove('-translate-x-full'); overlay.classList.remove('hidden'); };
  overlay.onclick = () => { sidebar.classList.add('-translate-x-full'); overlay.classList.add('hidden'); };

  $('navDashboard').onclick = () => {
    $('viewDashboard').classList.remove('hidden'); $('viewMl').classList.add('hidden');
    $('navDashboard').className = "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-brand-400 bg-brand-400/10 border border-brand-400/30 transition text-left";
    $('navMl').className = "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800/50 transition text-left";
    if (window.innerWidth < 1024) { sidebar.classList.add('-translate-x-full'); overlay.classList.add('hidden'); }
  };

  $('navMl').onclick = () => {
    $('viewMl').classList.remove('hidden'); $('viewDashboard').classList.add('hidden');
    $('navMl').className = "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-sky-400 bg-sky-400/10 border border-sky-400/30 transition text-left";
    $('navDashboard').className = "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800/50 transition text-left";
    renderMlView();
    if (window.innerWidth < 1024) { sidebar.classList.add('-translate-x-full'); overlay.classList.add('hidden'); }
  };

  $('type').onchange = (e) => {
    const val = e.target.value;
    $('cotizacionFields').classList.toggle('hidden', val !== 'Cotización');
    $('pedidoFields').classList.toggle('hidden', val !== 'Pedido especial');
    $('minutes').required = (val === 'Cotización');
    $('description').required = (val === 'Pedido especial');
    $('supplier').required = (val === 'Pedido especial');
    $('responsible').required = (val === 'Pedido especial');
  };

  const getUser = () => { try { return JSON.parse(localStorage.getItem(KEYS.user)); } catch { return null; } };
  const getRecords = () => { try { const x = JSON.parse(localStorage.getItem(KEYS.records)||'[]'); return Array.isArray(x) ? x : []; } catch { return []; } };
  const saveRecords = () => localStorage.setItem(KEYS.records, JSON.stringify(records));
  const show = id => $(id).classList.remove('hidden');
  const hide = id => $(id).classList.add('hidden');

  $('showRegister').onclick = () => { hide('loginForm'); show('registerForm'); $('registerError').textContent=''; };
  $('showLogin').onclick = () => { hide('registerForm'); show('loginForm'); $('loginError').textContent=''; };

  $('doRegister').addEventListener('submit', e => {
    e.preventDefault();
    const username = $('newUser').value.trim(), pin = $('newPin').value, confirm = $('confirmPin').value;
    if (pin !== confirm) { $('registerError').textContent = 'Las contraseñas no coinciden.'; return; }
    if (getUser()) { $('registerError').textContent = 'Ya existe un acceso local. Inicia sesión.'; return; }
    localStorage.setItem(KEYS.user, JSON.stringify({username, pin}));
    $('loginUser').value = username; $('loginPin').value = pin;
    $('doRegister').requestSubmit();
  });

  $('doLogin').addEventListener('submit', e => {
    e.preventDefault();
    const user = getUser();
    if (!user) { $('loginError').textContent = 'Primero crea tu acceso local.'; return; }
    if ($('loginUser').value.trim() !== user.username || $('loginPin').value !== user.pin) { $('loginError').textContent = 'Usuario o contraseña incorrectos.'; return; }
    openApp(user.username);
  });

  function openApp(username) {
    records = getRecords();
    $('welcomeUser').textContent = username; $('userInitial').textContent = username.charAt(0).toUpperCase();
    hide('authView'); show('appView');
    render();
  }
  
  $('logout').onclick = () => { hide('appView'); show('authView'); $('loginPin').value=''; };
  
  $('entryForm').addEventListener('submit', e => {
    e.preventDefault();
    const type = $('type').value;
    const key = $('key').value.trim().toUpperCase();
    const opDate = $('operationDate').value || todayStr;
    
    let newRecord = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), type, key, date: opDate };

    if (type === 'Cotización') {
      const minutes = Number($('minutes').value);
      if (!Number.isFinite(minutes) || minutes <= 0) { $('entryError').textContent = 'Ingresa un tiempo mayor que cero.'; return; }
      newRecord.minutes = minutes;
    } else {
      newRecord.description = $('description').value.trim().toUpperCase();
      newRecord.supplier = $('supplier').value.trim().toUpperCase();
      newRecord.arrivalDate = $('arrivalDate').value;
      newRecord.responsible = $('responsible').value.trim().toUpperCase();
      newRecord.completed = false;
    }

    records.unshift(newRecord);
    saveRecords();
    
    $('key').value = ''; $('minutes').value = ''; $('description').value = ''; $('supplier').value = ''; $('responsible').value = '';
    $('entryError').textContent = '';
    operationDatePicker.setDate(todayStr, true);

    cotizPage = 1; pedidosPage = 1;
    render();
  });

  $('mlForm').addEventListener('submit', e => {
    e.preventDefault();
    const newRecord = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      type: 'Pedido Mercado Libre',
      date: todayStr,
      mlLink: $('mlUrlInput').value.trim()
    };

    records.unshift(newRecord);
    saveRecords();
    $('mlUrlInput').value = '';
    mlPage = 1;
    renderMlView();
    alert('¡Enlace de Mercado Libre guardado con éxito!');
  });

  // Botones de Paginación
  $('prevCotiz').onclick = () => { if (cotizPage > 1) { cotizPage--; render(); } };
  $('nextCotiz').onclick = () => { cotizPage++; render(); };

  $('prevPedidos').onclick = () => { if (pedidosPage > 1) { pedidosPage--; render(); } };
  $('nextPedidos').onclick = () => { pedidosPage++; render(); };

  $('prevMl').onclick = () => { if (mlPage > 1) { mlPage--; renderMlView(); } };
  $('nextMl').onclick = () => { mlPage++; renderMlView(); };

  // EXPORTAR CADA UNO EN SU PROPIO JSON
  $('exportBtn').onclick = () => {
    const filtered = records.filter(r => {
      const recordDate = r.date || todayStr;
      if (startDateFilter && recordDate < startDateFilter) return false;
      if (endDateFilter && recordDate > endDateFilter) return false;
      return true;
    });

    if (filtered.length === 0) { alert('No hay registros en el rango seleccionado.'); return; }

    const cotizaciones = filtered.filter(r => r.type === 'Cotización');
    const pedidos = filtered.filter(r => r.type === 'Pedido especial');
    const mlList = filtered.filter(r => r.type === 'Pedido Mercado Libre');
    let exportedFiles = 0;

    if (cotizaciones.length > 0) {
      const data = { app: 'PartFlow', type: 'Cotizaciones', version: 31, exportedAt: new Date().toISOString(), records: cotizaciones };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = `cotizaciones-${startDateFilter}-al-${endDateFilter}.json`; a.click(); URL.revokeObjectURL(url);
      exportedFiles++;
    }

    if (pedidos.length > 0) {
      const data = { app: 'PartFlow', type: 'Pedidos Especiales', version: 31, exportedAt: new Date().toISOString(), records: pedidos };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = `pedidos-especiales-${startDateFilter}-al-${endDateFilter}.json`; a.click(); URL.revokeObjectURL(url);
      exportedFiles++;
    }

    if (mlList.length > 0) {
      const data = { app: 'PartFlow', type: 'Mercado Libre', version: 31, exportedAt: new Date().toISOString(), records: mlList };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = `mercado-libre-${startDateFilter}-al-${endDateFilter}.json`; a.click(); URL.revokeObjectURL(url);
      exportedFiles++;
    }

    if (exportedFiles > 0) {
      alert(`Se han exportado ${exportedFiles} archivo(s) JSON independientes con éxito.`);
    } else {
      alert('No hay registros en ninguna categoría para el rango seleccionado.');
    }
  };

  // EXPORTAR EXCEL (CSV) INDEPENDIENTE (Incluyendo Cotizaciones)
  $('exportExcelBtn').onclick = () => {
    const filtered = records.filter(r => {
      const recordDate = r.date || todayStr;
      if (startDateFilter && recordDate < startDateFilter) return false;
      if (endDateFilter && recordDate > endDateFilter) return false;
      return true;
    });

    if (filtered.length === 0) { alert('No hay registros en el rango seleccionado.'); return; }

    const cotizaciones = filtered.filter(r => r.type === 'Cotización');
    const pedidos = filtered.filter(r => r.type === 'Pedido especial');
    const mlList = filtered.filter(r => r.type === 'Pedido Mercado Libre');
    let exportCount = 0;

    if (cotizaciones.length > 0) {
      let csvCotiz = "\uFEFFFECHA,CLAVE,TIEMPO_MINUTOS\r\n";
      cotizaciones.forEach(r => { csvCotiz += `${r.date || todayStr},"${(r.key || '').replace(/"/g, '""')}",${r.minutes}\r\n`; });
      const blob = new Blob([csvCotiz], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = `cotizaciones-${startDateFilter}-al-${endDateFilter}.csv`; a.click(); URL.revokeObjectURL(url);
      exportCount++;
    }

    if (pedidos.length > 0) {
      let csvPedidos = "\uFEFFCLAVE,DESCRIPCION,PROVEEDOR,FECHA_PEDIDO,FECHA_LLEGADA,ATENDIDO,RESPONSABLE\r\n";
      pedidos.forEach(r => {
        csvPedidos += `"${(r.key || '').replace(/"/g, '""')}","${(r.description || '').replace(/"/g, '""')}","${(r.supplier || '').replace(/"/g, '""')}",${r.date || todayStr},${r.arrivalDate || ''},${r.completed ? 'SÍ' : 'NO'},"${(r.responsible || '').replace(/"/g, '""')}"\r\n`;
      });
      const blob = new Blob([csvPedidos], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = `pedidos-especiales-${startDateFilter}-al-${endDateFilter}.csv`; a.click(); URL.revokeObjectURL(url);
      exportCount++;
    }

    if (mlList.length > 0) {
      let csvMl = "\uFEFFFECHA,ENLACE_ML\r\n";
      mlList.forEach(r => { csvMl += `${r.date || todayStr},"${(r.mlLink || '').replace(/"/g, '""')}"\r\n`; });
      const blob = new Blob([csvMl], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = `mercado-libre-${startDateFilter}-al-${endDateFilter}.csv`; a.click(); URL.revokeObjectURL(url);
      exportCount++;
    }

    if (exportCount > 0) alert(`Se han exportado ${exportCount} archivo(s) Excel (CSV) con éxito.`);
    else alert('No se encontraron registros para los filtros actuales.');
  };

  // IMPORTACIÓN MÚLTIPLE AUTOMÁTICA SIN PASOS INTERMEDIOS
  $('importFile').onchange = async e => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    try {
      let allImportedRecords = [...records];
      for (let file of files) {
        const text = await file.text();
        const data = JSON.parse(text);
        const incoming = Array.isArray(data) ? data : (Array.isArray(data.records) ? data.records : []);
        if (incoming.length > 0) {
          incoming.forEach(inc => {
            // Evitar duplicados exactos por ID
            if (!allImportedRecords.some(r => r.id === inc.id)) {
              allImportedRecords.push(inc);
            }
          });
        }
      }
      records = allImportedRecords;
      saveRecords();
      cotizPage = 1; pedidosPage = 1; mlPage = 1;
      render(); renderMlView();
      alert('¡Importación de archivos completada con éxito!');
    } catch (err) {
      alert('Error al leer o procesar los archivos JSON.');
    }
    e.target.value = '';
  };

  $('purgeBtn').onclick = () => {
    const dias = prompt('¿Cuántos días de antigüedad deseas CONSERVAR? (Ej. 90):', '90');
    if (!dias || isNaN(dias)) return;
    const limiteDias = parseInt(dias, 10);
    const fechaCorteObj = new Date();
    fechaCorteObj.setDate(fechaCorteObj.getDate() - limiteDias);
    const fechaCorteStr = getLocalDateString(fechaCorteObj);

    if (confirm(`Se eliminarán permanentemente los registros anteriores al ${fechaCorteStr}. ¿Proceder?`)) {
      const totalAntes = records.length;
      records = records.filter(r => (r.date || todayStr) >= fechaCorteStr);
      saveRecords();
      cotizPage = 1; pedidosPage = 1; mlPage = 1;
      render(); renderMlView();
      alert(`Se han depurado ${totalAntes - records.length} registros antiguos.`);
    }
  };

  $('weeklySummaryBtn').onclick = () => {
    reportStart = todayStr; reportEnd = todayStr;
    reportRangePicker.setDate([todayStr, todayStr], true);
    $('weeklyRangeTitle').textContent = `Del ${todayStr} al ${todayStr}`;
    show('weeklySection'); renderReport(todayStr, todayStr);
  };

  $('closeWeekly').onclick = () => hide('weeklySection');

  $('downloadReportImg').onclick = async () => {
    const reportElement = $('weeklySection');
    const originalBtn = $('downloadReportImg');
    originalBtn.textContent = 'Generando...'; originalBtn.disabled = true;
    try {
      const canvas = await html2canvas(reportElement, { backgroundColor: '#0f172a', scale: 2, useCORS: true, ignoreElements: (el) => el.getAttribute('data-html2canvas-ignore') === 'true' });
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png'); link.download = `reporte-${reportStart}-al-${reportEnd}.png`;
      link.click();
    } catch (err) { alert('Error al generar la imagen.'); } 
    finally { originalBtn.textContent = '📷 Descargar Imagen'; originalBtn.disabled = false; }
  };

  function renderReport(startRange, endRange) {
    const periodCotiz = records.filter(r => r.type === 'Cotización' && (r.date || todayStr) >= startRange && (r.date || todayStr) <= endRange);
    $('weekTotalCount').textContent = periodCotiz.length;

    if (periodCotiz.length === 0) {
      $('weekAvgTime').textContent = '0 min'; $('weekMedianTime').textContent = '0 min';
      $('weeklyCotizBody').innerHTML = ''; show('emptyWeekly');
      if (weeklyChartInstance) { weeklyChartInstance.destroy(); weeklyChartInstance = null; }
      return;
    }

    hide('emptyWeekly');
    const totalMinutes = periodCotiz.reduce((sum, r) => sum + Number(r.minutes), 0);
    $('weekAvgTime').textContent = (totalMinutes / periodCotiz.length).toFixed(1) + ' min';

    const sortedTimes = periodCotiz.map(r => Number(r.minutes)).sort((a, b) => a - b);
    const mid = Math.floor(sortedTimes.length / 2);
    const median = sortedTimes.length % 2 === 0 ? (sortedTimes[mid - 1] + sortedTimes[mid]) / 2 : sortedTimes[mid];
    $('weekMedianTime').textContent = median.toFixed(1) + ' min';

    const groupedByDay = {};
    periodCotiz.forEach(r => {
      const d = r.date || todayStr;
      if (!groupedByDay[d]) groupedByDay[d] = { totalMin: 0, items: [] };
      groupedByDay[d].totalMin += Number(r.minutes);
      groupedByDay[d].items.push({ key: r.key, minutes: Number(r.minutes) });
    });

    const sortedDates = Object.keys(groupedByDay).sort();
    const daysOfWeek = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const chartLabels = [], chartDataPoints = [], medianLineData = [];
    const tbody = $('weeklyCotizBody'); tbody.innerHTML = '';

    sortedDates.forEach(dateStr => {
      const data = groupedByDay[dateStr];
      const dayAvg = data.totalMin / data.items.length;
      const dayName = daysOfWeek[new Date(dateStr + 'T00:00:00').getDay()];

      chartLabels.push(`${dayName} (${dateStr})`);
      chartDataPoints.push(Number(dayAvg.toFixed(1)));
      medianLineData.push(Number(median.toFixed(1)));

      const itemsHtml = data.items.map(item => `
        <span class="inline-flex items-center gap-1 bg-slate-950 border border-slate-800 px-2 py-1 rounded-md text-[11px] text-slate-300 mr-1 mb-1">
          <strong class="text-white">${item.key}:</strong> <span class="text-brand-400 font-semibold">${item.minutes.toFixed(1)}m</span>
        </span>
      `).join('');

      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-800/40 transition-colors';
      tr.innerHTML = `<td class="p-3 text-brand-400 font-semibold">${dayName}</td><td class="p-3 text-slate-300">${dateStr}</td><td class="p-3"><div class="flex flex-wrap items-center">${itemsHtml}</div></td><td class="p-3 text-right text-slate-200 font-semibold">${dayAvg.toFixed(1)} min</td>`;
      tbody.appendChild(tr);
    });

    const ctx = $('weeklyChart').getContext('2d');
    if (weeklyChartInstance) weeklyChartInstance.destroy();
    weeklyChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: chartLabels,
        datasets: [
          { label: 'Promedio Diario (min)', data: chartDataPoints, borderColor: '#4ce0a0', backgroundColor: '#4ce0a0', borderWidth: 2, tension: 0.1 },
          { label: `Mediana (${median.toFixed(1)} min)`, data: medianLineData, borderColor: '#38bdf8', borderWidth: 2, borderDash: [5, 5], pointRadius: 0, fill: false }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#cbd5e1' } } }, scales: { x: { ticks: { color: '#94a3b8' } }, y: { beginAtZero: true, ticks: { color: '#94a3b8' } } } }
    });
  }

  function render(){
    const filtered = records.filter(r => {
      const recordDate = r.date || todayStr;
      if (startDateFilter && recordDate < startDateFilter) return false;
      if (endDateFilter && recordDate > endDateFilter) return false;
      return true;
    });

    const cotizaciones = filtered.filter(r => r.type === 'Cotización');
    const pedidos = filtered.filter(r => r.type === 'Pedido especial');
    const avgCotiz = cotizaciones.length ? cotizaciones.reduce((s,r) => s + Number(r.minutes), 0) / cotizaciones.length : 0;
    
    $('totalCotizStat').textContent = cotizaciones.length;
    $('averageStat').textContent = avgCotiz.toFixed(1) + ' min';
    $('ordersStat').textContent = pedidos.length;

    // --- RENDER COTIZACIONES (PAGINACIÓN 10 EN 10) ---
    const totalPagesCotiz = Math.ceil(cotizaciones.length / PAGE_SIZE) || 1;
    if (cotizPage > totalPagesCotiz) cotizPage = totalPagesCotiz;
    const cotizStart = (cotizPage - 1) * PAGE_SIZE;
    const cotizToRender = cotizaciones.slice(cotizStart, cotizStart + PAGE_SIZE);

    $('cotizPageInfo').textContent = `Página ${cotizPage} de ${totalPagesCotiz}`;
    $('prevCotiz').disabled = cotizPage === 1;
    $('nextCotiz').disabled = cotizPage >= totalPagesCotiz;

    const cotizBody = $('cotizBody'); cotizBody.innerHTML = '';
    $('emptyCotiz').classList.toggle('hidden', cotizaciones.length > 0);

    cotizToRender.forEach(r => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-800/40 transition-colors';
      tr.innerHTML = `<td class="p-3.5 text-slate-300">${r.date || todayStr}</td><td class="p-3.5 font-medium text-white uppercase">${r.key}</td><td class="p-3.5 text-brand-400 font-semibold">${Number(r.minutes).toFixed(1)} min</td>`;
      const tdAction = document.createElement('td'); tdAction.className = 'p-3.5 text-right';
      const del = document.createElement('button');
      del.className = 'px-2.5 py-1 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 border border-rose-500/30 rounded-lg transition';
      del.textContent = 'Eliminar';
      del.onclick = () => {
        if (confirm('¿Eliminar esta cotización?')) {
          records = records.filter(x => x.id !== r.id); saveRecords(); render();
          if (!$('weeklySection').classList.contains('hidden')) renderReport(reportStart, reportEnd);
        }
      };
      tdAction.appendChild(del); tr.appendChild(tdAction); cotizBody.appendChild(tr);
    });

    // --- RENDER PEDIDOS ESPECIALES (PAGINACIÓN 10 EN 10 - F. Pedido antes de Llegada) ---
    const totalPagesPedidos = Math.ceil(pedidos.length / PAGE_SIZE) || 1;
    if (pedidosPage > totalPagesPedidos) pedidosPage = totalPagesPedidos;
    const pedidosStart = (pedidosPage - 1) * PAGE_SIZE;
    const pedidosToRender = pedidos.slice(pedidosStart, pedidosStart + PAGE_SIZE);

    $('pedidosPageInfo').textContent = `Página ${pedidosPage} de ${totalPagesPedidos}`;
    $('prevPedidos').disabled = pedidosPage === 1;
    $('nextPedidos').disabled = pedidosPage >= totalPagesPedidos;

    const pedidosBody = $('pedidosBody'); pedidosBody.innerHTML = '';
    $('emptyPedidos').classList.toggle('hidden', pedidos.length > 0);

    pedidosToRender.forEach(r => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-800/40 transition-colors';
      tr.innerHTML = `<td class="p-3.5 font-medium text-white uppercase">${r.key}</td><td class="p-3.5 text-slate-300 uppercase">${r.description || ''}</td><td class="p-3.5 text-slate-300 uppercase">${r.supplier || ''}</td>`;

      const tdAttended = document.createElement('td'); tdAttended.className = 'p-3.5 text-center';
      const label = document.createElement('label'); label.className = 'relative inline-flex items-center cursor-pointer';
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = !!r.completed; checkbox.className = 'sr-only peer';
      checkbox.onchange = () => { r.completed = checkbox.checked; saveRecords(); };
      const divSlider = document.createElement('div');
      divSlider.className = "w-9 h-5 bg-slate-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-400";
      label.appendChild(checkbox); label.appendChild(divSlider); tdAttended.appendChild(label); tr.appendChild(tdAttended);

      // F. Pedido (r.date) impreso ANTES de la fecha de llegada (r.arrivalDate)
      tr.innerHTML += `<td class="p-3.5 text-slate-300">${r.date || todayStr}</td><td class="p-3.5 text-emerald-400 font-medium">${r.arrivalDate || ''}</td><td class="p-3.5 text-slate-300 uppercase">${r.responsible || ''}</td>`;

      const tdAction = document.createElement('td'); tdAction.className = 'p-3.5 text-right';
      const del = document.createElement('button');
      del.className = 'px-2.5 py-1 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 border border-rose-500/30 rounded-lg transition';
      del.textContent = 'Eliminar';
      del.onclick = () => { if (confirm('¿Eliminar pedido?')) { records = records.filter(x => x.id !== r.id); saveRecords(); render(); } };
      tdAction.appendChild(del); tr.appendChild(tdAction); pedidosBody.appendChild(tr);
    });
  }

  function renderMlView() {
    const mlRecords = records.filter(r => r.type === 'Pedido Mercado Libre');
    const totalPagesMl = Math.ceil(mlRecords.length / PAGE_SIZE) || 1;
    if (mlPage > totalPagesMl) mlPage = totalPagesMl;
    const mlStart = (mlPage - 1) * PAGE_SIZE;
    const toRender = mlRecords.slice(mlStart, mlStart + PAGE_SIZE);

    $('mlViewPageInfo').textContent = `Página ${mlPage} de ${totalPagesMl}`;
    $('prevMl').disabled = mlPage === 1;
    $('nextMl').disabled = mlPage >= totalPagesMl;

    const tbody = $('mlTableBody'); tbody.innerHTML = '';
    $('emptyMlView').classList.toggle('hidden', mlRecords.length > 0);

    toRender.forEach(r => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-800/40 transition-colors';
      tr.innerHTML = `<td class="p-3.5 text-slate-300">${r.date || todayStr}</td><td class="p-3.5"><a href="${r.mlLink}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-400 hover:bg-sky-500/20 font-semibold transition">🔗 Abrir enlace</a></td>`;

      const tdAction = document.createElement('td'); tdAction.className = 'p-3.5 text-right';
      const del = document.createElement('button');
      del.className = 'px-2.5 py-1 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 border border-rose-500/30 rounded-lg transition';
      del.textContent = 'Eliminar';
      del.onclick = () => { if (confirm('¿Eliminar enlace?')) { records = records.filter(x => x.id !== r.id); saveRecords(); renderMlView(); } };
      tdAction.appendChild(del); tr.appendChild(tdAction); tbody.appendChild(tr);
    });
  }

  $('clearFilters').onclick = () => {
    rangePicker.setDate([todayStr, todayStr], true);
    startDateFilter = todayStr; endDateFilter = todayStr;
    cotizPage = 1; pedidosPage = 1;
    render();
  };

  if(!getUser()) $('loginError').textContent = 'Crea tu acceso local para comenzar.';
})();