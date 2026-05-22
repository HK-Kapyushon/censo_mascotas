// ============================================================
// map.js — Mapa con Leaflet (sin API Key) (RF07-RF09)
// Basado en geo.js del proyecto de referencia
// ============================================================

let mapaLeaflet = null;

// Inicializar mapa centrado en Tunja/UPTC (RF07)
function initMap() {
    if (mapaLeaflet) { mapaLeaflet.remove(); mapaLeaflet = null; }

    mapaLeaflet = L.map('map').setView([5.535, -73.367], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(mapaLeaflet);

    cargarMarcadores();
}

// Cargar todos los censos y dibujar pines (RF08)
async function cargarMarcadores() {
    const loader = document.getElementById('mapLoader');
    if (loader) loader.style.display = 'flex';

    try {
        const res = await fetch(`${API_URL}/api/v1/censos`);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const censos = await res.json();

        if (!censos || censos.length === 0) {
            mostrarToast('No hay censos registrados aún.', 'info');
            return;
        }

        // Renderizar en lotes con requestAnimationFrame (RNF03)
        let i = 0;
        function procesarLote() {
            const fin = Math.min(i + 20, censos.length);
            for (; i < fin; i++) dibujarMarcador(censos[i]);
            if (i < censos.length) {
                requestAnimationFrame(procesarLote);
            } else {
                if (loader) loader.style.display = 'none';
            }
        }
        requestAnimationFrame(procesarLote);

    } catch (err) {
        console.error('[Mapa] Error:', err);
        if (loader) loader.style.display = 'none';
        mostrarToast('No se pudieron cargar los censos.', 'warning');
    }
}

// Dibujar un marcador con icono SVG del color del censo (RF08)
function dibujarMarcador(censo) {
    if (!censo.lat || !censo.lon || !mapaLeaflet) return;

    const color = censo.color || '#534AB7';
    const m = censo.mascota || {};
    const d = censo.dueno   || {};

    // Ícono SVG con el color exacto del campo color (igual que geo.js pero dinámico)
    const customIcon = L.divIcon({
        className: '',
        html: `
        <svg width="32" height="40" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 0 C7.16 0 0 7.16 0 16 C0 27 16 40 16 40 C16 40 32 27 32 16 C32 7.16 24.84 0 16 0Z"
            fill="${color}" stroke="white" stroke-width="2"/>
          <text x="16" y="22" text-anchor="middle" font-size="14" fill="white">🐾</text>
        </svg>`,
        iconSize:    [32, 40],
        iconAnchor:  [16, 40],
        popupAnchor: [0, -40]
    });

    const marker = L.marker([censo.lat, censo.lon], { icon: customIcon });
    marker.bindPopup(construirPopup(censo), { maxWidth: 260 });
    marker.addTo(mapaLeaflet);
}

// Popup con datos completos (RF09)
function construirPopup(c) {
    const m = c.mascota || {};
    const d = c.dueno   || {};
    const color = c.color || '#534AB7';

    const fotoHTML = c.fotografiaCenso
        ? `<img src="${c.fotografiaCenso}" style="width:100%;max-height:110px;object-fit:cover;border-radius:6px;margin-top:6px;">`
        : '';

    const mascFotoHTML = m.fotografia
        ? `<img src="${m.fotografia}" style="width:38px;height:38px;border-radius:50%;object-fit:cover;border:2px solid ${color};">`
        : `<span style="font-size:24px;">🐾</span>`;

    return `
    <div style="font-family:sans-serif;font-size:13px;min-width:200px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        ${mascFotoHTML}
        <div>
          <strong style="font-size:14px;">${m.nombre || 'Sin nombre'}</strong><br>
          <span style="color:#666;">${m.tipo || ''} · ${m.genero || ''} · ${m.edad != null ? m.edad + ' años' : ''}</span>
        </div>
      </div>
      <hr style="margin:5px 0;">
      <p style="margin:3px 0;"><strong>👤</strong> ${d.nombres || ''} ${d.apellidos || ''}</p>
      <p style="margin:3px 0;"><strong>📞</strong> ${d.telefono || 'N/A'}</p>
      <p style="margin:3px 0;"><strong>🏙️</strong> ${d.ciudad || 'N/A'}</p>
      <p style="margin:3px 0;">
        <span style="background:${color};color:white;padding:1px 6px;border-radius:4px;font-size:11px;">
          ${c.idProyecto || ''}
        </span>
      </p>
      ${fotoHTML}
    </div>`;
}

function mostrarToast(msg, tipo) {
    const t = document.getElementById('mapToast');
    if (!t) return;
    t.textContent = msg;
    t.className = `map-toast alert-${tipo}`;
    t.style.display = 'block';
    setTimeout(() => t.style.display = 'none', 4000);
}
