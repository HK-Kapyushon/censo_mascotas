// ============================================================
// mascota.js — Gestión offline de Mascotas (RF02, CP-01)
// Depende de: db.js (DB_MASCOTAS), sync.js (sincronizarTodo)
// ============================================================

let db;
let mascotaEnEdicionId = null;
let fotoBase64 = '';

function getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('token');
    if (token) headers.Authorization = 'Bearer ' + token;
    return headers;
}

// ---- Inicialización ----
addEventListener('DOMContentLoaded', () => {
    db = typeof DB_MASCOTAS !== 'undefined' ? DB_MASCOTAS : new PouchDB('pwa_mascotas');

    const formulario   = document.getElementById('mascotaForm');
    const btnCancelar  = document.getElementById('btnCancelarEdicion');
    const fotoInput    = document.getElementById('foto');

    if (formulario)  formulario.addEventListener('submit', manejarEnvioFormulario);
    if (btnCancelar) btnCancelar.addEventListener('click', cancelarEdicion);
    if (fotoInput)   fotoInput.addEventListener('change', handleFotoChange);

    cargarMascotas();
    if (typeof actualizarBadgeEstado === 'function') actualizarBadgeEstado();
});

function manejarEnvioFormulario(event) {
    event.preventDefault();
    if (mascotaEnEdicionId) {
        actualizarMascota(mascotaEnEdicionId);
    } else {
        agregarMascota();
    }
}

// ---- AGREGAR mascota (offline-first, RF02) ----
function agregarMascota() {
    const nombre = document.getElementById('nombre').value.trim();
    const tipo   = document.getElementById('tipo').value;
    const genero = document.getElementById('genero').value;
    const edad   = parseFloat(document.getElementById('edad').value);

    if (!nombre || !tipo || !genero || isNaN(edad)) {
        alert('Por favor completa todos los campos obligatorios.');
        return;
    }

    const mascota = {
        _id: crypto.randomUUID(),          // UUID local (RF02)
        nombre, tipo, genero, edad,
        fotografia: fotoBase64 || '',
        remoteId: null,
        syncStatus: 'pending_create'
    };

    db.put(mascota).then(() => {
        limpiarFormulario();
        cargarMascotas();
        if (navigator.onLine && typeof sincronizarTodo === 'function') sincronizarTodo();
    }).catch(err => console.error('Error al agregar mascota:', err));
}

// ---- RENDERIZAR fila en tabla ----
function agregarAMascotaTabla(mascota) {
    const tabla = document.getElementById('tablaMascotas');
    if (!tabla) return;
    const fila = document.createElement('tr');
    fila.dataset.id = mascota._id;

    const pendingIcon = mascota.syncStatus !== 'synced'
        ? ' <span class="badge bg-warning text-dark" title="Pendiente de sincronización">⏳</span>'
        : '';

    fila.innerHTML = `
        <td>${mascota.nombre}${pendingIcon}</td>
        <td>${mascota.tipo}</td>
        <td>${mascota.genero || '-'}</td>
        <td>${mascota.edad}</td>
        <td>
          <button class="btn btn-warning btn-sm" onclick="iniciarEdicion('${mascota._id}')">✏️ Editar</button>
          <button class="btn btn-danger btn-sm ms-1" onclick="eliminarMascota('${mascota._id}')">🗑️</button>
        </td>
    `;
    tabla.appendChild(fila);
}

// ---- ELIMINAR ----
function eliminarMascota(id) {
    if (!confirm('¿Eliminar esta mascota?')) return;
    db.get(id).then(doc => {
        if (!doc.remoteId) return db.remove(doc);
        doc.syncStatus = 'pending_delete';
        return db.put(doc);
    }).then(() => {
        if (mascotaEnEdicionId === id) cancelarEdicion();
        cargarMascotas();
        if (navigator.onLine && typeof sincronizarTodo === 'function') sincronizarTodo();
    }).catch(err => console.error('Error al eliminar mascota:', err));
}

// ---- ACTUALIZAR ----
function actualizarMascota(id) {
    const nuevoNombre = document.getElementById('nombre').value.trim();
    const nuevoTipo   = document.getElementById('tipo').value;
    const nuevoGenero = document.getElementById('genero').value;
    const nuevaEdad   = parseFloat(document.getElementById('edad').value);

    if (!nuevoNombre || !nuevoTipo || !nuevoGenero || isNaN(nuevaEdad)) return;

    db.get(id).then(doc => {
        doc.nombre = nuevoNombre;
        doc.tipo   = nuevoTipo;
        doc.genero = nuevoGenero;
        doc.edad   = nuevaEdad;
        doc.fotografia = fotoBase64 || doc.fotografia || '';
        if (doc.syncStatus !== 'pending_create') doc.syncStatus = 'pending_update';
        return db.put(doc);
    }).then(() => {
        cancelarEdicion();
        cargarMascotas();
        if (navigator.onLine && typeof sincronizarTodo === 'function') sincronizarTodo();
    }).catch(err => console.error('Error al actualizar mascota:', err));
}

// ---- INICIAR EDICIÓN ----
function iniciarEdicion(id) {
    db.get(id).then(doc => {
        document.getElementById('nombre').value = doc.nombre;
        document.getElementById('tipo').value   = doc.tipo;
        document.getElementById('genero').value = doc.genero || '';
        document.getElementById('edad').value   = doc.edad;
        fotoBase64 = doc.fotografia || '';

        const preview = document.getElementById('fotoPreview');
        if (doc.fotografia) {
            preview.src = doc.fotografia;
            preview.classList.remove('d-none');
        } else {
            preview.src = '';
            preview.classList.add('d-none');
        }

        mascotaEnEdicionId = id;
        const titulo = document.getElementById('formTitle');
        if (titulo) titulo.textContent = 'Editar Mascota';
        document.getElementById('btnGuardar').textContent = 'Guardar cambios';
        document.getElementById('btnCancelarEdicion').classList.remove('d-none');
    }).catch(err => console.error('Error al iniciar edición:', err));
}

function cancelarEdicion() {
    mascotaEnEdicionId = null;
    const titulo = document.getElementById('formTitle');
    if (titulo) titulo.textContent = 'Registrar Mascota';
    document.getElementById('btnGuardar').textContent = 'Agregar Mascota';
    document.getElementById('btnCancelarEdicion').classList.add('d-none');
    limpiarFormulario();
}

function limpiarFormulario() {
    document.getElementById('mascotaForm').reset();
    fotoBase64 = '';
    const preview = document.getElementById('fotoPreview');
    if (preview) { preview.src = ''; preview.classList.add('d-none'); }
}

function handleFotoChange(event) {
    const file    = event.target.files[0];
    const preview = document.getElementById('fotoPreview');

    if (!file) {
        fotoBase64 = '';
        if (preview) { preview.src = ''; preview.classList.add('d-none'); }
        return;
    }

    const reader = new FileReader();
    reader.onload = () => {
        fotoBase64 = reader.result;
        if (preview) { preview.src = fotoBase64; preview.classList.remove('d-none'); }
    };
    reader.readAsDataURL(file);
}

// ---- CARGAR tabla desde PouchDB ----
function cargarMascotas() {
    const tabla = document.getElementById('tablaMascotas');
    if (!tabla) return;
    tabla.innerHTML = '';

    db.allDocs({ include_docs: true }).then(result => {
        const visibles = result.rows
            .map(r => r.doc)
            .filter(d => d.syncStatus !== 'pending_delete' && d._id !== '_design/idx');

        if (visibles.length === 0) {
            tabla.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Sin mascotas registradas</td></tr>';
            return;
        }
        visibles.forEach(doc => agregarAMascotaTabla(doc));
    }).catch(err => console.error('Error al cargar mascotas:', err));
}
