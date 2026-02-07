document.addEventListener('DOMContentLoaded', () => {
  let selectedPointId = null;
  let sessionStats = {
    va: { min: Infinity, max: -Infinity },
    ia: { min: Infinity, max: -Infinity },
    vb: { min: Infinity, max: -Infinity },
    ib: { min: Infinity, max: -Infinity },
    vc: { min: Infinity, max: -Infinity },
    ic: { min: Infinity, max: -Infinity }
  };

  // --- 1. Configuración General y UI ---

  // Modo Oscuro
  const bodyEl = document.body;
  const darkToggle = document.getElementById('darkModeToggle');
  const savedTheme = localStorage.getItem('theme');
  
  if(savedTheme === 'dark') {
    bodyEl.classList.add('dark-mode');
    if(darkToggle) darkToggle.textContent = 'Modo claro';
  }

  if(darkToggle) {
    darkToggle.addEventListener('click', () => {
      bodyEl.classList.toggle('dark-mode');
      const isDark = bodyEl.classList.contains('dark-mode');
      darkToggle.textContent = isDark ? 'Modo claro' : 'Modo oscuro';
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
    });
  }

  // Reloj en tiempo real
  function updateClock() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
    const clockEl = document.getElementById('liveClock');
    if(clockEl) clockEl.textContent = now.toLocaleDateString('es-ES', options);
  }
  setInterval(updateClock, 1000);
  updateClock();

  // Botón Informe
  const reportBtn = document.getElementById('reportBtn');
  if(reportBtn) {
    reportBtn.addEventListener('click', () => {
      showToast("Generando informe...", "info");
      const tsEl = document.getElementById('reportTimestamp');
      if(tsEl) tsEl.textContent = `Generado el: ${new Date().toLocaleString()}`;
      setTimeout(() => {
        window.print();
      }, 500);
    });
  }

  // Notificaciones Toast
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if(!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${type === 'success' ? '✅' : (type === 'error' ? '❌' : 'ℹ️')}</span> ${message}`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.5s forwards';
      setTimeout(() => toast.remove(), 500);
    }, 3000);
  }

  // --- 2. Simulación de Datos y Conexión (Reemplaza MQTT) ---

  const statusEl = document.getElementById('connectionStatus');
  const textEl = document.getElementById('connText');
  let isConnected = false;
  let faultActive = false; // Estado de simulación de falla

  // Función mejorada para actualizar valor, unidad y estado
  function updateElement(id, value, unit = '', status = 'normal') {
    const el = document.getElementById(id);
    if (el) {
      el.innerHTML = `${value} <span class="sts-unit">${unit}</span>`;
      // Gestionar clases de estado
      el.classList.remove('text-warning', 'text-alert');
      if (status === 'warning') el.classList.add('text-warning');
      if (status === 'alert') el.classList.add('text-alert');
    }
  }

  function setConnectionState(state) {
    isConnected = state;
    if (state) {
      if (textEl) textEl.textContent = 'Conectado';
      if (statusEl) statusEl.className = 'status-connected';
      showToast("Conexión establecida", "success");
    } else {
      if (textEl) textEl.textContent = 'Desconectado';
      if (statusEl) statusEl.className = 'status-disconnected';
      showToast("Conexión perdida", "error");
    }
  }

  // Iniciar simulación
  setTimeout(() => {
    setConnectionState(true);
  }, 1000);

  // Función para activar/desactivar simulación de falla
  window.toggleFaultSimulation = () => {
    faultActive = !faultActive;
    const btn = document.getElementById('simFaultBtn');
    if(btn) {
        btn.textContent = faultActive ? "⏹ Detener Falla" : "⚠️ Simular Falla";
        btn.style.backgroundColor = faultActive ? "#333" : "#dc3545";
    }
    showToast(faultActive ? "Simulación de falla ACTIVADA" : "Simulación de falla desactivada", faultActive ? "error" : "info");
  };

  // Ciclo de conexión/desconexión
  setInterval(() => {
    // 10% probabilidad de desconexión
    if (Math.random() < 0.1 && isConnected) {
      setConnectionState(false);
      // Reconectar en 3s
      setTimeout(() => {
        if (textEl) textEl.textContent = 'Reconectando...';
        if (statusEl) statusEl.className = 'status-reconnecting';
        setTimeout(() => {
          setConnectionState(true);
        }, 2000);
      }, 3000);
    }
  }, 10000);

  // --- Configuración del Gráfico Global ---
  const ctxGlobal = document.getElementById('globalTrendChart').getContext('2d');
  
  // Crear gradientes para un look "Premium"
  function createGradient(ctx, colorHex) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    // Convertir hex simple a rgba aproximado para el ejemplo
    const hexToRgba = (hex, alpha) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };
    gradient.addColorStop(0, hexToRgba(colorHex, 0.4));
    gradient.addColorStop(1, hexToRgba(colorHex, 0.0));
    return gradient;
  }

  const colors = ['#009798', '#28a745', '#ffc107', '#dc3545', '#6f42c1'];
  const datasets = colors.map((color, index) => ({
    label: `Punto ${index + 1} (A)`,
    data: [],
    borderColor: color,
    backgroundColor: createGradient(ctxGlobal, color),
    tension: 0.4,
    borderWidth: 2,
    pointRadius: 0,
    fill: true // Relleno activado para efecto de área
  }));

  const globalChart = new Chart(ctxGlobal, {
    type: 'line',
    data: {
      labels: [],
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top' },
        tooltip: { mode: 'index', intersect: false }
      },
      scales: {
        x: { display: false },
        y: { beginAtZero: true, title: { display: true, text: 'Corriente (A)' } }
      }
    }
  });

  // Actualización de datos (cada 2s)
  setInterval(() => {
    if (!isConnected) return;

    let totalPower = 0;
    let totalPF = 0;
    let currentEnergy = parseFloat(document.getElementById('kpi_energy')?.textContent) || 1250.5; // Valor inicial simulado
    const now = new Date().toLocaleTimeString();

    // Actualizar gráfico (labels)
    if (globalChart.data.labels.length > 50) {
      globalChart.data.labels.shift();
      globalChart.data.datasets.forEach(d => d.data.shift());
    }
    globalChart.data.labels.push(now);

    for (let i = 1; i <= 5; i++) {
      // Generar valores aleatorios
      // Simular fluctuaciones
      let v_raw = 380 + Math.random() * 15 - 7.5; 
      let i_raw = 120 + Math.random() * 40 - 20;

      // Lógica de Simulación de Falla
      if (faultActive) {
        // Forzar sobrecarga en Punto 1 y bajo voltaje en Punto 3
        if (i === 1) i_raw = 180 + Math.random() * 20; // Sobrecarga crítica
        if (i === 3) v_raw = 350 + Math.random() * 10; // Bajo voltaje
      }
      
      const v_tot = v_raw.toFixed(1);
      const i_tot = i_raw.toFixed(1);
      
      // Simular Factor de Potencia (0.88 - 0.98)
      const pf = 0.93 + (Math.random() * 0.1 - 0.05);
      // Cálculo de Potencia Activa (kW) = V * I * sqrt(3) * pf / 1000
      const kw = (parseFloat(v_tot) * parseFloat(i_tot) * 1.732 * pf / 1000).toFixed(1);

      // Acumular para KPIs
      totalPower += parseFloat(kw);
      totalPF += pf;

      // Determinar estado (Simulación de alertas)
      // Voltaje nominal 380V. Alerta si desvía > 5% (aprox <360 o >400)
      let vStatus = 'normal';
      if (v_raw < 370 || v_raw > 390) vStatus = 'warning';
      if (v_raw < 360 || v_raw > 400) vStatus = 'alert';

      // Corriente alta > 150A
      let iStatus = 'normal';
      if (i_raw > 145) iStatus = 'warning';
      if (i_raw > 155) iStatus = 'alert';

      // Fases (simplificado)
      const v_ph = (v_tot / Math.sqrt(3)).toFixed(1);
      const i_ph = (i_tot / 3).toFixed(1);

      updateElement(`p${i}_v_tot`, v_tot, 'V', vStatus);
      updateElement(`p${i}_i_tot`, i_tot, 'A', iStatus);
      updateElement(`p${i}_kw`, kw, 'kW');

      if (selectedPointId === i) {
        updateElement('modal_va', v_ph);
        updateElement('modal_ia', i_ph);
        updateElement('modal_vb', v_ph);
        updateElement('modal_ib', i_ph);
        updateElement('modal_vc', v_ph);
        updateElement('modal_ic', i_ph);

        // Actualizar Min/Max en tiempo real
        const updateStat = (key, valStr, idMin, idMax) => {
            const val = parseFloat(valStr);
            if (val < sessionStats[key].min) sessionStats[key].min = val;
            if (val > sessionStats[key].max) sessionStats[key].max = val;
            
            const elMin = document.getElementById(idMin);
            const elMax = document.getElementById(idMax);
            if(elMin) elMin.textContent = sessionStats[key].min.toFixed(1);
            if(elMax) elMax.textContent = sessionStats[key].max.toFixed(1);
        };

        updateStat('va', v_ph, 'modal_va_min', 'modal_va_max');
        updateStat('ia', i_ph, 'modal_ia_min', 'modal_ia_max');
        updateStat('vb', v_ph, 'modal_vb_min', 'modal_vb_max');
        updateStat('ib', i_ph, 'modal_ib_min', 'modal_ib_max');
        updateStat('vc', v_ph, 'modal_vc_min', 'modal_vc_max');
        updateStat('ic', i_ph, 'modal_ic_min', 'modal_ic_max');

        // Actualizar Gráfico del Modal en tiempo real
        if (historyChartInstance) {
            historyChartInstance.data.labels.push(new Date().toLocaleTimeString());
            historyChartInstance.data.datasets[0].data.push(i_tot);
            if (historyChartInstance.data.labels.length > 40) {
                historyChartInstance.data.labels.shift();
                historyChartInstance.data.datasets[0].data.shift();
            }
            historyChartInstance.update('none');
        }
      }

      // Actualizar dataset del gráfico
      globalChart.data.datasets[i-1].data.push(i_tot);
    }

    // Simular acumulación de energía (kWh)
    // Potencia (kW) * Tiempo (h). 2 segundos = 2/3600 horas
    currentEnergy += totalPower * (2 / 3600);

    // Actualizar KPIs Globales
    updateElement('kpi_total_power', totalPower.toFixed(1), 'kW');
    updateElement('kpi_energy', currentEnergy.toFixed(2), 'kWh');
    
    // Actualizar Factor de Potencia Promedio
    const avgPF = (totalPF / 5).toFixed(3);
    updateElement('kpi_pf', avgPF);
    
    globalChart.update('none'); // 'none' para mejor rendimiento sin animación brusca
  }, 2000);

  // --- Lógica del Modal de Historial ---
  let historyChartInstance = null;

  window.openPointHistory = (pointId) => {
    selectedPointId = pointId;
    
    // Reiniciar estadísticas de sesión
    sessionStats = {
      va: { min: Infinity, max: -Infinity },
      ia: { min: Infinity, max: -Infinity },
      vb: { min: Infinity, max: -Infinity },
      ib: { min: Infinity, max: -Infinity },
      vc: { min: Infinity, max: -Infinity },
      ic: { min: Infinity, max: -Infinity }
    };

    const modal = document.getElementById('historyModal');
    const title = document.getElementById('historyModalTitle');
    if(modal) modal.style.display = 'block';
    if(title) title.textContent = `Historial Detallado - Punto de Medición ${pointId}`;

    const ctx = document.getElementById('historyChart').getContext('2d');
    
    // Generar datos simulados (últimas 24 horas)
    const labels = [];
    const data = [];
    const now = new Date();
    
    for(let i=24; i>=0; i--) {
      const d = new Date(now.getTime() - i * 60 * 60 * 1000);
      labels.push(d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}));
      // Valor aleatorio alrededor de 120A
      data.push((120 + Math.random() * 40 - 20).toFixed(1));
    }

    if(historyChartInstance) {
      historyChartInstance.destroy();
    }

    // Gradiente para el gráfico
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(0, 151, 152, 0.5)');
    gradient.addColorStop(1, 'rgba(0, 151, 152, 0.0)');

    historyChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Corriente Histórica (A)',
          data: data,
          borderColor: '#009798',
          backgroundColor: gradient,
          fill: true,
          tension: 0.4,
          borderWidth: 2,
          pointRadius: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { mode: 'index', intersect: false }
        },
        scales: {
          y: { beginAtZero: false, title: { display: true, text: 'Amperios (A)' } }
        }
      }
    });
  }

  window.closePointHistory = () => {
    selectedPointId = null;
    const modal = document.getElementById('historyModal');
    if(modal) modal.style.display = 'none';
  }

  // Cerrar modal al hacer clic fuera
  window.onclick = function(event) {
    const modal = document.getElementById('historyModal');
    if (event.target == modal) {
      window.closePointHistory();
    }
  }
});