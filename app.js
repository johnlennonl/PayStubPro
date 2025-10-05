// app.js (VERSIÓN ACTUALIZADA: SEARCH + SWEETALERT + ELIMINAR PAYSTUB)

// ======================= UTILIDADES GLOBALES =======================
const formatCurrency = (number) => {
    return '$' + Number(number || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

const getModalInstance = (id) => {
    const modalElement = document.getElementById(id);
    return bootstrap.Modal.getInstance(modalElement) || new bootstrap.Modal(modalElement);
};
// ======================= ESTADO APP =======================
let activeClientId = null;
let calculatedYTDData = null;
let currentPaystubId = null; // <-- DEJAR SOLO ESTA DECLARACIÓN
let currentClientId = null;  // <-- DEJAR SOLO ESTA DECLARACIÓN

// ======================= AUTH / REDIRECCIÓN =======================
if (typeof auth === 'undefined') {
  console.error("Firebase Auth no inicializado. Revisa la carga de scripts.");
}

// ---------- Manejo de login ----------
const handleLogin = (event) => {
  event.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;

  auth.signInWithEmailAndPassword(email, password)
    .then(() => {
      Toastify({ text: "¡Inicio de sesión exitoso! Redirigiendo...", duration: 1800 }).showToast();
      window.location.href = 'dashboard.html';
    })
    .catch((error) => {
      let errorMessage = "Error al iniciar sesión. Verifica tus credenciales.";
      if (error.code === 'auth/wrong-password') errorMessage = "Contraseña incorrecta.";
      Toastify({ text: errorMessage, duration: 4000 }).showToast();
    });
};

// ---------- Observador de estado ----------
if (auth && typeof auth.onAuthStateChanged === 'function') {
  auth.onAuthStateChanged((user) => {
    const currentPage = window.location.pathname.split('/').pop();
    if (user) {
      if (currentPage === 'index.html' || currentPage === '' || currentPage === undefined) {
        window.location.href = 'dashboard.html';
      } else if (currentPage === 'dashboard.html') {
        loadClients(user.uid);
      }
    } else {
      if (currentPage === 'dashboard.html') window.location.href = 'index.html';
    }
  });
}

// ---------- Logout ----------
document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'logoutBtn') {
    // SweetAlert confirm logout (opcional)
    if (typeof Swal !== 'undefined') {
      Swal.fire({
        title: 'Cerrar sesión',
        text: '¿Deseas cerrar sesión?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sí, salir',
        cancelButtonText: 'Cancelar'
      }).then(result => {
        if (result.isConfirmed) {
          auth.signOut().then(() => window.location.href = 'index.html');
        }
      });
    } else {
      auth.signOut().then(() => window.location.href = 'index.html');
    }
  }
});

// ======================= CRUD CLIENTES =======================
const loadClients = (userId) => {
  const clientsTableBody = document.getElementById('clientsTableBody');
  if (!clientsTableBody) return console.error("#clientsTableBody no encontrado.");

  db.collection('clients')
    .where('userId', '==', userId)
    .orderBy('name')
    .onSnapshot((snapshot) => {
      clientsTableBody.innerHTML = '';
      if (snapshot.empty) {
        clientsTableBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Aún no tienes clientes registrados.</td></tr>';
        return;
      }
      snapshot.forEach(doc => {
        const client = doc.data();
        client.id = doc.id;
        const grossPayYTDTotal = (client.ytdRegular || 0) + (client.ytdOvertime || 0);
        const clientNameEsc = (client.name || '').replace(/'/g, "\\'");

        const row = document.createElement('tr');
        row.id = `client-row-${client.id}`;
        row.innerHTML = `
          <td class="info">${client.name || ''}</td>
          <td class="info">${client.empresa || ''} / ${client.state || ''}</td>
          <td class="info">${formatCurrency(grossPayYTDTotal)}</td>

          <td>
            <button class="btnCloud" data-bs-toggle="modal"
                    data-bs-target="#historyModal"
                    onclick="loadClientHistory('${client.id}', '${clientNameEsc}')">
                💾 Ver historial
            </button>
          </td>

          <td class="d-flex gap-2">
            <button class="btn btn-sm btn-primary select-client-btn" data-client-id="${client.id}">Seleccionar</button>
            <button class="btn btn-sm btn-danger delete-client-btn" data-client-id="${client.id}">Eliminar</button>
          </td>
        `;
        clientsTableBody.appendChild(row);
      });

      // Listeners
      document.querySelectorAll('.select-client-btn').forEach(button => {
        button.removeEventListener('click', selectClientForSimulation);
        button.addEventListener('click', selectClientForSimulation);
      });

      document.querySelectorAll('.delete-client-btn').forEach(button => {
        button.removeEventListener('click', handleDeleteClient);
        button.addEventListener('click', handleDeleteClient);
      });

      // Apply current search filter if any
      applyClientSearchFilter();
    }, (error) => {
      console.error("Error al cargar clientes: ", error);
      Toastify({ text: "Error al cargar clientes. Revisa la consola.", duration: 4000 }).showToast();
    });
};

const handleAddClient = (event) => {
  event.preventDefault();
  const name = document.getElementById('newClientName').value;
  if (!name) return Toastify({ text: "Nombre es requerido", duration: 2500 }).showToast();

  const empresa = document.getElementById('newClientEmpresa').value || '';
  const state = document.getElementById('newStateSelector').value || 'TX';
  const rate = parseFloat(document.getElementById('newHourlyRate').value || 0);
  const ytdRegular = parseFloat(document.getElementById('newYtdRegular').value || 0);
  const ytdOvertime = parseFloat(document.getElementById('newYtdOvertime').value || 0);

  const newClientData = {
    userId: auth.currentUser.uid,
    name,
    empresa,
    state,
    hourlyRate: rate,
    ytdRegular,
    ytdOvertime,
    totalTaxesYTD: 0,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  db.collection('clients').add(newClientData)
    .then(() => {
      Toastify({ text: `¡Cliente ${name} registrado!`, duration: 2800 }).showToast();
      getModalInstance('addClientModal').hide();
      document.getElementById('addClientForm').reset();
    })
    .catch((error) => {
      console.error("Error añadiendo cliente:", error);
      Toastify({ text: "Error al registrar cliente.", duration: 3000 }).showToast();
    });
};

// ======================= ELIMINAR CLIENTE (con SweetAlert2) =======================
const handleDeleteClient = (event) => {
  const clientId = event.currentTarget.dataset.clientId;
  if (!clientId) return;

  const doDelete = () => {
    db.collection('clients').doc(clientId).delete()
      .then(() => {
        Toastify({ text: "Cliente eliminado correctamente.", duration: 3000 }).showToast();
      })
      .catch(error => {
        console.error("Error eliminando cliente:", error);
        Toastify({ text: "Error al eliminar cliente.", duration: 3000 }).showToast();
      });
  };

  if (typeof Swal !== 'undefined') {
    Swal.fire({
      title: 'Eliminar cliente',
      text: '¿Estás seguro? Se eliminará el cliente y su historial de paystubs.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    }).then(result => {
      if (result.isConfirmed) doDelete();
    });
  } else {
    if (confirm("¿Seguro que deseas eliminar este cliente? Esta acción no se puede deshacer.")) {
      doDelete();
    }
  }
};

// ======================= SELECCIONAR CLIENTE =======================
const selectClientForSimulation = (event) => {
  const clientId = event.currentTarget.dataset.clientId;
  if (!clientId) return;

  db.collection('clients').doc(clientId).get()
    .then(doc => {
      if (!doc.exists) return Toastify({ text: "Cliente no encontrado.", duration: 2000 }).showToast();
      const clientData = doc.data();
      activeClientId = doc.id;

      // llenar formulario
      const safeToFixed = (v) => (typeof v === 'number') ? v.toFixed(2) : (v || 0).toString();
      document.getElementById('clientName').value = clientData.name || '';
      document.getElementById('stateSelector').value = clientData.state || 'TX';
      document.getElementById('hourlyRate').value = safeToFixed(clientData.hourlyRate || 0);
      document.getElementById('ytdRegular').value = safeToFixed(clientData.ytdRegular || 0);
      document.getElementById('ytdOvertime').value = safeToFixed(clientData.ytdOvertime || 0);

      // Cargar YTD de impuestos previo (campo hidden en el form)
      const ytdTaxesInput = document.getElementById('ytdTaxesInitial');
      if (ytdTaxesInput) ytdTaxesInput.value = safeToFixed(clientData.totalTaxesYTD || 0);

      document.getElementById('regularHours').value = '';
      document.getElementById('overtimeHours').value = '0.00';
      document.getElementById('resultsSection').style.display = 'none';
      document.getElementById('saveButton').disabled = true;

      // habilitar simulador y cambiar tab
      document.getElementById('calculateButton').disabled = false;
      document.getElementById('simulator-tab').disabled = false;

      // asegurar tab instance
      const simulatorTabElement = document.getElementById('simulator-tab');
      let simulatorTabInstance = bootstrap.Tab.getInstance(simulatorTabElement);
      if (!simulatorTabInstance) {
        simulatorTabInstance = new bootstrap.Tab(simulatorTabElement);
      }
      simulatorTabInstance.show();

      Toastify({ text: `¡${clientData.name} seleccionado!`, duration: 2200 }).showToast();

      // Generar checkboxes de taxes según estado (solo las deducciones del estado seleccionado)
      const state = clientData.state || 'TX';
      const stateRates = TAX_RATES[state];
      const container = document.getElementById('taxOptionsContainer');
      if (container) {
        container.innerHTML = '';
        if (stateRates) {
          const federalTaxes = [
            { name: "Federal Income Tax", rate: stateRates.FIT_RATE },
            { name: "Social Security Tax", rate: stateRates.SS_RATE },
            { name: "Medicare Tax", rate: stateRates.MEDICARE_RATE }
          ];
          // Mostrar SOLO los impuestos que correspondan (federales + stateRates.STATE_TAXES)
          [...federalTaxes, ...stateRates.STATE_TAXES].forEach(tax => {
            const id = `tax-${tax.name.replace(/\s+/g, '-')}`;
            container.innerHTML += `
              <div class="form-check">
                <input class="form-check-input tax-checkbox" type="checkbox" id="${id}" data-name="${tax.name}" data-rate="${tax.rate}" checked>
                <label class="form-check-label" for="${id}">
                  ${tax.name} (${(tax.rate * 100).toFixed(2)}%)
                </label>
              </div>
            `;
          });
        }
      }
    })
    .catch(error => {
      console.error("Error al seleccionar cliente:", error);
      Toastify({ text: "Error al cargar datos del cliente.", duration: 3000 }).showToast();
    });
};

// ======================= CALCULAR PAYSTUB =======================
const calculatePaystub = (event) => {
  event.preventDefault();

  if (!activeClientId) {
    Toastify({ text: "Selecciona un cliente para simular.", duration: 2500 }).showToast();
    return;
  }

  const state = document.getElementById('stateSelector').value;
  const rate = parseFloat(document.getElementById('hourlyRate').value || 0);
  const regularHours = parseFloat(document.getElementById('regularHours').value || 0);
  const overtimeHours = parseFloat(document.getElementById('overtimeHours').value || 0);

  const ytdRegularInitial = parseFloat(document.getElementById('ytdRegular').value || 0);
  const ytdOvertimeInitial = parseFloat(document.getElementById('ytdOvertime').value || 0);
  const ytdTaxesInitial = parseFloat(document.getElementById('ytdTaxesInitial')?.value || 0);

  if (!state || isNaN(rate) || isNaN(regularHours) || regularHours <= 0) {
    Toastify({ text: "¡Error! Ingresa horas regulares válidas (>0).", duration: 2800 }).showToast();
    return;
  }

  const stateRates = TAX_RATES[state];
  if (!stateRates) {
    Toastify({ text: "No hay tasas definidas para el estado seleccionado.", duration: 3000 }).showToast();
    return;
  }

  // bruto
  const regularPay = rate * regularHours;
  const overtimeRate = rate * 1.5;
  const overtimePay = overtimeRate * overtimeHours;
  const grossPayPeriod = regularPay + overtimePay;

  // impuestos seleccionados (solo los checkeados)
  let totalTaxPeriod = 0;
  const taxDetails = [];

  document.querySelectorAll('.tax-checkbox:checked').forEach(input => {
    const r = parseFloat(input.dataset.rate);
    const name = input.dataset.name;
    const taxAmount = grossPayPeriod * r;
    totalTaxPeriod += taxAmount;
    taxDetails.push({ name, amount: taxAmount, rate: r });
  });

  // neto
  const netPayPeriod = grossPayPeriod - totalTaxPeriod;

  // YTD de Ganancias (Acumulados)
  const ytdRegularNew = ytdRegularInitial + regularPay;
  const ytdOvertimeNew = ytdOvertimeInitial + overtimePay;
  const grossPayYTDTotalNew = ytdRegularNew + ytdOvertimeNew;

  // totalTaxYTDNew = ytdTaxesInitial + totalTaxPeriod
  const totalTaxYTDNew = ytdTaxesInitial + totalTaxPeriod;

  // Para mostrar detalles YTD por impuesto: usamos grossPayYTDTotalNew * tasa (fallback claro)
  let taxYtdDetails = {};
  let totalTaxYtdCalculatedFromGross = 0;
  document.querySelectorAll('.tax-checkbox:checked').forEach(input => {
    const name = input.dataset.name;
    const r = parseFloat(input.dataset.rate);
    const ytdIndividual = grossPayYTDTotalNew * r;
    taxYtdDetails[name] = ytdIndividual;
    totalTaxYtdCalculatedFromGross += ytdIndividual;
  });

  const finalTotalTaxYTDToShow = totalTaxYtdCalculatedFromGross;

  calculatedYTDData = {
    ytdRegular: ytdRegularNew,
    ytdOvertime: ytdOvertimeNew,
    totalTaxesYTD: totalTaxYTDNew, // guardamos el acumulado real (prev + periodo)
    netPayPeriod: netPayPeriod,
    periodTaxTotal: totalTaxPeriod,
    taxDetails: taxDetails
  };

  renderResults({
    grossPayPeriod,
    netPayPeriod,
    ytdRegularNew,
    ytdOvertimeNew,
    grossPayYTDTotalNew,
    totalTaxYTDNew: finalTotalTaxYTDToShow,
    taxDetails,
    taxYtdDetails
  });

  document.getElementById('saveButton').disabled = false;
  Toastify({ text: `¡Cálculo generado! Net Pay: ${formatCurrency(netPayPeriod)}`, duration: 3500 }).showToast();
};

// ======================= RENDER RESULTADOS =======================
const renderResults = (data) => {
  const resultsContent = document.getElementById('resultsContent');
  const resultsSection = document.getElementById('resultsSection');
  if (!resultsContent || !resultsSection) return;

  resultsSection.style.display = 'block';

  const taxRows = data.taxDetails.map(tax => {
    const newYTDValue = data.taxYtdDetails ? (data.taxYtdDetails[tax.name] || 0) : 0;
    return `
      <tr>
        <td>${tax.name}</td>
        <td>${(tax.rate * 100).toFixed(2)}%</td>
        <td class="text-danger">${formatCurrency(tax.amount * -1)}</td>
        <td>${formatCurrency(newYTDValue)}</td>
      </tr>
    `;
  }).join('');

  const totalPeriodTaxes = (data.grossPayPeriod - data.netPayPeriod);

  resultsContent.innerHTML = `
    <h4 class="text-center mb-3">Resumen del Período</h4>
    <div class="row mb-4">
      <div class="col-md-6">
        <p class="fs-5 text-success"><strong>Gross Pay (Bruto):</strong> ${formatCurrency(data.grossPayPeriod)}</p>
      </div>
      <div class="col-md-6">
        <p class="fs-5 text-primary"><strong>Net Pay (Neto):</strong> ${formatCurrency(data.netPayPeriod)}</p>
      </div>
    </div>

    <h4 class="mb-3">Deducciones por Período y YTD</h4>
    <div class="table-responsive mb-4">
      <table class="table table-striped table-hover">
        <thead class="table-dark">
          <tr>
            <th>Deducción</th>
            <th>Tasa</th>
            <th>Período Actual</th>
            <th>NUEVO YTD</th>
          </tr>
        </thead>
        <tbody>
          ${taxRows}
          <tr class="table-info">
            <td><strong>TOTAL ACUMULADO</strong></td>
            <td></td>
            <td class="text-danger"><strong>${formatCurrency(totalPeriodTaxes)}</strong></td>
            <td><strong>${formatCurrency(data.totalTaxYTDNew)}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>

    <h4 class="mb-3">Acumulados de Ganancias (YTD)</h4>
    <div class="table-responsive">
      <table class="table table-bordered">
        <thead class="table-primary">
          <tr><th>Concepto</th><th>Monto YTD</th></tr>
        </thead>
        <tbody>
          <tr><td>Regular Pay YTD</td><td>${formatCurrency(data.ytdRegularNew)}</td></tr>
          <tr><td>Overtime Pay YTD</td><td>${formatCurrency(data.ytdOvertimeNew)}</td></tr>
          <tr class="table-success"><td><strong>GROSS PAY YTD TOTAL</strong></td><td><strong>${formatCurrency(data.grossPayYTDTotalNew)}</strong></td></tr>
        </tbody>
      </table>
    </div>
  `;
};

// ======================= GUARDAR (UPDATE) YTD Y REGISTRAR PAYSTUB =======================
const handleSavePaystub = () => {
  if (!activeClientId || !calculatedYTDData) {
    Toastify({ text: "Error: No hay cálculo ni cliente activo para guardar.", duration: 3000 }).showToast();
    return;
  }

  const rate = parseFloat(document.getElementById('hourlyRate').value || 0);
  const regularHours = parseFloat(document.getElementById('regularHours').value || 0);
  const overtimeHours = parseFloat(document.getElementById('overtimeHours').value || 0);
  const payFrequency = document.getElementById('payFrequency')?.value || 'Semanal';
  const paystubDateValue = document.getElementById('paystubDate')?.value;

  const regularPay = rate * regularHours;
  const overtimePay = (rate * 1.5) * overtimeHours;
  const grossPayPeriod = regularPay + overtimePay;

  const netPayPeriod = calculatedYTDData.netPayPeriod;
  const totalTaxPeriod = calculatedYTDData.periodTaxTotal;

  const updateData = {
    ytdRegular: calculatedYTDData.ytdRegular,
    ytdOvertime: calculatedYTDData.ytdOvertime,
    totalTaxesYTD: calculatedYTDData.totalTaxesYTD,
    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
  };

  const paystubRecord = {
    date: paystubDateValue ? new Date(paystubDateValue) : firebase.firestore.FieldValue.serverTimestamp(),
    payFrequency: payFrequency,
    grossPayPeriod: grossPayPeriod,
    netPayPeriod: netPayPeriod,
    regularHours,
    overtimeHours,
    totalTaxPeriod: totalTaxPeriod,
    taxDetails: calculatedYTDData.taxDetails,
    ytdData: {
      ytdRegular: calculatedYTDData.ytdRegular,
      ytdOvertime: calculatedYTDData.ytdOvertime,
      totalTaxesYTD: calculatedYTDData.totalTaxesYTD
    },
    calculatedBy: auth.currentUser.email || 'Usuario Desconocido'
  };

  const batch = db.batch();
  const clientRef = db.collection('clients').doc(activeClientId);
  const paystubRef = clientRef.collection('paystubs').doc();

  batch.update(clientRef, updateData);
  batch.set(paystubRef, paystubRecord);

  batch.commit()
    .then(() => {
      if (typeof Swal !== 'undefined') {
        Swal.fire({ icon: 'success', title: 'Guardado', text: 'YTD actualizado y paystub registrado.' });
      } else {
        Toastify({ text: "✅ ¡YTD Actualizado y Paystub Registrado!", duration: 3000 }).showToast();
      }

      document.getElementById('resultsSection').style.display = 'none';
      document.getElementById('saveButton').disabled = true;
      const simulatorTabElement = document.getElementById('simulator-tab');
      if (simulatorTabElement) simulatorTabElement.disabled = true;
      const clientsTab = document.getElementById('clients-tab');
      if (clientsTab) bootstrap.Tab.getInstance(clientsTab).show();

      activeClientId = null;
      calculatedYTDData = null;
    })
    .catch(error => {
      console.error("Error al guardar YTD y registrar paystub:", error);
      Toastify({ text: "Error de conexión al guardar el registro.", duration: 3000 }).showToast();
    });
};

// ======================= HISTORIAL: CARGAR Y MOSTRAR =======================
const loadClientHistory = (clientId, clientName) => {
  document.getElementById('clientHistoryName').textContent = clientName || '';
  const historyBody = document.getElementById('paystubHistoryBody');
  if (!historyBody) return;

  historyBody.innerHTML = '<tr><td colspan="6" class="text-center"><i class="fas fa-spinner fa-spin me-2"></i> Cargando historial...</td></tr>';

  db.collection('clients').doc(clientId).collection('paystubs')
    .orderBy('date', 'desc')
    .get()
    .then(snapshot => {
      historyBody.innerHTML = '';
      if (snapshot.empty) {
        historyBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No hay registros de paystubs para este cliente.</td></tr>';
        return;
      }

      snapshot.forEach(doc => {
        const paystub = doc.data();
        paystub.id = doc.id;
        const date = paystub.date && typeof paystub.date.toDate === 'function' ? paystub.date.toDate().toLocaleDateString() : 'N/A';
        const grossYTD = (paystub.ytdData?.ytdRegular || 0) + (paystub.ytdData?.ytdOvertime || 0);
        const ytdSummary = `Gross: ${formatCurrency(grossYTD)} | Tax: ${formatCurrency(paystub.ytdData?.totalTaxesYTD || 0)}`;

        const row = `
          <tr>
            <td>${date}</td>
            <td>${paystub.payFrequency || 'Semanal'}</td>
            <td>${formatCurrency(paystub.grossPayPeriod)}</td>
            <td style="font-size: 0.85rem;">${ytdSummary}</td>
            <td>
              <button class="btn btn-primary btn-sm" onclick="showPaystubDetails('${paystub.id}', '${clientId}')" title="Ver detalle completo del cheque">
                <i class="fas fa-eye"></i> Ver
              </button>
            </td>
            <td>
              <button class="btn btn-sm btn-danger" onclick="handleDeletePaystub('${paystub.id}', '${clientId}')">
                <i class="fas fa-trash"></i> Eliminar
              </button>
            </td>
          </tr>
        `;
        historyBody.insertAdjacentHTML('beforeend', row);
      });
    })
    .catch(error => {
      console.error("Error al cargar historial:", error);
      historyBody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Error al cargar el historial de pagos.</td></tr>';
    });
};

// ======================= ELIMINAR PAYSTUB (con SweetAlert2) =======================
const handleDeletePaystub = (paystubId, clientId) => {
  if (!paystubId || !clientId) return;

  const doDelete = () => {
    db.collection('clients').doc(clientId).collection('paystubs').doc(paystubId).delete()
      .then(() => {
        Toastify({ text: "Paystub eliminado correctamente.", duration: 2500 }).showToast();
        // refrescar el historial si el modal está abierto
        const clientName = document.getElementById('clientHistoryName')?.textContent || '';
        loadClientHistory(clientId, clientName);
      })
      .catch(error => {
        console.error("Error eliminando paystub:", error);
        Toastify({ text: "Error al eliminar paystub.", duration: 3000 }).showToast();
      });
  };

  if (typeof Swal !== 'undefined') {
    Swal.fire({
      title: 'Eliminar paystub',
      text: '¿Seguro que deseas eliminar este registro de pago?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    }).then(result => {
      if (result.isConfirmed) doDelete();
    });
  } else {
    if (confirm("¿Seguro que deseas eliminar este paystub?")) doDelete();
  }
};

// --------------------------------------------------------------------------
// 1. VARIABLES GLOBALES DE ESTADO (Coloca esto al inicio de tu script JS)
// Estas variables mantienen el ID del paystub actualmente visible en el modal.

// ======================= MOSTRAR DETALLE DEL PAYSTUB =======================
const showPaystubDetails = (paystubId, clientId) => {
   currentPaystubId = paystubId; 
    currentClientId = clientId;

    const detailBody = document.getElementById('paystubDetailBody');
    if (!detailBody) return;
    detailBody.innerHTML = '<p class="text-center"><i class="fas fa-spinner fa-spin me-2"></i> Cargando detalles...</p>';

    db.collection('clients').doc(clientId).collection('paystubs').doc(paystubId).get()
        .then(doc => {
            if (!doc.exists) {
                detailBody.innerHTML = '<p class="text-danger">Detalle del Paystub no encontrado.</p>';
                return;
            }
            const paystub = doc.data();
            const formatCurrencyLocal = (amount) => `$${(amount || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
            const date = paystub.date && paystub.date.toDate ? paystub.date.toDate().toLocaleDateString() : 'N/A';
            document.getElementById('detailPaystubDate').textContent = date;

            // Tax rows (La lógica de mapeo de taxDetailsRows se mantiene)
            let taxDetailsRows = '';
            const grossYTDThisPaystub = (paystub.ytdData?.ytdRegular || 0) + (paystub.ytdData?.ytdOvertime || 0);
            if (paystub.taxDetails && Array.isArray(paystub.taxDetails)) {
                taxDetailsRows = paystub.taxDetails.map(tax => {
                    let ytdTaxValue = 0;
                    if (paystub.taxYtdDetails && paystub.taxYtdDetails[tax.name]) {
                        ytdTaxValue = paystub.taxYtdDetails[tax.name];
                    } else {
                        ytdTaxValue = grossYTDThisPaystub * (tax.rate || 0);
                    }
                    return `
                        <tr>
                            <td>${tax.name}</td>
                            <td>${((tax.rate || 0) * 100).toFixed(2)}%</td>
                            <td class="text-danger">${formatCurrencyLocal((tax.amount || 0) * -1)}</td>
                            <td>${formatCurrencyLocal(ytdTaxValue)}</td>
                        </tr>
                    `;
                }).join('');
            }

            // INYECCIÓN DEL HTML AL MODAL (RESPONSIVE)
            detailBody.innerHTML = `
                <div class="paystub-view p-4 rounded shadow-lg bg-white">
                    
                    <h5 class="typeCheck">${(paystub.payFrequency || 'SEMANAL').toUpperCase()} Paycheck</h5>
                    
                    <div class="row mb-4">
                        <div class="col-6">
                            <p class="mb-0 text-muted small">Fecha del Cheque:</p>
                            <p class="fw-bold">${date}</p>
                        </div>
                        <div class="col-6 text-end">
                            <p class="mb-0 text-muted small">Generado por:</p>
                            <p class="text-truncate">${(paystub.calculatedBy || '').split?.('@')?.[0] || 'Usuario'}</p>
                        </div>
                        
                        <div class="col-12 mt-2">
                            <p class="mb-0 text-muted small">Horas Regulares Trabajadas:</p>
                            <p class="fs-5 text-info"><strong>${paystub.regularHours || 'N/A'} Horas</strong></p>
                        </div>
                    </div>

                    <h6 class="mt-3 text-secondary border-bottom pb-2">Resumen Financiero del Período</h6>
                    <div class="row mb-4 gx-2">
                        
                        <div class="col-4">
                            <div class="p-2 border rounded text-center">
                                <p class="mb-0 text-muted small">Gross Pay:</p>
                                <p class="fs-6 text-success fw-bold">${formatCurrencyLocal(paystub.grossPayPeriod)}</p>
                            </div>
                        </div>
                        <div class="col-4">
                            <div class="p-2 border rounded text-center">
                                <p class="mb-0 text-muted small">Total Impuestos:</p>
                                <p class="fs-6 text-danger fw-bold">${formatCurrencyLocal(paystub.totalTaxPeriod)}</p>
                            </div>
                        </div>
                        <div class="col-4">
                            <div class="p-2 border rounded text-center bg-primary text-white">
                                <p class="mb-0 small">Net Pay (Neto):</p>
                                <p class="fs-6 fw-bold">${formatCurrencyLocal(paystub.netPayPeriod)}</p>
                            </div>
                        </div>
                    </div>

                    <h6 class="mt-4 text-secondary border-bottom pb-2">Detalle de Impuestos y Acumulados (YTD)</h6>
                    <div class="table-responsive">
                        <table class="table table-striped table-hover paystub-table" id="taxDetailsTable">
                            <thead class="table-dark">
                                <tr>
                                    <th>Deducción</th>
                                    <th>Tasa</th>
                                    <th>Monto Período</th>
                                    <th>Monto YTD</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${taxDetailsRows.replace(/<td>/g, (match, index) => {
                                    // Inyectar data-label para cada TD generado por taxDetailsRows
                                    let label;
                                    if (index % 4 === 0) label = 'Deducción';
                                    else if (index % 4 === 1) label = 'Tasa';
                                    else if (index % 4 === 2) label = 'Monto Período';
                                    else label = 'Monto YTD';
                                    return `<td data-label="${label}">`;
                                })}
                                <tr class="table-info">
                                    <td colspan="3" data-label="Total Acumulado"><strong>TOTAL ACUMULADO FINAL (YTD)</strong></td>
                                    <td data-label="Monto YTD">${formatCurrencyLocal(paystub.ytdData?.totalTaxesYTD || 0)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <h6 class="mt-4 text-secondary border-bottom pb-2">Acumulados de Ganancias (YTD)</h6>
                    <div class="table-responsive">
                        <table class="table table-striped table-hover paystub-table" id="earningsTable">
                            <thead class="table-light">
                                <tr><th>Concepto</th><th>Monto YTD</th></tr>
                            </thead>
                            <tbody>
                                <tr><td data-label="Concepto">Regular Pay YTD</td><td data-label="Monto YTD">${formatCurrencyLocal(paystub.ytdData?.ytdRegular || 0)}</td></tr>
                                <tr><td data-label="Concepto">Overtime Pay YTD</td><td data-label="Monto YTD">${formatCurrencyLocal(paystub.ytdData?.ytdOvertime || 0)}</td></tr>
                                <tr class="table-success"><td data-label="Concepto"><strong>GROSS PAY YTD TOTAL</strong></td><td data-label="Monto YTD"><strong>${formatCurrencyLocal((paystub.ytdData?.ytdRegular || 0) + (paystub.ytdData?.ytdOvertime || 0))}</strong></td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            `;

            getModalInstance('historyModal')?.hide();
            getModalInstance('paystubDetailsModal')?.show();
        })
        .catch(error => {
            console.error("Error al obtener detalle del paystub:", error);
            detailBody.innerHTML = '<p class="text-danger">Hubo un error al cargar los detalles. Intenta de nuevo.</p>';
        });
};

// ======================= SEARCH DE CLIENTES =======================
const applyClientSearchFilter = () => {
  const input = document.getElementById('clientSearchInput');
  if (!input) return;
  const filter = input.value.trim().toLowerCase();
  const rows = document.querySelectorAll('#clientsTableBody tr');

  rows.forEach(row => {
    const name = (row.querySelector('td')?.textContent || '').toLowerCase();
    const companyState = (row.querySelectorAll('td')[1]?.textContent || '').toLowerCase();
    const combined = `${name} ${companyState}`;
    if (combined.includes(filter)) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
};

const setupClientSearch = () => {
  const input = document.getElementById('clientSearchInput');
  if (!input) return;
  input.addEventListener('input', () => {
    applyClientSearchFilter();
  });
};

// ======================= INIT / EVENT LISTENERS =======================
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('loginForm')) {
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
  }
  if (document.getElementById('addClientForm')) {
    document.getElementById('addClientForm').addEventListener('submit', handleAddClient);
  }
  if (document.getElementById('paystubForm')) {
    document.getElementById('paystubForm').addEventListener('submit', calculatePaystub);
  }
  if (document.getElementById('saveButton')) {
    document.getElementById('saveButton').addEventListener('click', handleSavePaystub);
  }

  setupClientSearch();
});

// (Coloca esta función en alguna parte LÓGICA después de showPaystubDetails)
// (Coloca esta función en alguna parte LÓGICA después de showPaystubDetails)

// app.js

// --------------------------------------------------------------------------
// FUNCIÓN PARA DESCARGAR EL PAYSTUB
// --------------------------------------------------------------------------
const downloadPaystub = () => {
    // 1. Verificar el estado global del paystub y cliente
    if (!currentPaystubId || !currentClientId) { 
        console.error("IDs de cliente/paystub no disponibles para la descarga.");
        // Usar SweetAlert si está disponible, sino alert
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'warning',
                title: 'No hay Paystub',
                text: 'Primero debes seleccionar un paystub para poder iniciar la descarga.'
            });
        } else {
            alert("Primero selecciona un paystub para poder iniciar la descarga.");
        }
        return;
    }

    // 2. 🔑 ¡CLAVE! USAR LA URL DE RENDER CORRECTA DEL WEB SERVICE
    // Esto asegura que la solicitud vaya a tu servidor Node.js (backend) y no al Static Site (frontend)
    const RENDER_BASE_URL = 'https://paystub-pro-app-backend.onrender.com'; // ✅ ¡El dominio correcto!
    
    // 3. Construir la URL completa con los parámetros de la base de datos
    const downloadUrl = `${RENDER_BASE_URL}/api/download-paystub?clientId=${currentClientId}&paystubId=${currentPaystubId}`;

    // 4. Abrir la URL en una nueva pestaña/ventana (esto inicia la descarga en el backend)
    window.open(downloadUrl, '_blank');
    
    // 5. Feedback visual para el usuario (opcional, pero mejora la UX)
    const btn = document.getElementById('downloadPaystubBtn');
    if (btn) {
        const originalHTML = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="bi bi-hourglass-split me-1"></i> Generando...';
        
        // El PDF tarda unos segundos en generarse y descargarse
        setTimeout(() => {
            btn.disabled = false;
            btn.innerHTML = originalHTML; // Vuelve al texto original ('Descargar PDF')
        }, 3000); 
    }
};