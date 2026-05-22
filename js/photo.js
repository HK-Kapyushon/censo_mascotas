// ============================================================
// photo.js — Acceso a cámara del dispositivo (RF04)
// Del proyecto de referencia pwa_008, adaptado
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    const btnCamara    = document.getElementById('btnCamara');
    const video        = document.getElementById('video');
    const canvas       = document.getElementById('canvas');
    const btnFoto      = document.getElementById('btnFoto');
    const cameraSelect = document.getElementById('cameraSelect');
    if (!btnCamara) return; // no estamos en una página con cámara
    let stream;

    btnCamara.onclick = async () => {
        try {
            if (stream) stream.getTracks().forEach(t => t.stop());
            const facingMode = cameraSelect ? cameraSelect.value : 'environment';
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode } });
            video.srcObject = stream;
            video.style.display = 'block';
            btnFoto.style.display = 'inline-block';
        } catch (err) {
            alert('No se pudo acceder a la cámara: ' + err.message);
        }
    };

    btnFoto.onclick = () => {
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL('image/jpeg', 0.7); // compresión JPEG para reducir tamaño
        video.style.display = 'none';
        btnFoto.style.display = 'none';
        if (stream) stream.getTracks().forEach(t => t.stop());

        // Entregar la imagen al módulo que la necesite
        if (typeof window.onFotoCapturada === 'function') {
            window.onFotoCapturada(base64);
        }
    };
});
