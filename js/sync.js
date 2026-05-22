// ============================================================
// sync.js — SyncManager basado en el proyecto de referencia
// Sincronización bidireccional completa (CP-02)
// ============================================================

// URL de la API central del docente — ajustar cuando el compañero entregue su URL local
const API_URL = 'https://elprofehugo.online';

function getHeaders(conAuth = true) {
    const h = { 'Content-Type': 'application/json' };
    if (conAuth) {
        const token = localStorage.getItem('token');
        if (token) h['Authorization'] = 'Bearer ' + token;
    }
    return h;
}

// ============================================================
// SyncManager — clase del proyecto de referencia, adaptada
// para manejar Mascotas, Personas y Censos
// ============================================================
class SyncManager {
    constructor() {
        this.syncing = false;
        this._setupListeners();
        setInterval(() => this.sync(), 30000); // auto-sync cada 30s
    }

    _setupListeners() {
        window.addEventListener('online',  () => { this._updateStatus(); this.sync(); });
        window.addEventListener('offline', () => this._updateStatus());
        this._updateStatus();
    }

    _updateStatus() {
        const badge = document.getElementById('syncStatus');
        if (!badge) return;
        if (navigator.onLine) {
            badge.textContent = 'En línea';
            badge.className = 'badge bg-success ms-2';
        } else {
            badge.textContent = 'Sin conexión';
            badge.className = 'badge bg-warning text-dark ms-2';
        }
    }

    _setSyncingUI(syncing) {
        const btn = document.getElementById('btnSync');
        if (!btn) return;
        btn.disabled = syncing;
        btn.textContent = syncing ? 'Sincronizando...' : 'Sincronizar';
    }

    async sync() {
        if (this.syncing || !navigator.onLine) return;
        this.syncing = true;
        this._setSyncingUI(true);
        try {
            await this.syncMascotas();
            await this.syncPersonas();
            await this.syncCensos();
            // Recargar UI si las funciones existen en la página actual
            if (typeof cargarMascotas  === 'function') cargarMascotas();
            if (typeof cargarPersonas  === 'function') cargarPersonas();
        } catch (err) {
            console.error('[Sync] Error general:', err);
        } finally {
            this.syncing = false;
            this._setSyncingUI(false);
        }
    }

    // ---- MASCOTAS ----
    async syncMascotas() {
        const result   = await DB_MASCOTAS.allDocs({ include_docs: true });
        const pending  = result.rows.filter(r => r.doc.syncStatus && r.doc.syncStatus !== 'synced');

        for (const row of pending) {
            const doc = row.doc;
            try {
                if (doc.syncStatus === 'pending_create') {
                    const payload = {
                        id:         doc._id,
                        nombre:     doc.nombre,
                        tipo:       doc.tipo,
                        genero:     doc.genero || '',
                        edad:       doc.edad,
                        fotografia: doc.fotografia || ''
                    };
                    const res = await fetch(`${API_URL}/api/v1/mascotas`, {
                        method: 'POST', headers: getHeaders(true),
                        body: JSON.stringify(payload)
                    });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const created = await res.json();
                    await DB_MASCOTAS.put({ ...doc, remoteId: created.id, syncStatus: 'synced' });

                } else if (doc.syncStatus === 'pending_update' && doc.remoteId) {
                    const res = await fetch(`${API_URL}/api/v1/mascotas/${doc.remoteId}`, {
                        method: 'PATCH', headers: getHeaders(true),
                        body: JSON.stringify({ nombre: doc.nombre, tipo: doc.tipo, genero: doc.genero, edad: doc.edad })
                    });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    await DB_MASCOTAS.put({ ...doc, syncStatus: 'synced' });

                } else if (doc.syncStatus === 'pending_delete') {
                    if (doc.remoteId) {
                        const res = await fetch(`${API_URL}/api/v1/mascotas/${doc.remoteId}`, {
                            method: 'DELETE', headers: getHeaders(true)
                        });
                        if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
                    }
                    await DB_MASCOTAS.remove(doc);
                }
            } catch (err) {
                console.error('[Sync Mascotas] doc', doc._id, err);
            }
        }

        // Sync-down
        try {
            const res = await fetch(`${API_URL}/api/v1/mascotas`, { headers: getHeaders(false) });
            if (!res.ok) return;
            const remotas = await res.json();
            const localResult = await DB_MASCOTAS.allDocs({ include_docs: true });
            const remoteIdMap = {};
            for (const row of localResult.rows) {
                if (row.doc.remoteId) remoteIdMap[row.doc.remoteId] = row.doc;
            }
            for (const r of remotas) {
                const local = remoteIdMap[r.id];
                if (!local) {
                    await DB_MASCOTAS.put({
                        _id: 'remote-' + r.id,
                        nombre: r.nombre, tipo: r.tipo, genero: r.genero || '',
                        edad: r.edad, fotografia: r.fotografia || '',
                        remoteId: r.id, syncStatus: 'synced'
                    });
                } else if (local.syncStatus === 'synced') {
                    const changed = local.nombre !== r.nombre || local.tipo !== r.tipo || local.edad !== r.edad;
                    if (changed) await DB_MASCOTAS.put({ ...local, nombre: r.nombre, tipo: r.tipo, edad: r.edad, syncStatus: 'synced' });
                }
            }
        } catch (err) { console.warn('[Sync Mascotas down]', err); }
    }

    // ---- PERSONAS ----
    async syncPersonas() {
        const result  = await DB_PERSONAS.allDocs({ include_docs: true });
        const pending = result.rows.filter(r => r.doc.syncStatus === 'pending_create');

        for (const row of pending) {
            const doc = row.doc;
            try {
                const payload = {
                    id:             doc._id,
                    nombres:        doc.nombres,
                    apellidos:      doc.apellidos,
                    tipoDocumento:  doc.tipoDocumento,
                    documento:      doc.documento,
                    direccion:      doc.direccion,
                    telefono:       doc.telefono,
                    ciudad:         doc.ciudad,
                    usuario:        doc.usuario,
                    contrasena:     doc.contrasenaHash || ''
                };
                const res = await fetch(`${API_URL}/api/v1/personas`, {
                    method: 'POST', headers: getHeaders(false),
                    body: JSON.stringify(payload)
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const created = await res.json();
                const docLimpio = { ...doc };
                delete docLimpio.contrasenaHash;
                await DB_PERSONAS.put({ ...docLimpio, remoteId: created.id, syncStatus: 'synced' });
            } catch (err) {
                console.error('[Sync Personas] doc', doc._id, err);
            }
        }

        // Sync-down personas
        try {
            const res = await fetch(`${API_URL}/api/v1/personas`, { headers: getHeaders(false) });
            if (!res.ok) return;
            const remotas = await res.json();
            const localResult = await DB_PERSONAS.allDocs({ include_docs: true });
            const remoteIdMap = {};
            for (const row of localResult.rows) {
                if (row.doc.remoteId) remoteIdMap[row.doc.remoteId] = row.doc;
            }
            for (const r of remotas) {
                if (!remoteIdMap[r.id]) {
                    await DB_PERSONAS.put({
                        _id: 'remote-' + r.id,
                        nombres: r.nombres, apellidos: r.apellidos,
                        tipoDocumento: r.tipoDocumento, documento: r.documento,
                        direccion: r.direccion, telefono: r.telefono,
                        ciudad: r.ciudad, usuario: r.usuario,
                        remoteId: r.id, syncStatus: 'synced'
                    });
                }
            }
        } catch (err) { console.warn('[Sync Personas down]', err); }
    }

    // ---- CENSOS ----
    async syncCensos() {
        const result  = await DB_CENSOS.allDocs({ include_docs: true });
        const pending = result.rows.filter(r => r.doc.syncStatus === 'pending_create');

        for (const row of pending) {
            const doc = row.doc;
            try {
                const payload = {
                    id:          doc._id,
                    idMascota:   doc.idMascota,
                    idDueno:     doc.idDueno,
                    fotografia:  doc.fotografia,
                    lat:         doc.lat,
                    lon:         doc.lon,
                    idProyecto:  doc.idProyecto,
                    color:       doc.color
                };
                const res = await fetch(`${API_URL}/api/v1/censos`, {
                    method: 'POST',
                    headers: getHeaders(true),
                    body: JSON.stringify(payload)
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const created = await res.json();
                await DB_CENSOS.put({ ...doc, remoteId: created.id, syncStatus: 'synced' });
            } catch (err) {
                console.error('[Sync Censos] doc', doc._id, err);
            }
        }
    }
}

// Instancia global — disponible en todas las páginas
const syncManager = new SyncManager();

// Función global para el botón manual
function sincronizarTodo() { syncManager.sync(); }
