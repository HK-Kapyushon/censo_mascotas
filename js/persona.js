// ============================================================
// persona.js — Gestión offline de Personas (RF02, CP-01)
// ============================================================

// API_URL proviene de sync.js

function getAuthHeaders() {
  const h = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('token');
  if (token) h['Authorization'] = 'Bearer ' + token;
  return h;
}

// ---- Formulario ----
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('personaForm');
  if (form) form.addEventListener('submit', guardarPersona);
  cargarPersonas();
  if (typeof actualizarBadgeEstado === 'function') actualizarBadgeEstado();
});

async function guardarPersona(e) {
  e.preventDefault();

  const nombres      = document.getElementById('nombres').value.trim();
  const apellidos    = document.getElementById('apellidos').value.trim();
  const tipoDocumento= document.getElementById('tipoDocumento').value.trim();
  const documento    = document.getElementById('documento').value.trim();
  const direccion    = document.getElementById('direccion').value.trim();
  const telefono     = document.getElementById('telefono').value.trim();
  const ciudad       = document.getElementById('ciudad').value.trim();
  const usuario      = document.getElementById('usuario').value.trim();
  const contrasena   = document.getElementById('contrasena').value;

  if (!nombres || !apellidos || !usuario || !contrasena) {
    mostrarAlerta('personaAlerta', 'Por favor completa los campos obligatorios.', 'danger');
    return;
  }

  // Hash de contraseña en el front con bcrypt (requiere bcrypt.js incluido)
  // Si no está disponible, se envía en texto (el backend también la encripta)
  let contrasenaHash = contrasena;
  if (typeof dcodeIO !== 'undefined' && dcodeIO.bcrypt) {
    const salt = await dcodeIO.bcrypt.genSalt(10);
    contrasenaHash = await dcodeIO.bcrypt.hash(contrasena, salt);
  }

  const docLocal = {
    _id: new Date().toISOString() + '_' + Math.random().toString(36).slice(2),
    nombres, apellidos, tipoDocumento, documento,
    direccion, telefono, ciudad, usuario,
    contrasenaHash, // solo para sync, no se muestra
    remoteId: null,
    syncStatus: 'pending_create'
  };

  try {
    await DB_PERSONAS.put(docLocal);
    mostrarAlerta('personaAlerta', 'Persona guardada localmente ⏳ (se sincronizará al recuperar conexión)', 'warning');

    // Si hay conexión, intentar sync inmediato
    if (navigator.onLine) {
      await syncPersonas();
      mostrarAlerta('personaAlerta', 'Persona registrada y sincronizada ✓', 'success');
    }

    document.getElementById('personaForm').reset();
    await cargarPersonas();
  } catch (err) {
    console.error('[Persona] Error:', err);
    mostrarAlerta('personaAlerta', 'Error al guardar la persona.', 'danger');
  }
}

async function cargarPersonas() {
  const lista = document.getElementById('listaPersonas');
  if (!lista) return;

  // Primero mostrar datos locales
  const locales = await dbObtenerTodos(DB_PERSONAS);

  if (locales.length === 0) {
    lista.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Sin personas registradas</td></tr>';
    return;
  }

  lista.innerHTML = locales.map(p => `
    <tr>
      <td>${p.nombres || ''} ${p.apellidos || ''}
        ${p.syncStatus !== 'synced' ? '<span class="badge bg-warning text-dark ms-1" title="Pendiente de sincronización">⏳</span>' : ''}
      </td>
      <td>${p.tipoDocumento || '-'} ${p.documento || ''}</td>
      <td>${p.telefono || '-'}</td>
      <td>${p.ciudad || '-'}</td>
      <td>${p.usuario || '-'}</td>
    </tr>
  `).join('');
}

function mostrarAlerta(id, msg, tipo) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `alert alert-${tipo}`;
  el.textContent = msg;
  el.classList.remove('d-none');
  setTimeout(() => el.classList.add('d-none'), 5000);
}
