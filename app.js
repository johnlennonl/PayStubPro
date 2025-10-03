// app.js

// =======================
// UTILIDADES GLOBALES
// =======================
const formatCurrency = (number) => {
  return '$' + Number(number || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

const getModalInstance = (id) => {
  const modalElement = document.getElementById(id);
  return bootstrap.Modal.getInstance(modalElement) || new bootstrap.Modal(modalElement);
};

// =======================
// ESTADO APP
// =======================
let activeClientId = null;
let calculatedYTDData = null;

// =======================
// AUTH / REDIRECCIÓN
// =======================
if (typeof auth === 'undefined') {
  console.error("Firebase Auth no inicializado. Revisa la carga de scripts.");
}

// Manejo de login
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

// Observador de estado
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

// Logout
document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'logoutBtn') {
    auth.signOut().then(() => window.location.href = 'index.html');
  }
});
// =======================
// CRUD CLIENTES (VERSIÓN CORREGIDA PARA HISTORIAL)
// =======================
const loadClients = (userId) => {
    const clientsTableBody = document.getElementById('clientsTableBody');
    if (!clientsTableBody) return console.error("Error: El elemento #clientsTableBody no fue encontrado. Verifique dashboard.html");

    db.collection('clients')
        .where('userId', '==', userId)
        .orderBy('name')
        .onSnapshot((snapshot) => {
            clientsTableBody.innerHTML = '';
            if (snapshot.empty) {
                // Modificamos el colspan para que coincida con el nuevo número de columnas (5)
                clientsTableBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Aún no tienes clientes registrados.</td></tr>';
                return;
            }
            snapshot.forEach(doc => {
                const client = doc.data();
                client.id = doc.id;
                const grossPayYTDTotal = (client.ytdRegular || 0) + (client.ytdOvertime || 0);
                
                // Aseguramos que client.name no sea undefined para la función de historial
                const clientName = client.name.replace(/'/g, "\\'"); // Escapar comillas para el onclick

                const row = document.createElement('tr');
                row.id = `client-row-${client.id}`;
                
                // 🌟 PLANTILLA DE FILA CON EL NUEVO BOTÓN "HISTORIAL" 🌟
                row.innerHTML = `
                    <td>${client.name}</td>
                    <td>${client.empresa || ''} / ${client.state || ''}</td>
                    <td>${formatCurrency(grossPayYTDTotal)}</td>
                    
                    <td>
                        <button class="btn btn-outline-secondary btn-sm" 
                                data-bs-toggle="modal" 
                                data-bs-target="#historyModal" 
                                onclick="loadClientHistory('${client.id}', '${clientName}')">
                            <i class="fa fa-history me-1"></i> Historial
                        </button>
                    </td>

                    <td>
                        <button class="btn btn-sm btn-info select-client-btn" data-client-id="${client.id}">Seleccionar</button>
                        <button class="btn btn-sm btn-danger delete-client-btn" data-client-id="${client.id}">Eliminar</button>
                    </td>
                `;
                clientsTableBody.appendChild(row);
            });

            // Listeners (dejamos los listeners como estaban, solo aseguramos que el HTML tenga los data-client-id)
            document.querySelectorAll('.select-client-btn').forEach(button => {
                button.removeEventListener('click', selectClientForSimulation);
                button.addEventListener('click', selectClientForSimulation);
            });

            document.querySelectorAll('.delete-client-btn').forEach(button => {
                button.removeEventListener('click', handleDeleteClient);
                button.addEventListener('click', handleDeleteClient);
            });
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

// ELIMINAR CLIENTE
const handleDeleteClient = (event) => {
  const clientId = event.currentTarget.dataset.clientId;
  if (!clientId) return;

  if (confirm("¿Seguro que deseas eliminar este cliente? Esta acción no se puede deshacer.")) {
    db.collection('clients').doc(clientId).delete()
      .then(() => {
        Toastify({ text: "Cliente eliminado correctamente.", duration: 3000 }).showToast();
      })
      .catch(error => {
        console.error("Error eliminando cliente:", error);
        Toastify({ text: "Error al eliminar cliente.", duration: 3000 }).showToast();
      });
  }
};

// =======================
// SELECCIONAR CLIENTE
// =======================
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
            
            // 🌟🌟 CAMBIO CLAVE: Cargar YTD de Taxes ANTERIOR 🌟🌟
            // Se asume que tienes un input hidden con id="ytdTaxesInitial" en el formulario del simulador
            document.getElementById('ytdTaxesInitial').value = safeToFixed(clientData.totalTaxesYTD || 0);

            document.getElementById('regularHours').value = '';
            document.getElementById('overtimeHours').value = '0.00';
            document.getElementById('resultsSection').style.display = 'none';
            document.getElementById('saveButton').disabled = true;

            // habilitar simulador y cambiar tab
            document.getElementById('calculateButton').disabled = false;
            document.getElementById('simulator-tab').disabled = false;
            
            // ⚠️ FIX DEL ERROR ANTERIOR: Asegurar que el Tab exista antes de llamar a show()
            const simulatorTabElement = document.getElementById('simulator-tab');
            let simulatorTabInstance = bootstrap.Tab.getInstance(simulatorTabElement);
            if (!simulatorTabInstance) {
                simulatorTabInstance = new bootstrap.Tab(simulatorTabElement);
            }
            simulatorTabInstance.show();

            Toastify({ text: `¡${clientData.name} seleccionado!`, duration: 2200 }).showToast();

            // Generar checkboxes de taxes según estado
            const state = clientData.state || 'TX';
            const stateRates = TAX_RATES[state];
            const container = document.getElementById('taxOptionsContainer');
            container.innerHTML = '';

            if (stateRates) {
                const federalTaxes = [
                    { name: "Federal Income Tax", rate: stateRates.FIT_RATE },
                    { name: "Social Security Tax", rate: stateRates.SS_RATE },
                    { name: "Medicare Tax", rate: stateRates.MEDICARE_RATE }
                ];

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
        })
        .catch(error => {
            console.error("Error al seleccionar cliente:", error);
            Toastify({ text: "Error al cargar datos del cliente.", duration: 3000 }).showToast();
        });
};
// =======================
// CALCULAR PAYSTUB (VERSIÓN CORREGIDA PARA SUMA YTD DE TAXES)
// =======================
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
    
    // 🌟🌟 PASO 1: OBTENER EL YTD DE TAXES ANTERIOR (Correcto) 🌟🌟
    const ytdTaxesInitial = parseFloat(document.getElementById('ytdTaxesInitial').value || 0); 

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

    // impuestos seleccionados
    let totalTaxPeriod = 0;
    const taxDetails = [];

    document.querySelectorAll('.tax-checkbox:checked').forEach(input => {
        const rate = parseFloat(input.dataset.rate);
        const name = input.dataset.name;
        const taxAmount = grossPayPeriod * rate;
        totalTaxPeriod += taxAmount;
        taxDetails.push({ name, amount: taxAmount, rate });
    });

    // neto
    const netPayPeriod = grossPayPeriod - totalTaxPeriod;

    // YTD de Ganancias (Acumulados)
    const ytdRegularNew = ytdRegularInitial + regularPay;
    const ytdOvertimeNew = ytdOvertimeInitial + overtimePay;
    const grossPayYTDTotalNew = ytdRegularNew + ytdOvertimeNew;

    // 🌟🌟 PASO 2: CÁLCULO DEL TOTAL YTD ACUMULADO (MÉTODO SIMPLE) 🌟🌟
    // El nuevo total YTD es el YTD ANTERIOR + el impuesto del PERÍODO ACTUAL
    // (Este total SÍ es el que se guarda en el registro del cliente)
    const totalTaxYTDNew = ytdTaxesInitial + totalTaxPeriod; 
    
    
    // ====================================================================
    // 🌟🌟 PASO 3: CORRECCIÓN PARA MOSTRAR LOS VALORES INDIVIDUALES EN LA TABLA 🌟🌟
    // Se calcula el YTD de cada impuesto aplicando la TASA al GROSS YTD TOTAL
    // ====================================================================
    let taxYtdDetails = {};
    let totalTaxYtdCalculatedFromGross = 0;

    document.querySelectorAll('.tax-checkbox:checked').forEach(input => {
        const name = input.dataset.name;
        const rate = parseFloat(input.dataset.rate);

        // ✅ CÁLCULO CORRECTO: Gross YTD Total * Tasa del impuesto
        const ytdTaxIndividual = grossPayYTDTotalNew * rate;
        
        taxYtdDetails[name] = ytdTaxIndividual;
        totalTaxYtdCalculatedFromGross += ytdTaxIndividual;
    });

    // NOTA: Para ser 100% precisos en la tabla de resultados final, reemplazamos 
    // totalTaxYTDNew por la suma de los YTD individuales para que el total coincida.
    const finalTotalTaxYTDToShow = totalTaxYtdCalculatedFromGross;


    calculatedYTDData = {
        ytdRegular: ytdRegularNew,
        ytdOvertime: ytdOvertimeNew,
        // Usamos el total calculado a partir del Gross YTD (más preciso para la tabla)
        totalTaxesYTD: finalTotalTaxYTDToShow, 
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
        // Usamos el total final que es la suma de los YTD individuales
        totalTaxYTDNew: finalTotalTaxYTDToShow, 
        taxDetails,
        taxYtdDetails
    });

    document.getElementById('saveButton').disabled = false;
    Toastify({ text: `¡Cálculo generado! Net Pay: ${formatCurrency(netPayPeriod)}`, duration: 3500 }).showToast();
};
// =======================
// RENDER RESULTADOS
// =======================
const renderResults = (data) => {
  const resultsContent = document.getElementById('resultsContent');
  const resultsSection = document.getElementById('resultsSection');
  if (!resultsContent || !resultsSection) return;

  resultsSection.style.display = 'block';

  const taxRows = data.taxDetails.map(tax => {
    const newYTDValue = data.taxYtdDetails[tax.name] || 0;
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
// =======================================================
// ---------- GUARDAR (UPDATE) YTD Y REGISTRAR PAYSTUB ----------
// =======================================================
const handleSavePaystub = () => {
    if (!activeClientId || !calculatedYTDData) {
        Toastify({ text: "Error: No hay cálculo ni cliente activo para guardar.", duration: 3000 }).showToast();
        return;
    }

    // 1. OBTENER DATOS DEL PERÍODO DEL ESTADO GLOBAL Y NUEVOS CAMPOS
    const rate = parseFloat(document.getElementById('hourlyRate').value || 0);
    const regularHours = parseFloat(document.getElementById('regularHours').value || 0);
    const overtimeHours = parseFloat(document.getElementById('overtimeHours').value || 0);
    
    // 🌟 Nuevos Campos Requeridos 🌟
    const payFrequency = document.getElementById('payFrequency').value;
    const paystubDateValue = document.getElementById('paystubDate').value;

    const regularPay = rate * regularHours;
    const overtimePay = (rate * 1.5) * overtimeHours;
    const grossPayPeriod = regularPay + overtimePay;
    
    // USAMOS LOS VALORES GUARDADOS EN CALCULATEDYTDDATA
    const netPayPeriod = calculatedYTDData.netPayPeriod; 
    const totalTaxPeriod = calculatedYTDData.periodTaxTotal;

    // 2. DATA PARA ACTUALIZAR EL DOCUMENTO PRINCIPAL DEL CLIENTE
    const updateData = {
        ytdRegular: calculatedYTDData.ytdRegular,
        ytdOvertime: calculatedYTDData.ytdOvertime,
        totalTaxesYTD: calculatedYTDData.totalTaxesYTD,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    };

    // 3. DATA PARA EL REGISTRO HISTÓRICO (PAYSTUB)
    const paystubRecord = {
        // 🌟 Usamos la fecha ingresada por el usuario o la del servidor como fallback 🌟
        date: paystubDateValue ? new Date(paystubDateValue) : firebase.firestore.FieldValue.serverTimestamp(),
        payFrequency: payFrequency, // Guardar la frecuencia
        grossPayPeriod: grossPayPeriod,
        netPayPeriod: netPayPeriod, 
        regularHours,
        overtimeHours,
        totalTaxPeriod: totalTaxPeriod,
        // 🌟 Incluir los detalles de taxes para la vista previa 🌟
        taxDetails: calculatedYTDData.taxDetails, 
        ytdData: { 
            ytdRegular: calculatedYTDData.ytdRegular,
            ytdOvertime: calculatedYTDData.ytdOvertime,
            totalTaxesYTD: calculatedYTDData.totalTaxesYTD
        },
        calculatedBy: auth.currentUser.email || 'Usuario Desconocido'
    };

    // 4. USAR BATCH WRITE para garantizar que ambas operaciones se ejecuten
    const batch = db.batch();
    const clientRef = db.collection('clients').doc(activeClientId);
    // paystubRef debe ser creado aquí para obtener el ID para la vista previa
    const paystubRef = clientRef.collection('paystubs').doc(); 

    // A. Añadir la actualización del cliente al lote (Nuevos YTD)
    batch.update(clientRef, updateData);

    // B. Añadir el registro del paystub al lote (Historial)
    batch.set(paystubRef, paystubRecord);

    // Ejecutar el lote
    batch.commit()
        .then(() => {
            Toastify({ text: "✅ ¡YTD Actualizado y Paystub Registrado!", duration: 3000 }).showToast();
            
            // Lógica de limpieza y redirección
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



// ---------- EVENT LISTENERS (seguro) ----------
document.addEventListener('DOMContentLoaded', () => {
  // Login
  if (document.getElementById('loginForm')) {
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
  }

  // Add client
  if (document.getElementById('addClientForm')) {
    document.getElementById('addClientForm').addEventListener('submit', handleAddClient);
  }

  // Paystub form
  if (document.getElementById('paystubForm')) {
    document.getElementById('paystubForm').addEventListener('submit', calculatePaystub);
  }

  // Save button
  if (document.getElementById('saveButton')) {
    document.getElementById('saveButton').addEventListener('click', handleSavePaystub);
  }
});


// app.js (Añadir esta nueva función)

// =======================================================
// ---------- CARGAR HISTORIAL DE PAYSTUBS (MODIFICADA) ----------
// =======================================================
const loadClientHistory = (clientId, clientName) => {
    // 1. Mostrar el nombre del cliente en el título del modal
    document.getElementById('clientHistoryName').textContent = clientName;
    const historyBody = document.getElementById('paystubHistoryBody');
    historyBody.innerHTML = '<tr><td colspan="6" class="text-center"><i class="fas fa-spinner fa-spin me-2"></i> Cargando historial...</td></tr>';

    // 2. Consulta a la subcolección
    db.collection('clients').doc(clientId).collection('paystubs')
        .orderBy('date', 'desc') // Ordenar por fecha, del más reciente al más antiguo
        .get()
        .then(snapshot => {
            historyBody.innerHTML = ''; // Limpiar el mensaje de carga

            if (snapshot.empty) {
                historyBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No hay registros de paystubs para este cliente.</td></tr>';
                return;
            }

            snapshot.forEach(doc => {
                const paystub = doc.data();
                paystub.id = doc.id; // Guardamos el ID del documento del paystub
                
                // Formateo de fecha
                const date = paystub.date && typeof paystub.date.toDate === 'function' ? paystub.date.toDate().toLocaleDateString() : 'N/A';

                // Usamos la función global para formato de moneda
                
                // Resumen YTD
                const grossYTD = (paystub.ytdData.ytdRegular || 0) + (paystub.ytdData.ytdOvertime || 0);
                const ytdSummary = `Gross: ${formatCurrency(grossYTD)} | Tax: ${formatCurrency(paystub.ytdData.totalTaxesYTD)}`;

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
                    </tr>
                `;
                historyBody.insertAdjacentHTML('beforeend', row);
            });
        })
        .catch(error => {
            console.error("Error al cargar historial:", error);
            historyBody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Error al cargar el historial de pagos.</td></tr>';
        });
};


// =======================================================
// ---------- MOSTRAR DETALLE COMPLETO DEL PAYSTUB (NUEVA FUNCIÓN) ----------
// =======================================================
// ====================================================================
// ACTUALIZACIÓN DE showPaystubDetails PARA INCLUIR YTD INDIVIDUAL
// ====================================================================
const showPaystubDetails = (paystubId, clientId) => {
    const detailBody = document.getElementById('paystubDetailBody');
    detailBody.innerHTML = '<p class="text-center"><i class="fas fa-spinner fa-spin me-2"></i> Cargando detalles...</p>';

    // Consulta al documento específico en la subcolección
    db.collection('clients').doc(clientId).collection('paystubs').doc(paystubId).get()
        .then(doc => {
            if (!doc.exists) {
                detailBody.innerHTML = '<p class="text-danger">Detalle del Paystub no encontrado.</p>';
                return;
            }
            const paystub = doc.data();
            
            const formatCurrency = (amount) => `$${(amount || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
            const date = paystub.date.toDate ? paystub.date.toDate().toLocaleDateString() : 'N/A';
            document.getElementById('detailPaystubDate').textContent = date;
            
            // Renderizar detalles de impuestos/deducciones
            let taxDetailsRows = '';
            
            // --- CÁLCULO PARA ASEGURAR YTD POR IMPUESTO ---
            // 1. Obtener el Gross YTD Total de este Paystub
            const grossYTDThisPaystub = paystub.ytdData.ytdRegular + paystub.ytdData.ytdOvertime;
            
            if (paystub.taxDetails && Array.isArray(paystub.taxDetails)) {
                taxDetailsRows = paystub.taxDetails.map(tax => {
                    // **CORRECCIÓN DE LÓGICA / FALLBACK:**
                    // Si el paystub.taxYtdDetails no existe o está vacío (registros antiguos),
                    // CALCULAMOS el YTD individual usando la TASA * GROSS YTD de este registro.
                    // Esto es un FALLBACK robusto y asegura que el valor YTD sea el correcto.
                    let ytdTaxValue = 0;
                    
                    if (paystub.taxYtdDetails && paystub.taxYtdDetails[tax.name]) {
                         // Opción 1 (Preferida): Si el dato se guardó explícitamente, úsalo.
                        ytdTaxValue = paystub.taxYtdDetails[tax.name];
                    } else {
                        // Opción 2 (Fallback): Si no se guardó el detalle, calcúlalo con la tasa.
                        // Esto garantiza la visualización correcta para todos los paystubs.
                        ytdTaxValue = grossYTDThisPaystub * tax.rate;
                    }

                    return `
                        <tr>
                            <td>${tax.name}</td>
                            <td>${(tax.rate * 100).toFixed(2)}%</td>
                            <td class="text-danger">${formatCurrency(tax.amount * -1)}</td>
                            <!-- 🌟 NUEVA COLUMNA YTD INDIVIDUAL 🌟 -->
                            <td>${formatCurrency(ytdTaxValue)}</td> 
                        </tr>
                    `;
                }).join('');
            }

            // Renderizar la vista previa del Paystub
            detailBody.innerHTML = `
                <div class="paystub-view p-4 border rounded shadow-sm">
                    <h5 class="mb-3 text-primary text-center">${paystub.payFrequency.toUpperCase()} Paycheck</h5>
                    <div class="row mb-3 border-bottom pb-2">
                        <div class="col-md-6"><strong>Fecha del Cheque:</strong> ${date}</div>
                        <div class="col-md-6"><strong>Generado por:</strong> ${paystub.calculatedBy.split('@')[0]}</div>
                    </div>
                    
                    <h6 class="mt-3 text-secondary">Resumen Financiero del Período</h6>
                    <div class="row mb-4 text-center">
                        <div class="col-md-4">
                            <p class="mb-0 text-muted">Gross Pay (Bruto):</p>
                            <p class="fs-5 text-success"><strong>${formatCurrency(paystub.grossPayPeriod)}</strong></p>
                        </div>
                        <div class="col-md-4">
                            <p class="mb-0 text-muted">Total Impuestos:</p>
                            <p class="fs-5 text-danger"><strong>${formatCurrency(paystub.totalTaxPeriod)}</strong></p>
                        </div>
                        <div class="col-md-4">
                            <p class="mb-0 text-muted">Net Pay (Neto):</p>
                            <p class="fs-4 text-primary"><strong>${formatCurrency(paystub.netPayPeriod)}</strong></p>
                        </div>
                    </div>

                    <h6 class="mt-3 text-secondary">Detalle de Impuestos y Acumulados (YTD)</h6>
                    <table class="table table-bordered table-sm">
                        <thead class="table-dark">
                            <tr>
                                <th>Deducción</th>
                                <th>Tasa</th>
                                <th>Monto Período</th>
                                <th>Monto YTD</th> <!-- 🌟 TÍTULO ACTUALIZADO 🌟 -->
                            </tr>
                        </thead>
                        <tbody>
                            ${taxDetailsRows}
                            <tr class="table-info">
                                <td colspan="3"><strong>TOTAL ACUMULADO FINAL (YTD)</strong></td>
                                <td>${formatCurrency(paystub.ytdData.totalTaxesYTD)}</td>
                            </tr>
                        </tbody>
                    </table>
                    
                    <h6 class="mt-4 text-secondary">Acumulados de Ganancias (YTD)</h6>
                    <table class="table table-bordered table-sm">
                        <thead class="table-light">
                            <tr>
                                <th>Concepto</th>
                                <th>Monto YTD</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Regular Pay YTD</td>
                                <td>${formatCurrency(paystub.ytdData.ytdRegular)}</td>
                            </tr>
                            <tr>
                                <td>Overtime Pay YTD</td>
                                <td>${formatCurrency(paystub.ytdData.ytdOvertime)}</td>
                            </tr>
                            <tr class="table-success">
                                <td><strong>GROSS PAY YTD TOTAL</strong></td>
                                <td><strong>${formatCurrency(paystub.ytdData.ytdRegular + paystub.ytdData.ytdOvertime)}</strong></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            `;
            
            getModalInstance('historyModal').hide();
            getModalInstance('paystubDetailsModal').show();

        })
        .catch(error => {
            console.error("Error al obtener detalle del paystub:", error);
            detailBody.innerHTML = '<p class="text-danger">Hubo un error al cargar los detalles. Intenta de nuevo.</p>';
        });
};