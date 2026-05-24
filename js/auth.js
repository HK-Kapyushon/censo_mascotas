// ============================================================
// auth.js — Autenticación JWT (RF01)
// API_URL viene de sync.js (cargado antes)
// ============================================================

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const usuario    = document.getElementById('usuario').value.trim();
    const contrasena = document.getElementById('contrasena').value;
    const errDiv     = document.getElementById('error');
    const btn        = document.querySelector('#loginForm button[type="submit"]');

    errDiv.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Ingresando...';

    try {
        const res = await fetch(`${API_URL}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario, contrasena })
        });
        if (!res.ok) throw new Error((await res.text()) || 'Credenciales inválidas');
        const data = await res.json();

        localStorage.setItem('token',         data.token);
        localStorage.setItem('tokenTipo',     data.tipoToken);
        localStorage.setItem('tokenExpira',   Date.now() + (data.expiraEn * 1000));
        localStorage.setItem('usuarioActual', usuario);

        window.location.href = 'index.html';
    } catch (err) {
        errDiv.textContent = err.message || 'Error de conexión.';
        btn.disabled = false;
        btn.textContent = 'Ingresar';
        
    }
});

// Redirigir si ya tiene sesión válida
const token  = localStorage.getItem('token');
const expira = parseInt(localStorage.getItem('tokenExpira') || '0');
if (token && Date.now() < expira) window.location.href = 'index.html';
