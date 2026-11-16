(() => {
  const $ = id => document.getElementById(id);
  const KEYS = { user: 'partflow_user_v1', session: 'partflow_session_v1', records: 'partflow_records_v1' };
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

  let records = [];
  const PAGE_SIZE = 10;
  let cotizPage = 1, pedidosPage = 1, mlPage = 1;
  let weeklyChartInstance = null;
  let tablePagesState = {};

  const getLocalDateString = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const todayStr = getLocalDateString(new Date());

  const getRecords = () => { try { const x = JSON.parse(localStorage.getItem(KEYS.records) || '[]'); return Array.isArray(x) ? x : []; } catch { return []; } };
  const saveRecords = () => localStorage.setItem(KEYS.records, JSON.stringify(records));
  records = getRecords();

  const sidebar = $('sidebar'), overlay = $('sidebarOverlay');
  let isCollapsed = true; // INICIA COLAPSADO POR DEFECTO

  // Cerrar modales con ESC y menús desplegables al hacer clic fuera
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const cotizModal = $('cotizModal');
      if (cotizModal && !cotizModal.classList.contains('hidden')) {
        cotizModal.classList.add('hidden');
        if (typeof resetCotizForm === 'function') resetCotizForm();
      }
      const pedidoModal = $('pedidoModal');
      if (pedidoModal && !pedidoModal.classList.contains('hidden')) {
        pedidoModal.classList.add('hidden');
        if (typeof resetPedidoForm === 'function') resetPedidoForm();
      }
    }
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.dropdown-container')) {
      document.querySelectorAll('.action-menu').forEach(m => m.classList.add('hidden'));
    }
  });

  if ($('collapseBtn')) {
    $('collapseBtn').onclick = () => {
      isCollapsed = !isCollapsed;
      if (window.innerWidth >= 1024) {
        sidebar.classList.toggle('w-64', !isCollapsed);
        sidebar.classList.toggle('w-20', isCollapsed);
        document.querySelectorAll('.sidebar-text').forEach(el => el.classList.toggle('hidden', isCollapsed));
      } else {
        sidebar.classList.toggle('-translate-x-full');
        if (overlay) overlay.classList.toggle('hidden');
      }
    };
  }

  if ($('mobileToggle')) $('mobileToggle').onclick = () => { sidebar.classList.remove('-translate-x-full'); if (overlay) overlay.classList.remove('hidden'); };
  if (overlay) overlay.onclick = () => { sidebar.classList.add('-translate-x-full'); overlay.classList.add('hidden'); };

  if ($('authView')) {
    if (!user || !isSessionActive) {
      $('authView').classList.remove('hidden');
      if ($('appView')) $('appView').classList.add('hidden');
      if (user && $('loginUser')) $('loginUser').value = user.username;
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
        localStorage.setItem(KEYS.user, JSON.stringify({ username: $('newUser').value.trim(), pin: $('newPin').value }));
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
    $('logout').onclick = () => { localStorage.removeItem(KEYS.session); window.location.replace('index.html'); };
  }

  // --- COTIZACIONES ---
  let editingCotizId = null;
  let opDatePickerCotiz = null;

  if ($('cotizForm')) {
    opDatePickerCotiz = flatpickr("#operationDate", { locale: "es", defaultDate: todayStr, dateFormat: "Y-m-d" });
    opDatePickerCotiz.setDate(todayStr, true);

    const cotizModal = $('cotizModal');
    const openCotizBtn = $('openModalBtn');
    const closeCotizBtn = $('closeModalBtn');
    const cancelCotizBtn = $('cancelCotizBtn');

    if (openCotizBtn) openCotizBtn.onclick = () => { resetCotizForm(); if (cotizModal) cotizModal.classList.remove('hidden'); };
    if (closeCotizBtn) closeCotizBtn.onclick = () => { resetCotizForm(); if (cotizModal) cotizModal.classList.add('hidden'); };
    if (cancelCotizBtn) cancelCotizBtn.onclick = () => { resetCotizForm(); if (cotizModal) cotizModal.classList.add('hidden'); };

    $('cotizForm').addEventListener('submit', e => {
      e.preventDefault();
      const key = $('key').value.trim().toUpperCase();
      const entity = $('entity').value.trim().toUpperCase();
      const minutes = Number($('minutes').value);
      const opDate = $('operationDate').value || todayStr;

      if (!Number.isFinite(minutes) || minutes <= 0) { $('entryError').textContent = 'Ingresa un tiempo válido.'; return; }

      const payload = { type: 'Cotización', key, entity, minutes, date: opDate };

      if (editingCotizId) {
        const target = records.find(item => item.id === editingCotizId);
        if (target) { Object.assign(target, payload); saveRecords(); }
      } else {
        records.unshift({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), ...payload });
        saveRecords();
      }

      resetCotizForm();
      if (cotizModal) cotizModal.classList.add('hidden');
      cotizPage = 1;
      renderCotizaciones();
    });

    if ($('prevCotiz')) $('prevCotiz').onclick = () => { if (cotizPage > 1) { cotizPage--; renderCotizaciones(); } };
    if ($('nextCotiz')) $('nextCotiz').onclick = () => { cotizPage++; renderCotizaciones(); };

    renderCotizaciones();
  }

  function resetCotizForm() {
    editingCotizId = null;
    if ($('key')) $('key').value = '';
    if ($('entity')) $('entity').value = '';
    if ($('minutes')) $('minutes').value = '';
    if ($('entryError')) $('entryError').textContent = '';
    if (opDatePickerCotiz) opDatePickerCotiz.setDate(todayStr, true);
    if ($('cotizSubmitBtn')) $('cotizSubmitBtn').textContent = 'Guardar Cotización';
    if ($('cotizModalTitle')) $('cotizModalTitle').innerHTML = '<i class="fa-solid fa-file-invoice-dollar text-emerald-400"></i> Nueva Cotización';
  }

  function renderCotizaciones() {
    const list = records.filter(r => r.type === 'Cotización');
    const totalPages = Math.ceil(list.length / PAGE_SIZE) || 1;
    if (cotizPage > totalPages) cotizPage = totalPages;
    const toRender = list.slice((cotizPage - 1) * PAGE_SIZE, cotizPage * PAGE_SIZE);

    if ($('cotizPageInfo')) $('cotizPageInfo').textContent = `Página ${cotizPage} de ${totalPages}`;
    if ($('prevCotiz')) $('prevCotiz').disabled = cotizPage === 1;
    if ($('nextCotiz')) $('nextCotiz').disabled = cotizPage >= totalPages;

    const tbody = $('cotizBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if ($('emptyCotiz')) $('emptyCotiz').classList.toggle('hidden', list.length > 0);

    const fragment = document.createDocumentFragment();
    toRender.forEach(r => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-800/40 transition-colors';
      tr.innerHTML = `
        <td class="p-3.5 text-slate-300">${r.date || todayStr}</td>
        <td class="p-3.5 font-medium text-white uppercase">${r.key}</td>
        <td class="p-3.5 text-slate-300 uppercase">${r.entity || ''}</td>
        <td class="p-3.5 text-brand-400 font-semibold">${Number(r.minutes).toFixed(1)} min</td>
        <td class="p-3.5 text-right relative">
          <div class="inline-block text-left dropdown-container">
            <button type="button" class="action-toggle-btn px-2.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition inline-flex items-center gap-1.5">
              Acciones <i class="fa-solid fa-chevron-down text-[9px]"></i>
            </button>
            <div class="action-menu hidden absolute right-0 mt-1 w-32 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 py-1 text-left">
              <button class="edit-btn w-full px-3 py-1.5 text-xs text-sky-400 hover:bg-slate-800 transition flex items-center gap-2"><i class="fa-solid fa-pen w-3.5"></i> Editar</button>
              <button class="del-btn w-full px-3 py-1.5 text-xs text-rose-400 hover:bg-slate-800 transition flex items-center gap-2"><i class="fa-solid fa-trash w-3.5"></i> Eliminar</button>
            </div>
          </div>
        </td>
      `;

      const toggleBtn = tr.querySelector('.action-toggle-btn');
      const menu = tr.querySelector('.action-menu');
      toggleBtn.onclick = (e) => {
        e.stopPropagation();
        document.querySelectorAll('.action-menu').forEach(m => { if (m !== menu) m.classList.add('hidden'); });
        menu.classList.toggle('hidden');
      };

      tr.querySelector('.edit-btn').onclick = () => {
        menu.classList.add('hidden');
        $('key').value = r.key || '';
        $('entity').value = r.entity || '';
        $('minutes').value = r.minutes || '';
        if (opDatePickerCotiz) opDatePickerCotiz.setDate(r.date || todayStr, true);
        editingCotizId = r.id;
        if ($('cotizSubmitBtn')) $('cotizSubmitBtn').textContent = 'Actualizar Cotización';
        if ($('cotizModalTitle')) $('cotizModalTitle').innerHTML = '<i class="fa-solid fa-pen-to-square text-sky-400"></i> Editar Cotización';
        if ($('cotizModal')) $('cotizModal').classList.remove('hidden');
      };

      tr.querySelector('.del-btn').onclick = () => {
        menu.classList.add('hidden');
        if (confirm('¿Eliminar esta cotización?')) {
          records = records.filter(x => x.id !== r.id);
          saveRecords();
          renderCotizaciones();
        }
      };

      fragment.appendChild(tr);
    });
    tbody.appendChild(fragment);
  }

  // --- PEDIDOS ESPECIALES ---
  let editingPedidoId = null;
  let opDatePickerPedido = null, arrivalDatePicker = null;

  if ($('pedidoForm')) {
    opDatePickerPedido = flatpickr("#operationDate", { locale: "es", defaultDate: todayStr, dateFormat: "Y-m-d" });
    opDatePickerPedido.setDate(todayStr, true);
    arrivalDatePicker = flatpickr("#arrivalDate", { locale: "es", defaultDate: todayStr, dateFormat: "Y-m-d" });
    arrivalDatePicker.setDate(todayStr, true);

    const modal = $('pedidoModal');
    const openBtn = $('openModalBtn');
    const closeBtn = $('closeModalBtn');
    const cancelBtn = $('cancelEditBtn');

    if (openBtn) openBtn.onclick = () => { resetPedidoForm(); if (modal) modal.classList.remove('hidden'); };
    if (closeBtn) closeBtn.onclick = () => { if (modal) modal.classList.add('hidden'); };
    if (cancelBtn) cancelBtn.onclick = () => { resetPedidoForm(); if (modal) modal.classList.add('hidden'); };

    $('pedidoForm').addEventListener('submit', e => {
      e.preventDefault();
      const payload = {
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

      if (editingPedidoId) {
        const target = records.find(item => item.id === editingPedidoId);
        if (target) { Object.assign(target, payload); saveRecords(); }
      } else {
        records.unshift({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), type: 'Pedido especial', ...payload });
        saveRecords();
      }
      resetPedidoForm();
      if (modal) modal.classList.add('hidden');
      pedidosPage = 1;
      renderPedidos();
    });

    if ($('prevPedidos')) $('prevPedidos').onclick = () => { if (pedidosPage > 1) { pedidosPage--; renderPedidos(); } };
    if ($('nextPedidos')) $('nextPedidos').onclick = () => { pedidosPage++; renderPedidos(); };
    
    if ($('downloadPedidoImg')) {
      $('downloadPedidoImg').onclick = async () => {
        const allPedidos = records.filter(r => r.type === 'Pedido especial');
        if (allPedidos.length === 0) { alert('No hay pedidos especiales para capturar.'); return; }

        const tempContainer = document.createElement('div');
        tempContainer.style.position = 'absolute';
        tempContainer.style.left = '-9999px';
        tempContainer.style.top = '-9999px';
        tempContainer.style.width = '1250px';
        tempContainer.style.backgroundColor = '#0f172a';
        tempContainer.style.padding = '32px';
        tempContainer.style.borderRadius = '16px';
        tempContainer.style.color = '#f8fafc';
        tempContainer.style.fontFamily = 'sans-serif';

        let html = `
          <div style="margin-bottom: 20px;">
            <h2 style="font-size: 20px; font-weight: bold; margin: 0 0 4px 0;">Historial de Pedidos Especiales - Dpt Cotizaciones</h2>
            <p style="font-size: 12px; color: #94a3b8; margin: 0;">Total de registros: ${allPedidos.length} | Fecha de generación: ${todayStr}</p>
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left;">
            <thead>
              <tr style="background-color: #1e293b; color: #94a3b8; border-bottom: 1px solid #334155; text-transform: uppercase;">
                <th style="padding: 10px;">Clave</th>
                <th style="padding: 10px;">Descripción</th>
                <th style="padding: 10px;">Sucursal</th>
                <th style="padding: 10px;">Atención</th>
                <th style="padding: 10px;">Fecha Pedido</th>
                <th style="padding: 10px;">Fecha Llegada</th>
                <th style="padding: 10px;">Proveedor</th>
                <th style="padding: 10px;">Folio</th>
                <th style="padding: 10px;">Responsable</th>
                <th style="padding: 10px;">Estado</th>
                <th style="padding: 10px;">Ticket</th>
                <th style="padding: 10px;">Comentario</th>
              </tr>
            </thead>
            <tbody>
        `;

        allPedidos.forEach((r, idx) => {
          const st = (r.status || 'PENDIENTE').toUpperCase();
          let badgeBg = '#1e293b', badgeColor = '#cbd5e1';
          if (st.includes('PENDIENTE')) { badgeBg = 'rgba(245, 158, 11, 0.15)'; badgeColor = '#fbbf24'; }
          else if (st.includes('COMPLETADO')) { badgeBg = 'rgba(16, 185, 129, 0.15)'; badgeColor = '#34d399'; }
          else if (st.includes('DEVOLUCIÓN') || st.includes('DEVOLUCION')) { badgeBg = 'rgba(244, 63, 94, 0.15)'; badgeColor = '#fb7185'; }

          html += `
            <tr style="border-bottom: 1px solid rgba(51, 65, 85, 0.4); background-color: ${idx % 2 === 0 ? 'rgba(15, 23, 42, 0.6)' : 'transparent'};">
              <td style="padding: 10px; font-weight: bold; text-transform: uppercase;">${r.key || ''}</td>
              <td style="padding: 10px; text-transform: uppercase; color: #cbd5e1;">${r.description || ''}</td>
              <td style="padding: 10px; text-transform: uppercase; color: #cbd5e1;">${r.branch || ''}</td>
              <td style="padding: 10px; text-transform: uppercase; color: #cbd5e1;">${r.attention || ''}</td>
              <td style="padding: 10px; color: #cbd5e1;">${r.date || todayStr}</td>
              <td style="padding: 10px; color: #34d399; font-weight: 500;">${r.arrivalDate || ''}</td>
              <td style="padding: 10px; text-transform: uppercase; color: #cbd5e1;">${r.supplier || ''}</td>
              <td style="padding: 10px; text-transform: uppercase; color: #cbd5e1;">${r.folio || ''}</td>
              <td style="padding: 10px; text-transform: uppercase; color: #cbd5e1;">${r.responsible || ''}</td>
              <td style="padding: 10px; text-transform: uppercase;"><span style="padding: 4px 8px; border-radius: 6px; background-color: ${badgeBg}; color: ${badgeColor}; font-weight: 600; font-size: 10px; display: inline-block;">${st}</span></td>
              <td style="padding: 10px; text-transform: uppercase; color: #cbd5e1;">${r.ticket || ''}</td>
              <td style="padding: 10px; text-transform: uppercase; color: #cbd5e1;">${r.comment || ''}</td>
            </tr>
          `;
        });

        html += `</tbody></table>`;
        tempContainer.innerHTML = html;
        document.body.appendChild(tempContainer);

        try {
          const canvas = await html2canvas(tempContainer, { backgroundColor: '#0f172a', scale: 2 });
          const a = document.createElement('a');
          a.href = canvas.toDataURL('image/png');
          a.download = 'pedidos-especiales-reporte-completo.png';
          a.click();
        } catch (err) {
          console.error(err);
          alert('Error al generar la imagen.');
        } finally {
          document.body.removeChild(tempContainer);
        }
      };
    }

    renderPedidos();
  }

  function resetPedidoForm() {
    editingPedidoId = null;
    ['key', 'description', 'branch', 'attention', 'supplier', 'folio', 'responsible', 'ticket', 'comment'].forEach(id => { if ($(id)) $(id).value = ''; });
    if ($('status')) $('status').value = 'PENDIENTE';
    if (opDatePickerPedido) opDatePickerPedido.setDate(todayStr, true);
    if (arrivalDatePicker) arrivalDatePicker.setDate(todayStr, true);
    if ($('pedidoSubmitBtn')) $('pedidoSubmitBtn').textContent = 'Guardar Pedido';
    if ($('modalTitle')) $('modalTitle').innerHTML = '<i class="fa-solid fa-boxes-packing text-emerald-400"></i> Gestión de Pedido Especial';
    if ($('entryError')) $('entryError').textContent = '';
  }

  function renderPedidos() {
    const list = records.filter(r => r.type === 'Pedido especial');
    const totalPages = Math.ceil(list.length / PAGE_SIZE) || 1;
    if (pedidosPage > totalPages) pedidosPage = totalPages;
    const toRender = list.slice((pedidosPage - 1) * PAGE_SIZE, pedidosPage * PAGE_SIZE);

    if ($('pedidosPageInfo')) $('pedidosPageInfo').textContent = `Página ${pedidosPage} de ${totalPages}`;
    if ($('prevPedidos')) $('prevPedidos').disabled = pedidosPage === 1;
    if ($('nextPedidos')) $('nextPedidos').disabled = pedidosPage >= totalPages;

    const tbody = $('pedidosBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if ($('emptyPedidos')) $('emptyPedidos').classList.toggle('hidden', list.length > 0);

    const fragment = document.createDocumentFragment();
    toRender.forEach(r => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-800/40 transition-colors';

      const st = (r.status || 'PENDIENTE').toUpperCase();
      let statusBadgeClass = 'bg-slate-800 text-slate-300 border-slate-700';
      if (st.includes('PENDIENTE')) statusBadgeClass = 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      else if (st.includes('COMPLETADO')) statusBadgeClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      else if (st.includes('DEVOLUCIÓN') || st.includes('DEVOLUCION')) statusBadgeClass = 'bg-rose-500/10 text-rose-400 border-rose-500/30';

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
        <td class="p-3 uppercase"><span class="px-2.5 py-1 rounded-lg border text-[11px] font-semibold inline-block ${statusBadgeClass}">${st}</span></td>
        <td class="p-3 text-slate-300 uppercase">${r.ticket || ''}</td>
        <td class="p-3 text-slate-300 uppercase">${r.comment || ''}</td>
        <td class="p-3 text-right relative">
          <div class="inline-block text-left dropdown-container">
            <button type="button" class="action-toggle-btn px-2.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition inline-flex items-center gap-1.5">
              Acciones <i class="fa-solid fa-chevron-down text-[9px]"></i>
            </button>
            <div class="action-menu hidden absolute right-0 mt-1 w-32 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 py-1 text-left">
              <button class="dup-btn w-full px-3 py-1.5 text-xs text-emerald-400 hover:bg-slate-800 transition flex items-center gap-2"><i class="fa-solid fa-clone w-3.5"></i> Duplicar</button>
              <button class="edit-btn w-full px-3 py-1.5 text-xs text-sky-400 hover:bg-slate-800 transition flex items-center gap-2"><i class="fa-solid fa-pen w-3.5"></i> Editar</button>
              <button class="del-btn w-full px-3 py-1.5 text-xs text-rose-400 hover:bg-slate-800 transition flex items-center gap-2"><i class="fa-solid fa-trash w-3.5"></i> Eliminar</button>
            </div>
          </div>
        </td>
      `;

      const toggleBtn = tr.querySelector('.action-toggle-btn');
      const menu = tr.querySelector('.action-menu');
      toggleBtn.onclick = (e) => {
        e.stopPropagation();
        document.querySelectorAll('.action-menu').forEach(m => { if (m !== menu) m.classList.add('hidden'); });
        menu.classList.toggle('hidden');
      };

      tr.querySelector('.dup-btn').onclick = () => {
        menu.classList.add('hidden');
        $('key').value = '';
        $('description').value = '';
        $('branch').value = r.branch || '';
        $('attention').value = r.attention || '';
        if (opDatePickerPedido) opDatePickerPedido.setDate(r.date || todayStr, true);
        if (arrivalDatePicker) arrivalDatePicker.setDate(r.arrivalDate || todayStr, true);
        $('supplier').value = r.supplier || '';
        $('folio').value = r.folio || '';
        $('responsible').value = r.responsible || '';
        $('status').value = r.status || 'PENDIENTE';
        $('ticket').value = r.ticket || '';
        $('comment').value = r.comment || '';

        editingPedidoId = null;
        if ($('pedidoSubmitBtn')) $('pedidoSubmitBtn').textContent = 'Guardar Pedido';
        if ($('modalTitle')) $('modalTitle').innerHTML = '<i class="fa-solid fa-clone text-emerald-400"></i> Nuevo Pedido (Duplicado)';
        if ($('pedidoModal')) $('pedidoModal').classList.remove('hidden');
      };

      tr.querySelector('.edit-btn').onclick = () => {
        menu.classList.add('hidden');
        $('key').value = r.key || '';
        $('description').value = r.description || '';
        $('branch').value = r.branch || '';
        $('attention').value = r.attention || '';
        if (opDatePickerPedido) opDatePickerPedido.setDate(r.date || todayStr, true);
        if (arrivalDatePicker) arrivalDatePicker.setDate(r.arrivalDate || todayStr, true);
        $('supplier').value = r.supplier || '';
        $('folio').value = r.folio || '';
        $('responsible').value = r.responsible || '';
        $('status').value = r.status || 'PENDIENTE';
        $('ticket').value = r.ticket || '';
        $('comment').value = r.comment || '';
        editingPedidoId = r.id;
        if ($('pedidoSubmitBtn')) $('pedidoSubmitBtn').textContent = 'Actualizar Pedido';
        if ($('modalTitle')) $('modalTitle').innerHTML = '<i class="fa-solid fa-pen-to-square text-sky-400"></i> Editar Pedido Especial';
        if ($('pedidoModal')) $('pedidoModal').classList.remove('hidden');
      };

      tr.querySelector('.del-btn').onclick = () => {
        menu.classList.add('hidden');
        if (confirm('¿Eliminar pedido?')) {
          records = records.filter(x => x.id !== r.id);
          saveRecords();
          renderPedidos();
        }
      };

      fragment.appendChild(tr);
    });
    tbody.appendChild(fragment);
  }

  // --- MERCADO LIBRE ---
  if ($('mlForm')) {
    $('mlForm').addEventListener('submit', e => {
      e.preventDefault();
      const rawUrl = $('mlUrlInput').value.trim();

      records.unshift({ 
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), 
        type: 'Pedido Mercado Libre', 
        date: todayStr, 
        mlLink: rawUrl 
      });
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
    const list = records.filter(r => r.type === 'Pedido Mercado Libre');
    const totalPages = Math.ceil(list.length / PAGE_SIZE) || 1;
    if (mlPage > totalPages) mlPage = totalPages;
    const toRender = list.slice((mlPage - 1) * PAGE_SIZE, mlPage * PAGE_SIZE);

    if ($('mlViewPageInfo')) $('mlViewPageInfo').textContent = `Página ${mlPage} de ${totalPages}`;
    if ($('prevMl')) $('prevMl').disabled = mlPage === 1;
    if ($('nextMl')) $('nextMl').disabled = mlPage >= totalPages;

    const tbody = $('mlTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if ($('emptyMlView')) $('emptyMlView').classList.toggle('hidden', list.length > 0);

    const fragment = document.createDocumentFragment();
    toRender.forEach(r => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-800/40 transition-colors';
      tr.innerHTML = `
        <td class="p-3.5 text-slate-300">${r.date || todayStr}</td>
        <td class="p-3.5"><a href="${r.mlLink}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-400 hover:bg-sky-500/20 font-semibold transition">🔗 Abrir enlace</a></td>
        <td class="p-3.5 text-right"><button class="del-btn px-2.5 py-1 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 border border-rose-500/30 rounded-lg transition">Eliminar</button></td>
      `;

      tr.querySelector('.del-btn').onclick = () => {
        if (confirm('¿Eliminar enlace?')) {
          records = records.filter(x => x.id !== r.id);
          saveRecords();
          renderMl();
        }
      };
      fragment.appendChild(tr);
    });
    tbody.appendChild(fragment);
  }

  // --- DASHBOARD & ANALYTICS ---
  function initDashboard() {
    const cotizList = records.filter(r => r.type === 'Cotización');
    const firstDayMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
    updateDashboardMetrics(cotizList, firstDayMonth, todayStr);

    flatpickr("#reportRangeSelector", {
      mode: "range", locale: "es", dateFormat: "Y-m-d", defaultDate: [firstDayMonth, todayStr],
      onChange: (selectedDates, dateStr, instance) => {
        if (selectedDates.length === 2) {
          tablePagesState = {};
          updateDashboardMetrics(cotizList, instance.formatDate(selectedDates[0], "Y-m-d"), instance.formatDate(selectedDates[1], "Y-m-d"));
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
        alert('Archivos JSON exportados correctamente.');
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
              const idx = all.findIndex(r => r.id === inc.id);
              if (idx !== -1) all[idx] = { ...all[idx], ...inc };
              else all.push(inc);
            });
          } catch (err) { console.error(err); }
        }
        records = all; saveRecords(); alert('¡Importación completada!'); location.reload();
      };
    }

    if ($('purgeBtn')) {
      $('purgeBtn').onclick = () => {
        if (confirm('¿Estás seguro de eliminar todos los registros guardados?')) {
          records = []; saveRecords(); alert('¡Se han borrado todos los registros exitosamente!'); location.reload();
        }
      };
    }
  }

  function updateDashboardMetrics(cotizList, startDate, endDate) {
    const periodCotiz = cotizList.filter(r => (r.date || todayStr) >= startDate && (r.date || todayStr) <= endDate);
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
    if ($('weeklyRangeTitle')) $('weeklyRangeTitle').textContent = `Rango (${startDate} al ${endDate})`;

    const explanationBox = $('chartExplanationBox');
    if (explanationBox) {
      const highValues = [...new Set(periodCotiz.map(r => Number(r.minutes)))].filter(m => m > (promedio + desvStd)).sort((a, b) => a - b);
      const highStr = highValues.length > 0 ? highValues.join(', ') + ' min' : 'ninguno';
      explanationBox.innerHTML = `
        <p>- La desviación estándar de los <strong>${N}</strong> datos es <strong>${desvStd.toFixed(2)} min</strong></p>
        <p>- Esto indica que los datos se encuentran a <strong>${desvStd.toFixed(2)} min</strong> de distancia de la media (<strong>${promedio.toFixed(2)} min</strong>).</p>
        <p>- En resumen: <strong>${desvStd.toFixed(2)} min</strong> es una dispersión ${desvStd > 5 ? 'considerable' : 'moderada'}, con valores alejados: <strong>${highStr}</strong>.</p>
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

    const fragment = document.createDocumentFragment();
    Object.keys(groupedByDate).sort().forEach(date => {
      const items = groupedByDate[date];
      const daySum = items.reduce((acc, r) => acc + Number(r.minutes), 0);
      const dayMean = items.length > 0 ? daySum / items.length : 0;

      const numCotiz = items.length;
      const numPedidosEsp = records.filter(r => r.type === 'Pedido especial' && (r.date || todayStr) === date).length;
      const percentReal = numCotiz > 0 ? Math.round((numPedidosEsp / numCotiz) * 100) : 0;

      if (!tablePagesState[date]) tablePagesState[date] = 1;
      const pageSize = 5;
      const totalPages = Math.ceil(items.length / pageSize) || 1;
      if (tablePagesState[date] > totalPages) tablePagesState[date] = totalPages;
      const curr = tablePagesState[date];
      const toRender = items.slice((curr - 1) * pageSize, curr * pageSize);

      const card = document.createElement('div');
      card.className = 'bg-slate-950 border border-slate-800 rounded-xl overflow-hidden p-4 space-y-3';

      let html = `
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-800 pb-3 gap-3">
          <div>
            <span class="text-xs font-bold uppercase text-brand-400"><i class="fa-solid fa-calendar-day mr-1.5"></i> Fecha: ${date}</span>
            <span class="text-xs text-slate-400 ml-3">Suma: <strong>${daySum.toFixed(1)} min</strong> | Promedio: <strong class="text-brand-400">${dayMean.toFixed(1)} min</strong></span>
          </div>
          <div class="flex items-center bg-slate-900 border border-slate-800 rounded-lg overflow-hidden text-center text-xs">
            <div class="px-3 py-1 border-r border-slate-800">
              <div class="text-[9px] uppercase text-slate-400 font-bold"># Cotiz</div>
              <div class="text-white font-bold">${numCotiz}</div>
            </div>
            <div class="px-3 py-1 border-r border-slate-800">
              <div class="text-[9px] uppercase text-slate-400 font-bold">Ped Esp</div>
              <div class="text-emerald-400 font-bold">${numPedidosEsp}</div>
            </div>
            <div class="px-3 py-1 bg-brand-400/10">
              <div class="text-[9px] uppercase text-brand-400 font-bold">% Real</div>
              <div class="text-brand-400 font-extrabold">${percentReal}%</div>
            </div>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="bg-slate-900 border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                <th class="p-2.5">N</th><th class="p-2.5">Clave (xi ref)</th><th class="p-2.5">Entidad</th><th class="p-2.5">Minutos (xi)</th><th class="p-2.5">Media (x̄)</th><th class="p-2.5">Desviación (xi - x̄)</th><th class="p-2.5">Cuadrático ((xi - x̄)²)</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/40">
      `;

      toRender.forEach((r, idx) => {
        const xi = Number(r.minutes);
        const diff = xi - globalMean;
        html += `<tr class="hover:bg-slate-900/50 transition"><td class="p-2.5 text-slate-400 font-mono">${((curr - 1) * pageSize) + idx + 1}</td><td class="p-2.5 text-white font-semibold uppercase">${r.key}</td><td class="p-2.5 text-slate-300 uppercase">${r.entity || ''}</td><td class="p-2.5 text-brand-400 font-bold">${xi.toFixed(1)} min</td><td class="p-2.5 text-slate-300">${globalMean.toFixed(2)}</td><td class="p-2.5 text-slate-300">${diff.toFixed(2)}</td><td class="p-2.5 text-slate-400 font-mono">${Math.pow(diff, 2).toFixed(2)}</td></tr>`;
      });

      html += `</tbody></table></div>`;

      if (items.length > pageSize) {
        html += `
          <div class="flex items-center justify-between pt-2 px-1 text-xs text-slate-400 border-t border-slate-800/60 mt-2">
            <span>Página ${curr} de ${totalPages}</span>
            <div class="flex gap-1.5">
              <button data-date="${date}" data-action="prev" class="px-2 py-0.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 transition ${curr === 1 ? 'opacity-30 cursor-not-allowed' : ''}">Anterior</button>
              <button data-date="${date}" data-action="next" class="px-2 py-0.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 transition ${curr >= totalPages ? 'opacity-30 cursor-not-allowed' : ''}">Siguiente</button>
            </div>
          </div>
        `;
      }

      card.innerHTML = html;
      fragment.appendChild(card);
    });

    container.appendChild(fragment);

    container.querySelectorAll('button[data-date]').forEach(btn => {
      btn.onclick = () => {
        const date = btn.getAttribute('data-date');
        const action = btn.getAttribute('data-action');
        const totalPages = Math.ceil(groupedByDate[date].length / 5) || 1;
        if (action === 'prev' && tablePagesState[date] > 1) tablePagesState[date]--;
        else if (action === 'next' && tablePagesState[date] < totalPages) tablePagesState[date]++;
        renderExcelDaysTables(periodCotiz, globalMean);
      };
    });
  }

  function renderReport(periodCotiz, globalMean, globalStd) {
    if (!$('weeklyChart')) return;
    if (periodCotiz.length === 0) { if (weeklyChartInstance) { weeklyChartInstance.destroy(); weeklyChartInstance = null; } return; }

    const sortedCotiz = [...periodCotiz].sort((a, b) => (a.date || todayStr).localeCompare(b.date || todayStr));
    const ctx = $('weeklyChart').getContext('2d');
    if (weeklyChartInstance) weeklyChartInstance.destroy();

    weeklyChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: sortedCotiz.map((r, i) => `#${i + 1} (${r.key || 'N/A'})`),
        datasets: [
          { label: 'Cotización Individual (xi min)', data: sortedCotiz.map(r => Number(Number(r.minutes).toFixed(1))), borderColor: '#4ce0a0', backgroundColor: '#4ce0a0', borderWidth: 2, pointRadius: 4, tension: 0.1 },
          { label: 'Media Global (x̄)', data: sortedCotiz.map(() => Number(globalMean.toFixed(1))), borderColor: '#38bdf8', borderDash: [5, 5], borderWidth: 1.5, pointRadius: 0 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#cbd5e1' } },
          tooltip: { callbacks: { title: ctx => `Fecha: ${sortedCotiz[ctx[0].dataIndex].date || todayStr} | Clave: ${sortedCotiz[ctx[0].dataIndex].key} | Entidad: ${sortedCotiz[ctx[0].dataIndex].entity || 'N/A'}`, afterBody: () => `Desv. Estándar Global (s): ${globalStd.toFixed(2)} min` } }
        },
        scales: { x: { ticks: { color: '#94a3b8', maxTicksLimit: 15 } }, y: { beginAtZero: true, ticks: { color: '#94a3b8' } } }
      }
    });
  }

  function downloadJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
  }

  (() => {
    const l1 = "Autopartes, Toro", l2 = " Dept. Cotizaciones.";
    const el1 = $('typedLine1'), el2 = $('typedLine2');
    if (!el1 || !el2) return;
    let i = 0, j = 0, isDel = false;
    const loop = () => {
      if (!isDel && i <= l1.length) { el1.textContent = l1.substring(0, i++); setTimeout(loop, 100); }
      else if (!isDel && j <= l2.length) { el2.textContent = l2.substring(0, j++); setTimeout(loop, 100); }
      else if (!isDel) { isDel = true; setTimeout(loop, 2000); }
      else if (j > 0) { el2.textContent = l2.substring(0, --j); setTimeout(loop, 60); }
      else if (i > 0) { el1.textContent = l1.substring(0, --i); setTimeout(loop, 60); }
      else { isDel = false; setTimeout(loop, 500); }
    };
    loop();
  })();




  // --- LÓGICA PARA LA SECCIÓN DE ANÁLISIS Y FÓRMULAS ---
  let mathStep = 1;
  const maxMathSteps = 6;
  let mathAutoTimer = null;

  if ($('algoTreeSvg')) {
    const cotizList = records.filter(r => r.type === 'Cotización');
    const firstDayMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;

    initMathVisualizer(cotizList, firstDayMonth, todayStr);

    if ($('analysisRangeSelector')) {
      flatpickr("#analysisRangeSelector", {
        mode: "range", locale: "es", dateFormat: "Y-m-d", defaultDate: [firstDayMonth, todayStr],
        onChange: (selectedDates, dateStr, instance) => {
          if (selectedDates.length === 2) {
            stopMathAuto();
            mathStep = 1;
            initMathVisualizer(
              cotizList,
              instance.formatDate(selectedDates[0], "Y-m-d"),
              instance.formatDate(selectedDates[1], "Y-m-d")
            );
          }
        }
      });
    }
  }

  function initMathVisualizer(cotizList, startDate, endDate) {
    const periodCotiz = cotizList.filter(r => (r.date || todayStr) >= startDate && (r.date || todayStr) <= endDate);
    const N = periodCotiz.length;

    if (N === 0) {
      $('algoTreeSvg').innerHTML = `<text x="360" y="235" text-anchor="middle" fill="#94a3b8" font-size="14">No hay cotizaciones en el rango ${startDate} al ${endDate}</text>`;
      $('mathematicalExplanations').innerHTML = `<p class="text-xs text-slate-400 text-center">Selecciona un rango con cotizaciones registradas para ver la explicación detallada.</p>`;
      return;
    }

    const valores = periodCotiz.map(r => Number(r.minutes));
    const suma = valores.reduce((acc, v) => acc + v, 0);
    const media = suma / N;
    const diffsCuadradas = valores.map(v => Math.pow(v - media, 2));
    const sumaCuadrados = diffsCuadradas.reduce((acc, v) => acc + v, 0);
    const varianza = sumaCuadrados / N;
    const desvStd = Math.sqrt(varianza);

    const data = { periodCotiz, valores, N, suma, media, diffsCuadradas, sumaCuadrados, varianza, desvStd, startDate, endDate };

    renderMathState(mathStep, data);

    $('dbgNextBtn').onclick = () => {
      stopMathAuto();
      if (mathStep < maxMathSteps) {
        mathStep++;
        renderMathState(mathStep, data);
      }
    };

    $('dbgPrevBtn').onclick = () => {
      stopMathAuto();
      if (mathStep > 1) {
        mathStep--;
        renderMathState(mathStep, data);
      }
    };

    // Botón Reproducir / Pausar Automático
    $('dbgPlayBtn').onclick = () => {
      if (mathAutoTimer) {
        stopMathAuto();
      } else {
        const icon = $('dbgPlayIcon'), txt = $('dbgPlayText');
        if (icon) icon.className = 'fa-solid fa-pause';
        if (txt) txt.textContent = 'Pausar';

        mathAutoTimer = setInterval(() => {
          if (mathStep < maxMathSteps) {
            mathStep++;
            renderMathState(mathStep, data);
          } else {
            stopMathAuto();
            mathStep = 1;
            renderMathState(mathStep, data);
          }
        }, 3000);
      }
    };

    $('dbgResetBtn').onclick = () => {
      stopMathAuto();
      mathStep = 1;
      renderMathState(mathStep, data);
    };
  }

  function stopMathAuto() {
    if (mathAutoTimer) {
      clearInterval(mathAutoTimer);
      mathAutoTimer = null;
      const icon = $('dbgPlayIcon'), txt = $('dbgPlayText');
      if (icon) icon.className = 'fa-solid fa-play';
      if (txt) txt.textContent = 'Ejecutar';
    }
  }

  function renderMathState(step, m) {
    const svg = $('algoTreeSvg');
    const expBox = $('mathematicalExplanations');
    const titleEl = $('debuggerTitle');
    const badgeEl = $('stepBadge');
    const progEl = $('debuggerProgress');
    const formulaBadge = $('currentFormulaBadge');
    const resTitle = $('resultLabelTitle');
    const resVal = $('resultValueDisplay');
    const prevBtn = $('dbgPrevBtn');
    const nextBtn = $('dbgNextBtn');

    if (!svg) return;

    if (badgeEl) badgeEl.textContent = `ETAPA ${step} / ${maxMathSteps}`;
    if (progEl) progEl.style.width = `${Math.round((step / maxMathSteps) * 100)}%`;
    if (formulaBadge) formulaBadge.textContent = `Fórmula ${step} de ${maxMathSteps}`;

    if (prevBtn) prevBtn.disabled = step === 1;
    if (nextBtn) nextBtn.disabled = step === maxMathSteps;

    const stepTitles = [
      "1. Conteo de Cotizaciones Realizadas (N)",
      "2. Suma Total de Minutos Invertidos (Σ xᵢ)",
      "3. Cálculo del Promedio o Media Aritmética (x̄)",
      "4. Análisis de Diferencias al Cuadrado (xᵢ - x̄)²",
      "5. Cálculo de la Variabilidad o Varianza (s²)",
      "6. Obtención de la Desviación Estándar (s)"
    ];
    if (titleEl) titleEl.textContent = stepTitles[step - 1];

    let svgContent = `
      <defs>
        <linearGradient id="gradGreen" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#10b981" />
          <stop offset="100%" stop-color="#059669" />
        </linearGradient>
        <linearGradient id="gradBlue" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#38bdf8" />
          <stop offset="100%" stop-color="#0284c7" />
        </linearGradient>
        <linearGradient id="gradAmber" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#f59e0b" />
          <stop offset="100%" stop-color="#d97706" />
        </linearGradient>
      </defs>
    `;

    svgContent += `<path d="M 360 72 C 360 110, 190 95, 190 135" fill="none" stroke="#10b981" stroke-width="3" class="svg-branch ${step >= 2 ? 'active' : ''}" />`;
    svgContent += `<path d="M 360 72 C 360 110, 530 95, 530 135" fill="none" stroke="#38bdf8" stroke-width="3" class="svg-branch ${step >= 3 ? 'active' : ''}" />`;
    svgContent += `<path d="M 190 200 C 190 230, 360 215, 360 245" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-dasharray="5,4" class="svg-branch ${step >= 3 ? 'active' : ''}" />`;
    svgContent += `<path d="M 530 200 C 530 230, 360 215, 360 245" fill="none" stroke="#38bdf8" stroke-width="2.5" class="svg-branch ${step >= 3 ? 'active' : ''}" />`;
    svgContent += `<path d="M 360 310 C 360 345, 160 330, 160 370" fill="none" stroke="#38bdf8" stroke-width="3" class="svg-branch ${step >= 4 ? 'active' : ''}" />`;
    svgContent += `<path d="M 255 405 L 285 405" fill="none" stroke="#f59e0b" stroke-width="3" class="svg-branch ${step >= 5 ? 'active' : ''}" />`;
    svgContent += `<path d="M 445 405 L 475 405" fill="none" stroke="#f59e0b" stroke-width="3" class="svg-branch ${step >= 6 ? 'active' : ''}" />`;

    svgContent += `
      <g class="svg-node ${step >= 1 ? 'active' : ''}">
        <rect x="250" y="12" width="220" height="60" rx="14" fill="#0f172a" stroke="${step === 1 ? '#10b981' : '#334155'}" stroke-width="2" />
        <text x="360" y="34" text-anchor="middle" fill="#10b981" font-size="10" font-weight="bold" font-family="monospace">1. CANTIDAD (N)</text>
        <text x="360" y="56" text-anchor="middle" fill="#ffffff" font-size="15" font-weight="bold">${m.N} cotizaciones</text>
      </g>
      <g class="svg-node ${step >= 2 ? 'active' : ''}">
        <rect x="85" y="135" width="210" height="65" rx="14" fill="#0f172a" stroke="${step === 2 ? '#10b981' : '#334155'}" stroke-width="2" />
        <text x="190" y="157" text-anchor="middle" fill="#10b981" font-size="10" font-weight="bold" font-family="monospace">2. SUMA TOTAL (Σ xᵢ)</text>
        <text x="190" y="181" text-anchor="middle" fill="#34d399" font-size="15" font-weight="bold">${m.suma.toFixed(1)} min</text>
      </g>
      <g class="svg-node ${step >= 3 ? 'active' : ''}">
        <rect x="435" y="135" width="190" height="65" rx="14" fill="#0f172a" stroke="#38bdf8" stroke-width="2" />
        <text x="530" y="157" text-anchor="middle" fill="#38bdf8" font-size="10" font-weight="bold" font-family="monospace">DIVISOR TOTAL</text>
        <text x="530" y="181" text-anchor="middle" fill="#e2e8f0" font-size="14" font-weight="bold">÷ ${m.N} registros</text>
      </g>
      <g class="svg-node ${step >= 3 ? 'active' : ''}">
        <rect x="250" y="245" width="220" height="65" rx="14" fill="#0f172a" stroke="${step === 3 ? '#38bdf8' : '#334155'}" stroke-width="2" />
        <text x="360" y="267" text-anchor="middle" fill="#38bdf8" font-size="10" font-weight="bold" font-family="monospace">3. PROMEDIO (x̄)</text>
        <text x="360" y="291" text-anchor="middle" fill="#38bdf8" font-size="15" font-weight="bold">${m.media.toFixed(2)} min</text>
      </g>
      <g class="svg-node ${step >= 4 ? 'active' : ''}">
        <rect x="55" y="370" width="200" height="70" rx="14" fill="#0f172a" stroke="${step === 4 ? '#38bdf8' : '#334155'}" stroke-width="2" />
        <text x="155" y="393" text-anchor="middle" fill="#38bdf8" font-size="9.5" font-weight="bold" font-family="monospace">4. SUMA CUADRÁTICA</text>
        <text x="155" y="411" text-anchor="middle" fill="#94a3b8" font-size="10" font-family="monospace">Σ(xᵢ - x̄)²</text>
        <text x="155" y="429" text-anchor="middle" fill="#ffffff" font-size="13" font-weight="bold">${m.sumaCuadrados.toFixed(2)}</text>
      </g>
      <g class="svg-node ${step >= 5 ? 'active' : ''}">
        <rect x="285" y="370" width="160" height="70" rx="14" fill="#0f172a" stroke="${step === 5 ? '#f59e0b' : '#334155'}" stroke-width="2" />
        <text x="365" y="393" text-anchor="middle" fill="#f59e0b" font-size="9.5" font-weight="bold" font-family="monospace">5. VARIANZA (s²)</text>
        <text x="365" y="411" text-anchor="middle" fill="#94a3b8" font-size="10" font-family="monospace">Σ / N</text>
        <text x="365" y="429" text-anchor="middle" fill="#fbbf24" font-size="13" font-weight="bold">${m.varianza.toFixed(2)}</text>
      </g>
      <g class="svg-node ${step >= 6 ? 'active' : ''}">
        <rect x="475" y="370" width="190" height="70" rx="14" fill="#0f172a" stroke="#f59e0b" stroke-width="2" />
        <text x="570" y="393" text-anchor="middle" fill="#f59e0b" font-size="9.5" font-weight="bold" font-family="monospace">6. DESVIACIÓN (s)</text>
        <text x="570" y="411" text-anchor="middle" fill="#94a3b8" font-size="10" font-family="monospace">Raíz de la Varianza</text>
        <text x="570" y="429" text-anchor="middle" fill="#fbbf24" font-size="14" font-weight="bold">±${m.desvStd.toFixed(2)} min</text>
      </g>
    `;

    svg.innerHTML = svgContent;

    // EXPLICACIONES DETALLADAS
    const explanations = {
      1: `
        <div class="space-y-2.5">
          <div class="text-xs font-bold text-emerald-400 uppercase flex items-center gap-1.5">
            <i class="fa-solid fa-circle-question"></i> Paso 1: ¿Qué es N y de dónde sale?
          </div>
          <p class="text-xs text-slate-200 leading-relaxed">
            Imagina que al finalizar el día revisas tu libreta o sistema y cuentas cuántas cotizaciones realizaste en total. Ese número total es <strong>N</strong>.
          </p>
          <div class="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-emerald-300">
            <strong>En los datos actuales:</strong> El sistema contó exactamente <strong>${m.N} cotizaciones</strong> registradas en el rango seleccionado.
          </div>
          <p class="text-xs text-slate-400 leading-relaxed">
            <strong>¿Por qué es importante?</strong> Porque es la base de todo. Si no sabemos cuántas veces cotizamos, no podemos calcular promedios ni saber con cuántos datos estamos trabajando.
          </p>
        </div>
      `,
      2: `
        <div class="space-y-2.5">
          <div class="text-xs font-bold text-emerald-400 uppercase flex items-center gap-1.5">
            <i class="fa-solid fa-circle-question"></i> Paso 2: ¿Cómo se obtiene la Suma Total (Σ xᵢ)?
          </div>
          <p class="text-xs text-slate-200 leading-relaxed">
            Cada vez que cotizas una pieza, anotas o el sistema mide cuántos minutos te tomó (ej. 2 min, 5 min, 3 min). El símbolo <strong>Σ (Sigma)</strong> significa simplemente "juntar todo".
          </p>
          <div class="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-emerald-300">
            ➕ <strong>Operación aritmética:</strong> Sumamos los minutos de cada una de las ${m.N} cotizaciones: <span class="font-mono text-white">[${m.valores.slice(0, 4).join(', ')}${m.valores.length > 4 ? ', ...' : ''}]</span>
          </div>
          <p class="text-xs text-slate-400 leading-relaxed">
            <strong>Resultado:</strong> Si juntaras todo ese tiempo en un solo bloque, habrás invertido <strong>${m.suma.toFixed(1)} minutos</strong> puramente cotizando refacciones en el periodo.
          </p>
        </div>
      `,
      3: `
        <div class="space-y-2.5">
          <div class="text-xs font-bold text-sky-400 uppercase flex items-center gap-1.5">
            <i class="fa-solid fa-circle-question"></i> Paso 3: ¿Qué es el Promedio o Media (x̄)?
          </div>
          <p class="text-xs text-slate-200 leading-relaxed">
            El promedio responde a la pregunta: <em>"Si repartiéramos el tiempo total equitativamente entre cada cotización, ¿cuánto tardaría cada una?"</em>.
          </p>
          <div class="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-sky-300">
            ➗ <strong>Fórmula:</strong> (Suma total / Cantidad N) = (${m.suma.toFixed(1)} min / ${m.N})
          </div>
          <p class="text-xs text-slate-400 leading-relaxed">
            <strong>Resultado:</strong> Nos da <strong>${m.media.toFixed(2)} minutos</strong> por cotización. Este es tu estándar de velocidad habitual.
          </p>
        </div>
      `,
      4: `
        <div class="space-y-2.5">
          <div class="text-xs font-bold text-sky-400 uppercase flex items-center gap-1.5">
            <i class="fa-solid fa-circle-question"></i> Paso 4: ¿Qué son las Diferencias al Cuadrado (xᵢ - x̄)²?
          </div>
          <p class="text-xs text-slate-200 leading-relaxed">
            Aquí comparamos cada cotización individual contra tu promedio (<code class="text-sky-300">${m.media.toFixed(2)} min</code>) para ver qué tanto se desvía de lo normal.
          </p>
          <div class="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 leading-relaxed">
            <strong class="text-sky-300">¿Por qué se eleva al cuadrado? (Truco matemático):</strong><br>
            1. Si una cotización fue más rápida que el promedio, la resta sale <em>negativa</em>. Si fue más lenta, sale <em>positiva</em>. Si las sumáramos tal cual, se cancelarían y darían cero.<br>
            2. Al multiplicar cada diferencia por sí misma (al cuadrado), todo se vuelve positivo y además <strong>se castigan o exageran los retrasos grandes</strong> para prestarles atención.
          </div>
          <p class="text-xs text-slate-400 leading-relaxed">
            Sumando todos esos cuadrados de tus cotizaciones obtenemos un total de <strong>${m.sumaCuadrados.toFixed(2)}</strong>.
          </p>
        </div>
      `,
      5: `
        <div class="space-y-2.5">
          <div class="text-xs font-bold text-amber-400 uppercase flex items-center gap-1.5">
            <i class="fa-solid fa-circle-question"></i> Paso 5: ¿Qué es la Varianza (s²)?
          </div>
          <p class="text-xs text-slate-200 leading-relaxed">
            La varianza es simplemente sacar el <strong>promedio de esos cuadrados</strong> que calculamos en el paso anterior.
          </p>
          <div class="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-amber-300">
            ➗ <strong>Operación:</strong> (Suma Cuadrática / N) = (${m.sumaCuadrados.toFixed(2)} / ${m.N})
          </div>
          <p class="text-xs text-slate-400 leading-relaxed">
            <strong>Resultado:</strong> Da <strong>${m.varianza.toFixed(2)}</strong>. Sin embargo, como elevamos los números al cuadrado en el paso 4, esta unidad quedó "al cuadrado" (no son minutos normales), por lo que pasamos al último paso.
          </p>
        </div>
      `,
      6: `
        <div class="space-y-2.5">
          <div class="text-xs font-bold text-amber-400 uppercase flex items-center gap-1.5">
            <i class="fa-solid fa-circle-question"></i> Paso 6: ¿Para qué sirve la Desviación Estándar (s)?
          </div>
          <p class="text-xs text-slate-200 leading-relaxed">
            Es la métrica reina. Como la varianza estaba en "minutos cuadrados", le sacamos la <strong>raíz cuadrada</strong> para regresar a los minutos reales de reloj.
          </p>
          <div class="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-amber-300">
            📐 <strong>Operación final:</strong> Raíz cuadrada de la varianza = √(${m.varianza.toFixed(2)})
          </div>
          <p class="text-xs text-slate-400 leading-relaxed">
            <strong>Conclusión para el mostrador:</strong> Tu desviación es <strong>±${m.desvStd.toFixed(2)} min</strong>. Esto significa que aunque tu promedio al cotizar es de <code class="text-sky-300">${m.media.toFixed(2)} min</code>, tus tiempos normales se mueven en un rango seguro de más/menos ese margen.
          </p>
        </div>
      `
    };

    expBox.innerHTML = explanations[step];

    const resultTitles = [
      "Total de Registros (N)",
      "Suma Acumulada (Σ xᵢ)",
      "Promedio Calculado (x̄)",
      "Suma de Desviaciones Cuadráticas",
      "Variabilidad (Varianza s²)",
      "Desviación Estándar Final (s)"
    ];
    const resultValues = [
      `${m.N} cotizaciones`,
      `${m.suma.toFixed(1)} minutos`,
      `${m.media.toFixed(2)} min por cotización`,
      `${m.sumaCuadrados.toFixed(2)}`,
      `${m.varianza.toFixed(2)}`,
      `±${m.desvStd.toFixed(2)} min`
    ];

    if (resTitle) resTitle.textContent = resultTitles[step - 1];
    if (resVal) resVal.textContent = resultValues[step - 1];
  }


  // --- IMPORTADOR DE EXCEL CRUDO (SheetJS) ---

  const normalizeTxt = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  const upTxt = v => String(v ?? '').trim().toUpperCase();
  const pad2 = n => String(n).padStart(2, '0');

  function excelToISO(v) {
    if (typeof v === 'number' && v > 40000 && v < 60000) {
      const d = XLSX.SSF.parse_date_code(v);
      if (d) return `${d.y}-${pad2(d.m)}-${pad2(d.d)}`;
    }
    const m = String(v ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return m ? `${m[3]}-${pad2(m[2])}-${pad2(m[1])}` : '';
  }

  function importarCotizaciones(sheet) {
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
    let count = 0;
    if (!rows.length) return count;

    [3, 8, 13, 18, 23, 28].forEach(colClave => {
      const colEntidad = colClave + 1;
      const colMinutos = colClave + 2;

      let blockDate = todayStr;
      for (let r = 0; r < Math.min(4, rows.length); r++) {
        const f = excelToISO(rows[r] ? rows[r][colClave] : '');
        if (f) { blockDate = f; break; }
      }

      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row) continue;

        const clave = row[colClave];
        if (clave === undefined || clave === null || String(clave).trim() === '') break;

        const key = upTxt(clave);
        if (key === 'CLAVE' || key === 'NO' || key === 'NO.' || key.includes('/2026')) continue;

        records.push({
          id: 'cot_' + Math.random().toString(36).substr(2, 9),
          type: 'Cotización',
          key,
          entity: row[colEntidad] ? upTxt(row[colEntidad]) : 'MOSTRADOR',
          minutes: Number(row[colMinutos]) || 5,
          date: blockDate
        });
        count++;
      }
    });
    return count;
  }

  function importarPedidos(ws) {
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
    let importados = 0, omitidos = 0;
    if (!rows.length) return { importados, omitidos };

    const startR = XLSX.utils.decode_range(ws['!ref']).s.r;

    const statusByColor = cell => {
      const rgb = cell && cell.s && cell.s.fgColor && cell.s.fgColor.rgb;
      if (!rgb || rgb.length < 6) return '';
      const hex = rgb.slice(-6);
      const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
      if (r > 200 && g < 100 && b < 100) return 'DEVOLUCIÓN';
      if (r > 200 && g > 200 && b < 120) return 'PENDIENTE';
      if (g > 180 && r < 170 && b < 170) return 'COMPLETADO';
      return '';
    };

    let headerIdx = -1, c0 = -1;
    for (let r = 0; r < Math.min(rows.length, 6) && headerIdx === -1; r++) {
      const c = (rows[r] || []).findIndex(cell => normalizeTxt(cell) === 'clave');
      if (c !== -1) { headerIdx = r; c0 = c; }
    }
    if (headerIdx === -1) { console.warn('No se encontró encabezado CLAVE en la hoja de pedidos'); return { importados, omitidos }; }

    const cEstado = c0 + 9;

    for (let r = headerIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row) continue;

      const clave = row[c0];
      if (clave === undefined || clave === null || String(clave).trim() === '') continue;

      const key = upTxt(clave);
      const date = excelToISO(row[c0 + 4]) || todayStr;
      const arrivalDate = excelToISO(row[c0 + 5]);
      const folio = upTxt(row[c0 + 7]);
      const ticket = upTxt(row[c0 + 10]);
      const comment = upTxt(row[c0 + 11]);

      const existe = records.some(x =>
        x.type === 'Pedido especial' && x.key === key && x.date === date && (x.folio || '') === folio
      );
      if (existe) { omitidos++; continue; }

      let status;
      if (comment.includes('DEVOL')) {
        status = 'DEVOLUCIÓN';
      } else {
        const cell = ws[XLSX.utils.encode_cell({ r: startR + r, c: cEstado })];
        status = statusByColor(cell) || (ticket ? 'COMPLETADO' : 'PENDIENTE');
      }

      records.push({
        id: 'ped_' + Math.random().toString(36).substr(2, 9),
        type: 'Pedido especial',
        key,
        description: upTxt(row[c0 + 1]),
        branch: upTxt(row[c0 + 2]),
        attention: upTxt(row[c0 + 3]),
        date,
        arrivalDate,
        supplier: upTxt(row[c0 + 6]),
        folio,
        responsible: upTxt(row[c0 + 8]),
        status,
        ticket,
        comment
      });
      importados++;
    }
    return { importados, omitidos };
  }

  const excelFileInput = $('excelFileInput');
  if (excelFileInput) {
    excelFileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const workbook = XLSX.read(new Uint8Array(event.target.result), { type: 'array', cellStyles: true });

          records = records.filter(r => r.type !== 'Pedido Especial');

          let cotiz = 0, pedidos = 0, omitidos = 0;

          workbook.SheetNames.forEach(sheetName => {
            const name = normalizeTxt(sheetName);
            const ws = workbook.Sheets[sheetName];

            if (name.includes('cotiz')) {
              cotiz += importarCotizaciones(ws);
            } else if (name.includes('pedido')) {
              const res = importarPedidos(ws);
              pedidos += res.importados;
              omitidos += res.omitidos;
            }
          });

          if (cotiz > 0 || pedidos > 0 || omitidos > 0) {
            saveRecords();
            alert(
              `Importación completada.\n\n` +
              `Cotizaciones: ${cotiz}\n` +
              `Pedidos especiales: ${pedidos}\n` +
              `Pedidos duplicados omitidos: ${omitidos}`
            );
            location.reload();
          } else {
            alert('No se encontraron registros. Verifica que existan las hojas "COTIZ" y "PEDIDO ESPECIALES".');
          }
        } catch (err) {
          console.error('Error en importación:', err);
          alert('Error al importar Excel: ' + err.message);
        } finally {
          excelFileInput.value = '';
        }
      };
      reader.readAsArrayBuffer(file);
    };
  }


})();