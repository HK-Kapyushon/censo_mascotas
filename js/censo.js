// ============================================================
// censo.js — Registro de Censos offline-first (RF03–RF06)
// Usa: API_URL (sync.js), DB_CENSOS (db.js), photo.js para cámara
// ============================================================

// Configuración del proyecto (RF06) — valores asignados por el docente
const ID_PROYECTO    = 'PWA_GRUPO_08';   // ← Cambia al ID que te asigne el docente
const COLOR_PROYECTO = '#C5C2FF';        // ← Cambia al color que te asigne el docente

let latActual  = null;
let lonActual  = null;
let imagenBase64 = '';

if (!localStorage.getItem('token')) {
    window.location.href = '../login.html';
}

// ---- Inicialización ----
document.addEventListener('DOMContentLoaded', async () => {
    await cargarSelectores();
    document.getElementById('censoForm').addEventListener('submit', guardarCenso);

    // Foto por archivo (input type=file) — fallback si no hay cámara
    const inputFoto = document.getElementById('inputFoto');
    if (inputFoto) inputFoto.addEventListener('change', manejarFotoArchivo);
});

// ---- Cargar selectores de Persona y Mascota ----
async function cargarSelectores() {
    const selPersona = document.getElementById('persona');
    const selMascota = document.getElementById('mascota');

    selPersona.innerHTML = '<option disabled selected>Cargando...</option>';
    selMascota.innerHTML = '<option disabled selected>Cargando...</option>';

    if (navigator.onLine) {
        try {
            const [resP, resM] = await Promise.all([
                fetch(`${API_URL}/api/v1/personas`),
                fetch(`${API_URL}/api/v1/mascotas`)
            ]);
            const personas = resP.ok ? await resP.json() : [];
            const mascotas = resM.ok ? await resM.json() : [];
            poblarSelect(selPersona, personas, p => `${p.nombres} ${p.apellidos}`, p => p.id);
            poblarSelect(selMascota, mascotas, m => `${m.nombre} (${m.tipo})`,     m => m.id);
            return;
        } catch (e) { console.warn('[Censo] API no disponible, usando local'); }
    }

    // Offline: usar datos locales de PouchDB
    const personas = await dbObtenerTodos(DB_PERSONAS);
    const mascotas = await dbObtenerTodos(DB_MASCOTAS);
    poblarSelect(selPersona, personas,
        p => `${p.nombres} ${p.apellidos}${p.syncStatus !== 'synced' ? ' ⏳' : ''}`,
        p => p.remoteId || p._id
    );
    poblarSelect(selMascota, mascotas,
        m => `${m.nombre} (${m.tipo})${m.syncStatus !== 'synced' ? ' ⏳' : ''}`,
        m => m.remoteId || m._id
    );
}

function poblarSelect(sel, items, labelFn, valueFn) {
    sel.innerHTML = '<option disabled selected>Selecciona una opción</option>';
    if (!items || items.length === 0) {
        sel.innerHTML += '<option disabled>— Sin registros —</option>';
        return;
    }
    items.forEach(item => {
        const opt = document.createElement('option');
        opt.value = valueFn(item);
        opt.textContent = labelFn(item);
        sel.appendChild(opt);
    });
}

// ---- Geolocalización (RF05) ----
window.obtenerUbicacion = function () {
    const btn       = document.getElementById('btnUbicacion');
    const coordsDiv = document.getElementById('coords');
    if (!navigator.geolocation) {
        coordsDiv.innerHTML = '<span class="text-danger">Geolocalización no soportada</span>';
        return;
    }
    btn.disabled = true;
    btn.textContent = 'Detectando...';
    coordsDiv.innerHTML = '<span class="text-muted">Obteniendo ubicación...</span>';

    navigator.geolocation.getCurrentPosition(pos => {
        latActual = pos.coords.latitude;
        lonActual = pos.coords.longitude;
        coordsDiv.innerHTML = `
          <span class="text-success">
            📍 Lat: <strong>${latActual.toFixed(6)}</strong>
            &nbsp;Lon: <strong>${lonActual.toFixed(6)}</strong>
            <small class="text-muted">(±${pos.coords.accuracy.toFixed(0)}m)</small>
          </span>`;
        btn.textContent = '✓ Ubicación obtenida';
        btn.classList.replace('btn-secondary', 'btn-success');
    }, err => {
        coordsDiv.innerHTML = `<span class="text-danger">Error: ${err.message}</span>`;
        btn.disabled = false;
        btn.textContent = '📍 Reintentar';
    }, { enableHighAccuracy: true, timeout: 12000 });
};

// ---- Foto desde archivo (validación 50 KB, RF04) ----
function manejarFotoArchivo(e) {
    const file     = e.target.files[0];
    const preview  = document.getElementById('fotoPreview');
    const fotoInfo = document.getElementById('fotoInfo');
    if (!file) { imagenBase64 = ''; preview.classList.add('d-none'); return; }
    if (file.size > 50000) {
        fotoInfo.innerHTML = `<span class="text-danger">⚠ La imagen pesa ${(file.size/1024).toFixed(1)} KB — máx. 50 KB</span>`;
        e.target.value = '';
        imagenBase64 = '';
        preview.classList.add('d-none');
        return;
    }
    fotoInfo.innerHTML = `<span class="text-success">✓ ${(file.size/1024).toFixed(1)} KB</span>`;
    const reader = new FileReader();
    reader.onload = () => {
        imagenBase64 = reader.result;
        preview.src  = imagenBase64;
        preview.classList.remove('d-none');
    };
    reader.readAsDataURL(file);
}

// Llamado desde photo.js cuando se toma foto con cámara
window.onFotoCapturada = function(base64) {
    // Validar tamaño (RF04): base64 real ~1.37x binario
    if (base64.length > 68267) {
        mostrarAlerta('censoAlerta', '⚠ Foto demasiado pesada. Usa resolución menor (máx 50 KB)', 'danger');
        imagenBase64 = '';
        return;
    }
    imagenBase64 = base64;
    const preview = document.getElementById('fotoPreview');
    if (preview) { preview.src = base64; preview.classList.remove('d-none'); }
    document.getElementById('fotoInfo').innerHTML = '<span class="text-success">✓ Foto de cámara capturada</span>';
};

// ---- Guardar Censo offline-first ----
async function guardarCenso(e) {
    e.preventDefault();
    const idPersona = document.getElementById('persona').value;
    const idMascota = document.getElementById('mascota').value;

    if (!idPersona || !idMascota) {
        mostrarAlerta('censoAlerta', 'Selecciona persona y mascota.', 'danger'); return;
    }
    if (!latActual || !lonActual) {
        mostrarAlerta('censoAlerta', 'Debes obtener la ubicación GPS primero.', 'danger'); return;
    }
    if (!imagenBase64) {
        mostrarAlerta('censoAlerta', 'Debes tomar o subir una fotografía.', 'danger'); return;
    }

    const docCenso = {
        _id:        crypto.randomUUID(),
        idMascota,
        idDueno:    idPersona,
        fotografia: imagenBase64,
        lat:        latActual,
        lon:        lonActual,
        idProyecto: ID_PROYECTO,   // RF06
        color:      COLOR_PROYECTO, // RF06
        remoteId:   null,
        syncStatus: 'pending_create'
    };

    try {
        await DB_CENSOS.put(docCenso);
        if (navigator.onLine) {
            await syncManager.syncCensos();
            mostrarAlerta('censoAlerta', '✓ Censo registrado y sincronizado', 'success');
        } else {
            mostrarAlerta('censoAlerta', '⏳ Censo guardado localmente — se sincronizará al recuperar conexión', 'warning');
        }
        // Limpiar formulario
        document.getElementById('censoForm').reset();
        imagenBase64 = ''; latActual = null; lonActual = null;
        document.getElementById('fotoPreview').classList.add('d-none');
        document.getElementById('fotoInfo').innerHTML = '';
        document.getElementById('coords').innerHTML = '';
        const btn = document.getElementById('btnUbicacion');
        btn.textContent = '📍 Obtener ubicación';
        btn.className = 'btn btn-secondary mb-2';
        btn.disabled = false;
        await cargarSelectores();
    } catch (err) {
        mostrarAlerta('censoAlerta', 'Error: ' + err.message, 'danger');
    }
}

function mostrarAlerta(id, msg, tipo) {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = `alert alert-${tipo}`;
    el.textContent = msg;
    el.classList.remove('d-none');
    setTimeout(() => el.classList.add('d-none'), 6000);
}
