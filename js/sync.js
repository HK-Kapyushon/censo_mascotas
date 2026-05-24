// ============================================================
// sync.js — SyncManager
// Sincronización bidireccional completa (CP-02)
// ============================================================

const API_URL = 'https://elprofehugo.online';

function getHeaders(conAuth = true) {
    const h = { 'Content-Type': 'application/json' };
    if (conAuth) {
        const token = localStorage.getItem('token');
        if (token) h['Authorization'] = 'Bearer ' + token;
    }
    return h;
}

class SyncManager {
    constructor() {
        this.syncing = false;
        this._setupListeners();
        setInterval(() => this.sync(), 30000);
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
            // Orden importante: personas → mascotas → censos
            // El censo necesita los remoteId de persona y mascota
            await this.syncPersonas();
            await this.syncMascotas();
            await this.syncCensos();
            if (typeof cargarMascotas === 'function') cargarMascotas();
            if (typeof cargarPersonas === 'function') cargarPersonas();
            if (typeof cargarMisCensos === 'function') cargarMisCensos();
        } catch (err) {
            console.error('[Sync] Error general:', err);
        } finally {
            this.syncing = false;
            this._setSyncingUI(false);
        }
    }

    // ---- MASCOTAS ----
    async syncMascotas() {
        const result  = await DB_MASCOTAS.allDocs({ include_docs: true });
        const pending = result.rows.filter(r =>
            r.doc.syncStatus && r.doc.syncStatus !== 'synced' &&
            !r.doc._id.startsWith('_design')
        );

        for (const row of pending) {
            const doc = row.doc;
            try {
                if (doc.syncStatus === 'pending_create') {
                    // NO enviar id — el backend lo genera
                    const payload = {
                        nombre:     doc.nombre,
                        tipo:       doc.tipo,
                        genero:     doc.genero || '',
                        edad:       doc.edad,
                        fotografia: doc.fotografia || ''
                    };
                    console.log('[Sync Mascotas] payload:', JSON.stringify(payload));
                    const res = await fetch(`${API_URL}/api/v1/mascotas`, {
                        method: 'POST',
                        headers: getHeaders(true),
                        body: JSON.stringify(payload)
                    });
                    if (!res.ok) {
                        const detalle = await res.text().catch(() => '');
                        throw new Error(`HTTP ${res.status}: ${detalle}`);
                    }
                    const created = await res.json();
                    // Guardar el id que asignó el backend como remoteId
                    await DB_MASCOTAS.put({ ...doc, remoteId: created.id, syncStatus: 'synced' });
                    console.log('[Sync Mascotas] ✓ creada, remoteId:', created.id);

                } else if (doc.syncStatus === 'pending_update' && doc.remoteId) {
                    const res = await fetch(`${API_URL}/api/v1/mascotas/${doc.remoteId}`, {
                        method: 'PATCH',
                        headers: getHeaders(true),
                        body: JSON.stringify({
                            nombre: doc.nombre,
                            tipo:   doc.tipo,
                            genero: doc.genero,
                            edad:   doc.edad
                        })
                    });
                    if (!res.ok) {
                        const detalle = await res.text().catch(() => '');
                        throw new Error(`HTTP ${res.status}: ${detalle}`);
                    }
                    await DB_MASCOTAS.put({ ...doc, syncStatus: 'synced' });

                } else if (doc.syncStatus === 'pending_delete') {
                    if (doc.remoteId) {
                        const res = await fetch(`${API_URL}/api/v1/mascotas/${doc.remoteId}`, {
                            method: 'DELETE',
                            headers: getHeaders(true)
                        });
                        if (!res.ok && res.status !== 404) {
                            throw new Error(`HTTP ${res.status}`);
                        }
                    }
                    await DB_MASCOTAS.remove(doc);
                }
            } catch (err) {
                console.error('[Sync Mascotas] doc', doc._id, err);
            }
        }

        // Sync-down: traer mascotas del servidor
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
                if (!remoteIdMap[r.id]) {
                    await DB_MASCOTAS.put({
                        _id:        'remote-' + r.id,
                        nombre:     r.nombre,
                        tipo:       r.tipo,
                        genero:     r.genero || '',
                        edad:       r.edad,
                        fotografia: r.fotografia || '',
                        remoteId:   r.id,
                        syncStatus: 'synced'
                    });
                }
            }
        } catch (err) {
            console.warn('[Sync Mascotas down]', err);
        }
    }

    // ---- PERSONAS ----
    async syncPersonas() {
        const result  = await DB_PERSONAS.allDocs({ include_docs: true });
        const pending = result.rows.filter(r =>
            r.doc.syncStatus === 'pending_create' &&
            !r.doc._id.startsWith('_design')
        );

        for (const row of pending) {
            const doc = row.doc;
            try {
                // NO enviar id — el backend lo genera
                const payload = {
                    nombres:       doc.nombres,
                    apellidos:     doc.apellidos,
                    tipoDocumento: doc.tipoDocumento,
                    documento:     doc.documento,
                    direccion:     doc.direccion,
                    telefono:      doc.telefono,
                    ciudad:        doc.ciudad,
                    usuario:       doc.usuario,
                    contrasena:    doc.contrasenaHash || ''
                };
                console.log('[Sync Personas] payload:', JSON.stringify({...payload, contrasena: '***'}));
                const res = await fetch(`${API_URL}/api/v1/personas`, {
                    method: 'POST',
                    headers: getHeaders(false),
                    body: JSON.stringify(payload)
                });
                if (!res.ok) {
                    const detalle = await res.text().catch(() => '');
                    throw new Error(`HTTP ${res.status}: ${detalle}`);
                }
                const created = await res.json();
                const docLimpio = { ...doc };
                delete docLimpio.contrasenaHash;
                await DB_PERSONAS.put({ ...docLimpio, remoteId: created.id, syncStatus: 'synced' });
                console.log('[Sync Personas] ✓ creada, remoteId:', created.id);
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
                        _id:          'remote-' + r.id,
                        nombres:      r.nombres,
                        apellidos:    r.apellidos,
                        tipoDocumento:r.tipoDocumento,
                        documento:    r.documento,
                        direccion:    r.direccion,
                        telefono:     r.telefono,
                        ciudad:       r.ciudad,
                        usuario:      r.usuario,
                        remoteId:     r.id,
                        syncStatus:   'synced'
                    });
                }
            }
        } catch (err) {
            console.warn('[Sync Personas down]', err);
        }
    }

    // ---- CENSOS ----
    async syncCensos() {
        const result  = await DB_CENSOS.allDocs({ include_docs: true });
        const pending = result.rows.filter(r =>
            r.doc.syncStatus === 'pending_create' &&
            !r.doc._id.startsWith('_design')
        );

        for (const row of pending) {
            const doc = row.doc;
            try {
                // Resolver remoteId de mascota y persona
                // Si el id guardado es un _id local, buscar su remoteId
                let idMascota = doc.idMascota;
                let idDueno   = doc.idDueno;

                // Buscar remoteId de mascota
                try {
                    const mDoc = await DB_MASCOTAS.get(doc.idMascota).catch(() => null);
                    if (mDoc && mDoc.remoteId) idMascota = mDoc.remoteId;
                    else {
                        // Buscar por remoteId en todos los docs
                        const allM = await DB_MASCOTAS.allDocs({ include_docs: true });
                        const found = allM.rows.find(r =>
                            r.doc.remoteId === doc.idMascota || r.doc._id === doc.idMascota
                        );
                        if (found && found.doc.remoteId) idMascota = found.doc.remoteId;
                    }
                } catch(e) {}

                // Buscar remoteId de persona
                try {
                    const pDoc = await DB_PERSONAS.get(doc.idDueno).catch(() => null);
                    if (pDoc && pDoc.remoteId) idDueno = pDoc.remoteId;
                    else {
                        const allP = await DB_PERSONAS.allDocs({ include_docs: true });
                        const found = allP.rows.find(r =>
                            r.doc.remoteId === doc.idDueno || r.doc._id === doc.idDueno
                        );
                        if (found && found.doc.remoteId) idDueno = found.doc.remoteId;
                    }
                } catch(e) {}

                // Si alguno sigue siendo un id local (sin remoteId), esperar al próximo sync
                if (!idMascota || !idDueno) {
                    console.warn('[Sync Censos] Esperando remoteId de mascota/persona...');
                    continue;
                }

                // NO enviar id — el backend lo genera
                const payload = {
                    idMascota:  idMascota,
                    idDueno:    idDueno,
                    fotografia: doc.fotografia,
                    lat:        doc.lat,
                    lon:        doc.lon,
                    idProyecto: doc.idProyecto,
                    color:      doc.color
                };
                console.log('[Sync Censos] payload (sin foto):', {
                    ...payload, fotografia: payload.fotografia ? '[base64]' : null
                });
                const res = await fetch(`${API_URL}/api/v1/censos`, {
                    method: 'POST',
                    headers: getHeaders(true),
                    body: JSON.stringify(payload)
                });
                if (!res.ok) {
                    const detalle = await res.text().catch(() => '');
                    throw new Error(`HTTP ${res.status}: ${detalle}`);
                }
                const created = await res.json();
                await DB_CENSOS.put({ ...doc, remoteId: created.id, syncStatus: 'synced' });
                console.log('[Sync Censos] ✓ creado, remoteId:', created.id);
            } catch (err) {
                console.error('[Sync Censos] doc', doc._id, err);
            }
        }
    }
}

// Instancia global
const syncManager = new SyncManager();

// Función global para botón manual
function sincronizarTodo() { syncManager.sync(); }