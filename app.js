(() => {
  const $ = id => document.getElementById(id);
  const KEYS = { user:'partflow_user_v1', records:'partflow_records_v1' };
  let records = [];
  let weeklyChartInstance = null;
  let reportRangePicker = null;
  
  // Control de paginación (Lazy Loading)
  let cotizLimit = 50;
  let pedidosLimit = 50;

  // Obtener fecha local exacta de México sin desfases UTC
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

  const operationDatePicker = flatpickr("#operationDate", { 
    locale: "es", defaultDate: todayStr, dateFormat: "Y-m-d" 
  });
  operationDatePicker.setDate(todayStr, true);
  
  const arrivalDatePicker = flatpickr("#arrivalDate", { 
    locale: "es", defaultDate: todayStr, dateFormat: "Y-m-d" 
  });
  arrivalDatePicker.setDate(todayStr, true);
  
  const rangePicker = flatpickr("#rangePicker", {
    mode: "range",
    locale: "es",
    dateFormat: "Y-m-d",
    defaultDate: [todayStr, todayStr], 
    onClose: function(selectedDates, dateStr, instance) {
      if (selectedDates.length === 2) {
        startDateFilter = instance.formatDate(selectedDates[0], "Y-m-d");
        endDateFilter = instance.formatDate(selectedDates[1], "Y-m-d");
      } else if (selectedDates.length === 1) {
        startDateFilter = instance.formatDate(selectedDates[0], "Y-m-d");
        endDateFilter = startDateFilter;
      } else {
        startDateFilter = '';
        endDateFilter = '';
      }
      cotizLimit = 50;
      pedidosLimit = 50;
      render();
    }
  });
  rangePicker.setDate([todayStr, todayStr], true);

  reportRangePicker = flatpickr("#reportRangeSelector", {
    mode: "range",
    locale: "es",
    dateFormat: "Y-m-d",
    defaultDate: [todayStr, todayStr],
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

  $('type').onchange = (e) => {
    const val = e.target.value;
    if (val === 'Cotización') {
      $('cotizacionFields').classList.remove('hidden');
      $('pedidoFields').classList.add('hidden');
      $('minutes').required = true;
      $('description').required = false;
      $('supplier').required = false;
      $('responsible').required = false;
    } else {
      $('cotizacionFields').classList.add('hidden');
      $('pedidoFields').classList.remove('hidden');
      $('minutes').required = false;
      $('description').required = true;
      $('supplier').required = true;
      $('responsible').required = true;
    }
  };

  const getUser = () => { try { return JSON.parse(localStorage.getItem(KEYS.user)); } catch { return null; } };
  const getRecords = () => { try { const x=JSON.parse(localStorage.getItem(KEYS.records)||'[]'); return Array.isArray(x)?x:[]; } catch { return []; } };
  const saveRecords = () => localStorage.setItem(KEYS.records, JSON.stringify(records));
  const show = id => $(id).classList.remove('hidden');
  const hide = id => $(id).classList.add('hidden');

  $('showRegister').onclick=()=>{hide('loginForm');show('registerForm');$('registerError').textContent='';};
  $('showLogin').onclick=()=>{hide('registerForm');show('loginForm');$('loginError').textContent='';};

  $('doRegister').addEventListener('submit', e => {
    e.preventDefault();
    const username=$('newUser').value.trim(), pin=$('newPin').value, confirm=$('confirmPin').value;
    if(pin!==confirm){$('registerError').textContent='Las contraseñas no coinciden.';return;}
    if(getUser()){ $('registerError').textContent='Ya existe un acceso local. Inicia sesión.';return; }
    localStorage.setItem(KEYS.user,JSON.stringify({username,pin}));
    $('loginUser').value=username; $('loginPin').value=pin;
    $('doRegister').requestSubmit();
  });

  $('doLogin').addEventListener('submit', e => {
    e.preventDefault();
    const user=getUser();
    if(!user){$('loginError').textContent='Primero crea tu acceso local.';return;}
    if($('loginUser').value.trim()!==user.username || $('loginPin').value!==user.pin){$('loginError').textContent='Usuario o contraseña incorrectos.';return;}
    openApp(user.username);
  });

  function openApp(username){
    records=getRecords();
    $('welcomeUser').textContent=username; $('userInitial').textContent=username.charAt(0).toUpperCase();
    hide('authView');show('appView');
    render();
  }
  
  $('logout').onclick=()=>{hide('appView');show('authView');$('loginPin').value='';};
  
  $('entryForm').addEventListener('submit', e => {
    e.preventDefault();
    const type = $('type').value;
    const key = $('key').value.trim().toUpperCase();
    const opDate = $('operationDate').value || todayStr;
    
    let newRecord = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      type,
      key,
      date: opDate
    };

    if (type === 'Cotización') {
      const minutes = Number($('minutes').value);
      if (!Number.isFinite(minutes) || minutes <= 0) {
        $('entryError').textContent = 'Ingresa un tiempo mayor que cero.';
        return;
      }
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
    
    $('key').value = '';
    $('minutes').value = '';
    $('description').value = '';
    $('supplier').value = '';
    $('responsible').value = '';
    $('entryError').textContent = '';
    operationDatePicker.setDate(todayStr, true);

    cotizLimit = 50;
    pedidosLimit = 50;
    render();
  });

  // Botones de Paginación
  $('loadMoreCotiz').onclick = () => { cotizLimit += 50; render(); };
  $('loadMorePedidos').onclick = () => { pedidosLimit += 50; render(); };

  // EXPORTAR A EXCEL (CSV con codificación UTF-8 compatible)
  // EXPORTAR A DOS ARCHIVOS EXCEL (CSV) SEPARADOS: COTIZACIONES Y PEDIDOS
  $('exportExcelBtn').onclick = () => {
    const filtered = records.filter(r => {
      const recordDate = r.date || todayStr;
      if (startDateFilter && recordDate < startDateFilter) return false;
      if (endDateFilter && recordDate > endDateFilter) return false;
      return true;
    });

    if (filtered.length === 0) {
      alert('No hay registros en el rango seleccionado para exportar.');
      return;
    }

    // 1. Filtrar listas independientes
    const cotizaciones = filtered.filter(r => r.type === 'Cotización');
    const pedidos = filtered.filter(r => r.type === 'Pedido especial');

    let exportCount = 0;

    // 2. Generar archivo de Cotizaciones si existen registros
    if (cotizaciones.length > 0) {
      let csvCotiz = "\uFEFF";
      csvCotiz += "FECHA,CLAVE,TIEMPO_MINUTOS\r\n";
      cotizaciones.forEach(r => {
        const fecha = r.date || todayStr;
        const clave = `"${(r.key || '').replace(/"/g, '""')}"`;
        const minutos = r.minutes !== undefined ? r.minutes : '';
        csvCotiz += `${fecha},${clave},${minutos}\r\n`;
      });

      const blobCotiz = new Blob([csvCotiz], { type: 'text/csv;charset=utf-8;' });
      const urlCotiz = URL.createObjectURL(blobCotiz);
      const aCotiz = document.createElement('a');
      aCotiz.href = urlCotiz;
      aCotiz.download = `cotizaciones-${startDateFilter}-al-${endDateFilter}.csv`;
      aCotiz.click();
      URL.revokeObjectURL(urlCotiz);
      exportCount++;
    }

    if (pedidos.length > 0) {
      let csvPedidos = "\uFEFF";
      csvPedidos += "CLAVE,DESCRIPCION,PROVEEDOR,FECHA_LLEGADA,FECHA_PEDIDO,ATENDIDO,RESPONSABLE\r\n";
      pedidos.forEach(r => {
        const clave = `"${(r.key || '').replace(/"/g, '""')}"`;
        const desc = `"${(r.description || '').replace(/"/g, '""')}"`;
        const prov = `"${(r.supplier || '').replace(/"/g, '""')}"`;
        const llegada = r.arrivalDate || '';
        const fechaPedido = r.date || todayStr;
        const atendido = r.completed ? 'SÍ' : 'NO';
        const resp = `"${(r.responsible || '').replace(/"/g, '""')}"`;

        csvPedidos += `${clave},${desc},${prov},${llegada},${fechaPedido},${atendido},${resp}\r\n`;
      });

      const blobPedidos = new Blob([csvPedidos], { type: 'text/csv;charset=utf-8;' });
      const urlPedidos = URL.createObjectURL(blobPedidos);
      const aPedidos = document.createElement('a');
      aPedidos.href = urlPedidos;
      aPedidos.download = `pedidos-especiales-${startDateFilter}-al-${endDateFilter}.csv`;
      aPedidos.click();
      URL.revokeObjectURL(urlPedidos);
      exportCount++;
    }

    if (exportCount > 0) {
      alert(`Se han exportado ${exportCount} archivo(s) Excel con éxito según el rango seleccionado.`);
    } else {
      alert('No se encontraron registros de cotizaciones ni de pedidos para los filtros actuales.');
    }
  };

  // PURGAR HISTÓRICO ANTIGUO
  $('purgeBtn').onclick = () => {
    const dias = prompt('¿Cuántos días de antigüedad deseas CONSERVAR? (Ej. Escribe 90 para borrar todo lo que tenga más de 3 meses):', '90');
    if (!dias || isNaN(dias)) return;

    const limiteDias = parseInt(dias, 10);
    const fechaCorteObj = new Date();
    fechaCorteObj.setDate(fechaCorteObj.getDate() - limiteDias);
    const fechaCorteStr = getLocalDateString(fechaCorteObj);

    if (confirm(`Se eliminarán permanentemente todos los registros anteriores al ${fechaCorteStr}.\n\nSe recomienda exportar un respaldo JSON antes. ¿Deseas proceder?`)) {
      const totalAntes = records.length;
      records = records.filter(r => {
        const rDate = r.date || todayStr;
        return rDate >= fechaCorteStr;
      });
      const eliminados = totalAntes - records.length;
      saveRecords();
      cotizLimit = 50;
      pedidosLimit = 50;
      render();
      alert(`Se han depurado ${eliminados} registros antiguos. Tu navegador ahora está optimizado.`);
    }
  };

  $('weeklySummaryBtn').onclick = () => {
    reportStart = todayStr;
    reportEnd = todayStr;
    reportRangePicker.setDate([todayStr, todayStr], true);
    $('weeklyRangeTitle').textContent = `Del ${todayStr} al ${todayStr}`;
    show('weeklySection');
    renderReport(todayStr, todayStr);
  };

  $('closeWeekly').onclick = () => {
    hide('weeklySection');
  };

  $('downloadReportImg').onclick = async () => {
    const reportElement = $('weeklySection');
    const originalBtn = $('downloadReportImg');
    
    originalBtn.textContent = 'Generando captura...';
    originalBtn.disabled = true;

    try {
      const canvas = await html2canvas(reportElement, {
        backgroundColor: '#0f172a',
        scale: 2,
        useCORS: true,
        ignoreElements: (element) => element.getAttribute('data-html2canvas-ignore') === 'true'
      });

      const imageURI = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = imageURI;
      link.download = `reporte-cotizaciones-${reportStart}-al-${reportEnd}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      alert('Hubo un inconveniente al generar la imagen del reporte.');
    } finally {
      originalBtn.textContent = '📷 Descargar en Imagen';
      originalBtn.disabled = false;
    }
  };

  function renderReport(startRange, endRange) {
    const periodCotiz = records.filter(r => {
      if (r.type !== 'Cotización') return false;
      const d = r.date || todayStr;
      return d >= startRange && d <= endRange;
    });

    $('weekTotalCount').textContent = periodCotiz.length;

    if (periodCotiz.length === 0) {
      $('weekAvgTime').textContent = '0 min';
      $('weekMedianTime').textContent = '0 min';
      $('weeklyCotizBody').innerHTML = '';
      show('emptyWeekly');
      if (weeklyChartInstance) { weeklyChartInstance.destroy(); weeklyChartInstance = null; }
      return;
    }

    hide('emptyWeekly');

    const totalMinutes = periodCotiz.reduce((sum, r) => sum + Number(r.minutes), 0);
    const avg = totalMinutes / periodCotiz.length;
    $('weekAvgTime').textContent = avg.toFixed(1) + ' min';

    const sortedTimes = periodCotiz.map(r => Number(r.minutes)).sort((a, b) => a - b);
    let median = 0;
    const mid = Math.floor(sortedTimes.length / 2);
    if (sortedTimes.length % 2 === 0) {
      median = (sortedTimes[mid - 1] + sortedTimes[mid]) / 2;
    } else {
      median = sortedTimes[mid];
    }
    $('weekMedianTime').textContent = median.toFixed(1) + ' min';

    const groupedByDay = {};
    periodCotiz.forEach(r => {
      const d = r.date || todayStr;
      if (!groupedByDay[d]) {
        groupedByDay[d] = { totalMin: 0, items: [] };
      }
      groupedByDay[d].totalMin += Number(r.minutes);
      groupedByDay[d].items.push({ key: r.key, minutes: Number(r.minutes) });
    });

    const sortedDates = Object.keys(groupedByDay).sort();
    const daysOfWeek = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

    const chartLabels = [];
    const chartDataPoints = [];
    const medianLineData = [];
    const tbody = $('weeklyCotizBody');
    tbody.innerHTML = '';

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
      tr.innerHTML = `
        <td class="p-3 text-brand-400 font-semibold">${dayName}</td>
        <td class="p-3 text-slate-300">${dateStr}</td>
        <td class="p-3">
          <div class="flex flex-wrap items-center">${itemsHtml}</div>
        </td>
        <td class="p-3 text-right text-slate-200 font-semibold whitespace-nowrap">${dayAvg.toFixed(1)} min</td>
      `;
      tbody.appendChild(tr);
    });

    const ctx = $('weeklyChart').getContext('2d');
    if (weeklyChartInstance) {
      weeklyChartInstance.destroy();
    }

    weeklyChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: chartLabels,
        datasets: [
          {
            label: 'Tiempo Promedio Diario (min)',
            data: chartDataPoints,
            backgroundColor: '#4ce0a0',
            borderColor: '#4ce0a0',
            borderWidth: 2,
            pointRadius: 6,
            pointHoverRadius: 8,
            tension: 0.1
          },
          {
            label: `Media / Mediana del Período (${median.toFixed(1)} min)`,
            data: medianLineData,
            borderColor: '#38bdf8',
            borderWidth: 2,
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#cbd5e1', font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: function(context) { return `${context.dataset.label}: ${context.raw} min`; }
            }
          }
        },
        scales: {
          x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: 'rgba(51, 65, 85, 0.3)' } },
          y: { beginAtZero: true, ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: 'rgba(51, 65, 85, 0.3)' } }
        }
      }
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

    // Cotizaciones con Lazy Loading (50 en 50)
    const cotizToRender = cotizaciones.slice(0, cotizLimit);
    $('cotizPageInfo').textContent = `Mostrando ${cotizToRender.length} de ${cotizaciones.length} cotizaciones`;
    $('loadMoreCotiz').classList.toggle('hidden', cotizLimit >= cotizaciones.length);

    const cotizBody = $('cotizBody');
    cotizBody.innerHTML = '';
    $('emptyCotiz').classList.toggle('hidden', cotizaciones.length > 0);

    cotizToRender.forEach(r => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-800/40 transition-colors';
      tr.innerHTML = `
        <td class="p-3.5 text-slate-300">${r.date || todayStr}</td>
        <td class="p-3.5 font-medium text-white uppercase">${r.key}</td>
        <td class="p-3.5 text-brand-400 font-semibold">${Number(r.minutes).toFixed(1)} min</td>
      `;

      const tdAction = document.createElement('td');
      tdAction.className = 'p-3.5 text-right';
      const del = document.createElement('button');
      del.className = 'px-2.5 py-1 text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/30 rounded-lg transition';
      del.textContent = 'Eliminar';
      del.onclick = () => {
        if (confirm('¿Eliminar esta cotización?')) {
          records = records.filter(x => x.id !== r.id);
          saveRecords();
          render();
          if (!$('weeklySection').classList.contains('hidden')) {
            renderReport(reportStart, reportEnd);
          }
        }
      };
      tdAction.appendChild(del);
      tr.appendChild(tdAction);
      cotizBody.appendChild(tr);
    });

    // Pedidos Especiales con Lazy Loading (50 en 50)
    const pedidosToRender = pedidos.slice(0, pedidosLimit);
    $('pedidosPageInfo').textContent = `Mostrando ${pedidosToRender.length} de ${pedidos.length} pedidos`;
    $('loadMorePedidos').classList.toggle('hidden', pedidosLimit >= pedidos.length);

    const pedidosBody = $('pedidosBody');
    pedidosBody.innerHTML = '';
    $('emptyPedidos').classList.toggle('hidden', pedidos.length > 0);

    pedidosToRender.forEach(r => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-800/40 transition-colors';

      tr.innerHTML = `
        <td class="p-3.5 font-medium text-white uppercase">${r.key}</td>
        <td class="p-3.5 text-slate-300 uppercase">${r.description || ''}</td>
        <td class="p-3.5 text-slate-300 uppercase">${r.supplier || ''}</td>
      `;

      const tdAttended = document.createElement('td');
      tdAttended.className = 'p-3.5 text-center';
      
      const label = document.createElement('label');
      label.className = 'relative inline-flex items-center cursor-pointer';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = !!r.completed;
      checkbox.className = 'sr-only peer';
      checkbox.onchange = () => {
        r.completed = checkbox.checked;
        saveRecords();
      };

      const divSlider = document.createElement('div');
      divSlider.className = "w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-400";

      label.appendChild(checkbox);
      label.appendChild(divSlider);
      tdAttended.appendChild(label);
      tr.appendChild(tdAttended);

      const tdDate = document.createElement('td');
      tdDate.className = 'p-3.5 text-slate-300';
      tdDate.textContent = r.date || todayStr;
      tr.appendChild(tdDate);

      const tdArrival = document.createElement('td');
      tdArrival.className = 'p-3.5 text-emerald-400 font-medium';
      tdArrival.textContent = r.arrivalDate;
      tr.appendChild(tdArrival);

      const tdResp = document.createElement('td');
      tdResp.className = 'p-3.5 text-slate-300 uppercase';
      tdResp.textContent = r.responsible || '';
      tr.appendChild(tdResp);

      const tdAction = document.createElement('td');
      tdAction.className = 'p-3.5 text-right';
      const del = document.createElement('button');
      del.className = 'px-2.5 py-1 text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/30 rounded-lg transition';
      del.textContent = 'Eliminar';
      del.onclick = () => {
        if (confirm('¿Eliminar este pedido especial?')) {
          records = records.filter(x => x.id !== r.id);
          saveRecords();
          render();
        }
      };
      tdAction.appendChild(del);
      tr.appendChild(tdAction);

      pedidosBody.appendChild(tr);
    });
  }

  $('clearFilters').onclick = () => {
    rangePicker.setDate([todayStr, todayStr], true);
    startDateFilter = todayStr;
    endDateFilter = todayStr;
    cotizLimit = 50;
    pedidosLimit = 50;
    render();
  };

  $('exportBtn').onclick = () => {
    const recordsToExport = records.filter(r => {
      const recordDate = r.date || todayStr;
      if (startDateFilter && recordDate < startDateFilter) return false;
      if (endDateFilter && recordDate > endDateFilter) return false;
      return true;
    });

    if (recordsToExport.length === 0) {
      alert('No hay registros en el rango de fechas seleccionado para exportar.');
      return;
    }

    const data = { 
      app: 'Cotizaciones', 
      version: 2.0, 
      exportedAt: new Date().toISOString(), 
      range: { start: startDateFilter, end: endDateFilter },
      records: recordsToExport 
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url;
    a.download = `Cotizaciones-respaldo-${startDateFilter}-al-${endDateFilter}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  $('importFile').onchange = async e => {
    const file = e.target.files[0]; 
    if (!file) return;
    
    try {
      const fileText = await file.text();
      const data = JSON.parse(fileText);
      const incoming = Array.isArray(data) ? data : data.records;
      
      if (!Array.isArray(incoming)) throw new Error('Formato inválido');

      const filterOption = confirm(
        `El archivo contiene ${incoming.length} registros.\n\n` +
        `¿Deseas filtrar los registros por un rango de fechas antes de importarlos?\n\n` +
        `• Aceptar: Elegir fechas de inicio y fin para importar solo lo necesario.\n` +
        `• Cancelar: Importar todos los registros del archivo.`
      );

      let recordsToImport = incoming;

      if (filterOption) {
        const promptStart = prompt('Ingresa la fecha de INICIO a importar (YYYY-MM-DD):', todayStr);
        if (!promptStart) { e.target.value = ''; return; }
        
        const promptEnd = prompt('Ingresa la fecha de FIN a importar (YYYY-MM-DD):', todayStr);
        if (!promptEnd) { e.target.value = ''; return; }

        recordsToImport = incoming.filter(r => {
          const rDate = r.date || todayStr;
          return rDate >= promptStart && rDate <= promptEnd;
        });

        alert(`Se filtraron ${recordsToImport.length} registros entre el ${promptStart} y el ${promptEnd}.`);
      }

      if (recordsToImport.length === 0) {
        alert('No hay registros en el rango especificado para importar.');
        e.target.value = '';
        return;
      }

      const mode = confirm(`¿Deseas REEMPLAZAR tus registros actuales o FUSIONARLOS con los ${recordsToImport.length} registros a importar?\n\n• Aceptar: Reemplazar todo\n• Cancelar: Fusionar (agregar sin borrar lo actual)`);

      if (mode) {
        records = recordsToImport;
      } else {
        const existingIds = new Set(records.map(r => r.id));
        const uniqueNew = recordsToImport.filter(r => !existingIds.has(r.id));
        records = [...uniqueNew, ...records];
      }

      saveRecords();
      cotizLimit = 50;
      pedidosLimit = 50;
      render();
      alert('¡Importación completada con éxito!');

    } catch (err) {
      alert('El archivo no tiene un formato de respaldo válido.');
    }
    
    e.target.value = '';
  };


 (function() {
  const line1Text = "Registra, Analiza.";
  const line2Text = "Mejora.";
  
  // Velocidad más lenta (puedes subir o bajar este número en ms)
  const typingSpeed = 100; 
  const erasingSpeed = 60;
  const pauseTime = 2000; // Tiempo de espera (en ms) cuando termina de escribir antes de borrar

  function iniciarEfectoTypewriter() {
    const elLine1 = document.getElementById('typedLine1');
    const elLine2 = document.getElementById('typedLine2');

    if (!elLine1 || !elLine2) return;

    let i = 0;
    let j = 0;
    let isDeleting = false;

    function loop() {
      // Fase 1: Escribir línea 1
      if (!isDeleting && i <= line1Text.length) {
        elLine1.textContent = line1Text.substring(0, i);
        i++;
        setTimeout(loop, typingSpeed);
      } 
      // Fase 2: Escribir línea 2
      else if (!isDeleting && j <= line2Text.length) {
        elLine2.textContent = line2Text.substring(0, j);
        j++;
        setTimeout(loop, typingSpeed);
      } 
      // Fase 3: Pausa cuando está completo, luego cambia a modo borrado
      else if (!isDeleting && i > line1Text.length && j > line2Text.length) {
        isDeleting = true;
        setTimeout(loop, pauseTime);
      } 
      // Fase 4: Borrar línea 2
      else if (isDeleting && j > 0) {
        j--;
        elLine2.textContent = line2Text.substring(0, j);
        setTimeout(loop, erasingSpeed);
      } 
      // Fase 5: Borrar línea 1
      else if (isDeleting && i > 0) {
        i--;
        elLine1.textContent = line1Text.substring(0, i);
        setTimeout(loop, erasingSpeed);
      } 
      // Reiniciar ciclo de escritura
      else if (isDeleting && i === 0 && j === 0) {
        isDeleting = false;
        setTimeout(loop, 500);
      }
    }

    loop();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarEfectoTypewriter);
  } else {
    iniciarEfectoTypewriter();
  }
})();


  if(!getUser()) $('loginError').textContent = 'Crea tu acceso local para comenzar.';
})();
