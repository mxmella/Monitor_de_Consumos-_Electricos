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

  console.log("FAZS Automatización - Entorno de Pruebas Iniciado");

  // Configuración de Puntos (Broker/Topic)
  let pointConfigs = [{}, {}, {}, {}, {}, {}]; // Índices 1-5 usados
  let pilotConfig = null; // Configuración para el panel de luces
  let kpiConfigs = { power: null, energy: null, pf: null }; // Configuración para KPIs

  // Cargar configuración guardada
  const loadSavedConfigs = () => {
    const saved = localStorage.getItem('fazs_point_configs');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        parsed.forEach((cfg, idx) => {
          if (cfg && cfg.broker && cfg.topic) {
            // Restaurar conexión automáticamente
            currentConfigId = idx; // Hack temporal para usar savePointConfig logic o reconectar manual
            // Mejor: Crear función de reconexión. Por ahora, solo cargamos los datos en memoria para que el usuario pueda dar "Guardar" de nuevo o reconectar.
            // Para una demo real, reconectamos:
            connectMqttForPoint(idx, cfg.broker, cfg.topic, cfg.keys);
          }
        });
        showToast("Configuraciones restauradas", "success");
      } catch (e) { console.error("Error cargando configs", e); }
    }
    
    const savedPilot = localStorage.getItem('fazs_pilot_config');
    if (savedPilot) {
        try {
            const parsed = JSON.parse(savedPilot);
            if (parsed && parsed.broker) connectPilotMqtt(parsed.broker, parsed.topic, parsed.keys);
        } catch(e) { console.error("Error cargando pilot config", e); }
    }

    const savedKpis = localStorage.getItem('fazs_kpi_configs');
    if (savedKpis) {
        try {
            const parsed = JSON.parse(savedKpis);
            if (parsed.power) connectKpiMqtt('power', parsed.power.broker, parsed.power.topic, parsed.power.key);
            if (parsed.energy) connectKpiMqtt('energy', parsed.energy.broker, parsed.energy.topic, parsed.energy.key);
            if (parsed.pf) connectKpiMqtt('pf', parsed.pf.broker, parsed.pf.topic, parsed.pf.key);
        } catch(e) { console.error("Error cargando kpi configs", e); }
    }
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

  let simulationIntervalId = null;

  // Actualización de datos (cada 2s)
  function runSimulationStep() {
    if (!isConnected || isTestMode) return; // Detener si está en Modo Pruebas

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
      // Si el punto tiene configuración MQTT activa, saltar simulación
      if (pointConfigs[i] && pointConfigs[i].client && pointConfigs[i].client.connected) {
          continue;
      }

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
    if (!kpiConfigs.power || !kpiConfigs.power.client || !kpiConfigs.power.client.connected) {
        updateElement('kpi_total_power', totalPower.toFixed(1), 'kW');
    }
    if (!kpiConfigs.energy || !kpiConfigs.energy.client || !kpiConfigs.energy.client.connected) {
        updateElement('kpi_energy', currentEnergy.toFixed(2), 'kWh');
    }
    
    // Actualizar Factor de Potencia Promedio
    if (!kpiConfigs.pf || !kpiConfigs.pf.client || !kpiConfigs.pf.client.connected) {
        const avgPF = (totalPF / 5).toFixed(3);
        updateElement('kpi_pf', avgPF);
    }
    
    globalChart.update('none'); // 'none' para mejor rendimiento sin animación brusca

    // Simulación de Luces Piloto (si no hay MQTT conectado)
    if (!pilotConfig || !pilotConfig.client || !pilotConfig.client.connected) {
        for (let j = 1; j <= 4; j++) {
            // Cambiar estado aleatoriamente con baja probabilidad para que no sea discoteca
            if (Math.random() < 0.05) {
                const lamp = document.getElementById(`lamp${j}`);
                if (lamp) {
                    const isNowActive = lamp.classList.contains('active');
                    lamp.className = `pilot-light-large ${!isNowActive ? 'active' : 'inactive'}`;
                }
            }
        }
    }
  }

  function startSimulation(interval) {
    if (simulationIntervalId) clearInterval(simulationIntervalId);
    simulationIntervalId = setInterval(runSimulationStep, interval);
  }

  // Iniciar con velocidad por defecto
  startSimulation(2000);

  window.changeSimulationSpeed = (speed) => {
    startSimulation(parseInt(speed));
    showToast(`Velocidad actualizada`, "info");
  };

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

  // --- Pull to Refresh (Mobile) ---
  const ptrElement = document.getElementById('pull-to-refresh');
  let touchStartY = 0;
  
  window.addEventListener('touchstart', (e) => {
    if (window.scrollY === 0) touchStartY = e.touches[0].clientY;
  }, { passive: true });

  window.addEventListener('touchend', (e) => {
    if (window.scrollY === 0 && touchStartY > 0) {
      const touchEndY = e.changedTouches[0].clientY;
      if (touchEndY - touchStartY > 150) { // Umbral de arrastre
        if(ptrElement) ptrElement.classList.add('visible');
        setTimeout(() => {
            if(ptrElement) ptrElement.classList.remove('visible');
            showToast("Datos actualizados", "success");
        }, 1500);
      }
    }
    touchStartY = 0;
  });

  // --- Lógica de Prueba MQTT (Diagnóstico) ---
  let mqttTestClient = null;

  window.openMqttModal = () => {
    document.getElementById('mqttModal').style.display = 'block';
  };

  window.closeMqttModal = () => {
    document.getElementById('mqttModal').style.display = 'none';
    if (mqttTestClient) {
      mqttTestClient.end();
      mqttTestClient = null;
      updateMqttUI('Desconectado', false);
    }
  };

  window.toggleMqttConnection = () => {
    if (mqttTestClient) {
      mqttTestClient.end();
      mqttTestClient = null;
      updateMqttUI('Desconectado', false);
      return;
    }

    const topic = document.getElementById('mqttTopic').value;
    const brokerUrl = 'wss://broker.hivemq.com:8884/mqtt'; // Puerto WSS seguro para web

    updateMqttUI('Conectando...', false);
    logMqtt(`Intentando conectar a ${brokerUrl}...`);

    mqttTestClient = mqtt.connect(brokerUrl);

    mqttTestClient.on('connect', () => {
      updateMqttUI('Conectado', true);
      logMqtt('✅ Conexión establecida.');
      
      mqttTestClient.subscribe(topic, (err) => {
        if (!err) {
          logMqtt(`📡 Suscrito a: ${topic}`);
        } else {
          logMqtt(`❌ Error al suscribir: ${err.message}`);
        }
      });
    });

    mqttTestClient.on('message', (topic, message) => {
      const msgStr = message.toString();
      logMqtt(`📩 [${new Date().toLocaleTimeString()}] ${topic}:\n${msgStr}`);

      // Intentar parsear JSON para actualizar visualización en vivo
      try {
        // Buscar el inicio y fin del JSON por si viene mezclado con texto
        const jsonStart = msgStr.indexOf('{');
        const jsonEnd = msgStr.lastIndexOf('}');
        
        if (jsonStart !== -1 && jsonEnd !== -1) {
            const jsonStr = msgStr.substring(jsonStart, jsonEnd + 1);
            const data = JSON.parse(jsonStr);
            
            // Actualizar Valor Entero
            if (data.Internas_Entero !== undefined) {
                const valEl = document.getElementById('mqttValue');
                if(valEl) valEl.textContent = data.Internas_Entero;
            }

            // Actualizar Luz Piloto (Bool)
            if (data.Internas_Bool !== undefined) {
                const pilotEl = document.getElementById('mqttPilot');
                if(pilotEl) {
                    // Consideramos "1", 1, "true" o true como encendido
                    const isActive = data.Internas_Bool == 1 || data.Internas_Bool === "true" || data.Internas_Bool === true;
                    pilotEl.className = `pilot-light ${isActive ? 'active' : 'inactive'}`;
                }
            }
        }
      } catch (e) {
        // Si falla el parseo, solo se muestra en el log (ya hecho arriba)
      }
    });

    mqttTestClient.on('error', (err) => {
      logMqtt(`❌ Error: ${err.message}`);
      updateMqttUI('Error', false);
    });
  };

  function updateMqttUI(statusText, isConnected) {
    const statusEl = document.getElementById('mqttStatus');
    const btn = document.getElementById('btnMqttConnect');
    statusEl.textContent = `Estado: ${statusText}`;
    statusEl.style.color = isConnected ? '#28a745' : '#dc3545';
    btn.textContent = isConnected ? 'Desconectar' : 'Conectar';
    btn.style.backgroundColor = isConnected ? '#dc3545' : '#28a745';
  }

  function logMqtt(msg) {
    const logContainer = document.getElementById('mqttLog');
    const entry = document.createElement('div');
    entry.textContent = msg;
    logContainer.prepend(entry);
  }

  // --- Modo Pruebas (Limpieza para Configuración) ---
  let isTestMode = false;

  window.toggleTestMode = () => {
    isTestMode = !isTestMode;
    const btn = document.getElementById('testModeBtn');
    
    if (isTestMode) {
      if(btn) {
          btn.textContent = "⏹ Salir Modo Pruebas";
          btn.style.backgroundColor = "#dc3545";
      }
      
      // Limpiar todos los valores visuales
      resetDashboardValues();
      
      // Limpiar gráfico
      globalChart.data.labels = [];
      globalChart.data.datasets.forEach(ds => ds.data = []);
      globalChart.update();

      showToast("Modo Pruebas ACTIVADO: Simulación detenida", "info");
    } else {
      if(btn) {
          btn.textContent = "🛠️ Modo Pruebas";
          btn.style.backgroundColor = "#0d6efd";
      }
      showToast("Modo Pruebas DESACTIVADO: Simulación reiniciada", "success");
    }
  };

  function resetDashboardValues() {
    // Resetear Puntos 1-5
    for(let i=1; i<=5; i++) {
        updateElement(`p${i}_v_tot`, '--', 'V');
        updateElement(`p${i}_i_tot`, '--', 'A');
        updateElement(`p${i}_kw`, '--', 'kW');
        // Si no hay conexión MQTT real activa, apagar LED
        if (!pointConfigs[i] || !pointConfigs[i].client || !pointConfigs[i].client.connected) {
            const led = document.getElementById(`p${i}_status_led`);
            if(led) led.style.backgroundColor = '#ccc';
        }
    }
    // Resetear KPIs
    updateElement('kpi_total_power', '--', 'kW');
    updateElement('kpi_energy', '--', 'kWh');
    updateElement('kpi_pf', '--');
    
    // Resetear Luces Piloto (si no hay MQTT real)
    if (!pilotConfig || !pilotConfig.client || !pilotConfig.client.connected) {
        for(let j=1; j<=4; j++) {
            const lamp = document.getElementById(`lamp${j}`);
            if(lamp) lamp.className = 'pilot-light-large inactive';
        }
    }
  }

  // --- Configuración Individual de Puntos ---
  let currentConfigId = null;

  // Función auxiliar para guardar en LocalStorage
  const persistConfigs = () => {
    // Guardamos solo los datos, no el objeto cliente MQTT
    const toSave = pointConfigs.map(p => ({
      broker: p.broker,
      topic: p.topic,
      keys: p.keys
    }));
    localStorage.setItem('fazs_point_configs', JSON.stringify(toSave));
  };

  window.openConfigModal = (id) => {
    currentConfigId = id;
    document.getElementById('configPointId').textContent = id;
    document.getElementById('configModal').style.display = 'block';
    
    // Cargar configuración existente si hay
    if (pointConfigs[id]) {
        document.getElementById('pointBroker').value = pointConfigs[id].broker || '';
        document.getElementById('pointTopic').value = pointConfigs[id].topic || '';
        document.getElementById('keyVoltaje').value = pointConfigs[id].keys?.v || '';
        document.getElementById('keyCorriente').value = pointConfigs[id].keys?.i || '';
        document.getElementById('keyPotencia').value = pointConfigs[id].keys?.p || '';
        document.getElementById('keyVa').value = pointConfigs[id].keys?.va || '';
        document.getElementById('keyIa').value = pointConfigs[id].keys?.ia || '';
    } else {
        document.getElementById('pointBroker').value = '';
        document.getElementById('pointTopic').value = '';
        document.getElementById('keyVoltaje').value = '';
        document.getElementById('keyCorriente').value = '';
        document.getElementById('keyPotencia').value = '';
        document.getElementById('keyVa').value = '';
        document.getElementById('keyIa').value = '';
    }
    
    document.getElementById('jsonSamplePayload').value = '';
    document.getElementById('mappingResult').style.display = 'none';
    document.getElementById('mappingResult').innerHTML = '';
  };

  window.closeConfigModal = () => {
    document.getElementById('configModal').style.display = 'none';
  };

  window.savePointConfig = () => {
    const broker = document.getElementById('pointBroker').value;
    const topic = document.getElementById('pointTopic').value;
    
    const keyV = document.getElementById('keyVoltaje').value.trim();
    const keyI = document.getElementById('keyCorriente').value.trim();
    const keyP = document.getElementById('keyPotencia').value.trim();
    const keyVa = document.getElementById('keyVa').value.trim();
    const keyIa = document.getElementById('keyIa').value.trim();
    
    if (!broker || !topic) {
        showToast("Ingrese Broker y Topic", "error");
        return;
    }

    // Desconectar cliente anterior si existe
    if (pointConfigs[currentConfigId] && pointConfigs[currentConfigId].client) {
        pointConfigs[currentConfigId].client.end();
    }

    connectMqttForPoint(currentConfigId, broker, topic, { v: keyV, i: keyI, p: keyP, va: keyVa, ia: keyIa });
    closeConfigModal();
  };

  function connectMqttForPoint(id, broker, topic, keys) {
    const client = mqtt.connect(broker);
    
    client.on('connect', () => {
        showToast(`Punto ${id}: Conectado`, "success");
        client.subscribe(topic);
        document.getElementById(`p${id}_topic_display`).textContent = topic;
        document.getElementById(`p${id}_topic_display`).style.color = "#28a745";
        document.getElementById(`p${id}_status_led`).style.backgroundColor = "#28a745"; // LED Verde
    });

    client.on('message', (t, msg) => {
        // Asumimos que llega un JSON con { v_tot, i_tot, kw, ... } o similar
        // Para este ejemplo de prueba, intentaremos parsear lo que llegue
        try {
            const data = JSON.parse(msg.toString());
            
            // Usar las claves configuradas por el usuario
            if (keys.v && data[keys.v] !== undefined) updateElement(`p${id}_v_tot`, parseFloat(data[keys.v]).toFixed(1), 'V');
            if (keys.i && data[keys.i] !== undefined) updateElement(`p${id}_i_tot`, parseFloat(data[keys.i]).toFixed(1), 'A');
            if (keys.p && data[keys.p] !== undefined) updateElement(`p${id}_kw`, parseFloat(data[keys.p]).toFixed(1), 'kW');
            
            // Si llegan datos de fase, actualizarlos también (para el modal)
            // Ejemplo simple para Fase A (extensible a B y C)
            if (keys.va && data[keys.va] !== undefined) {
                const val = parseFloat(data[keys.va]).toFixed(1);
                // Actualizar en modal si está abierto
                if (selectedPointId === id) updateElement('modal_va', val);
                // Actualizar stats de sesión
                if (selectedPointId === id) {
                   // Lógica de min/max... (simplificada aquí para no duplicar código excesivo)
                }
            }
            if (keys.ia && data[keys.ia] !== undefined) {
                if (selectedPointId === id) updateElement('modal_ia', parseFloat(data[keys.ia]).toFixed(1));
            }
            
        } catch (e) {
            console.warn(`Error parseando datos punto ${id}`, e);
        }
    });

    client.on('error', () => {
       document.getElementById(`p${id}_status_led`).style.backgroundColor = "#dc3545"; // LED Rojo
    });

    pointConfigs[id] = { broker, topic, client, keys };
    persistConfigs(); // Guardar cambios
  }

  window.testJsonMapping = () => {
    const payloadStr = document.getElementById('jsonSamplePayload').value.trim();
    const keyV = document.getElementById('keyVoltaje').value.trim();
    const keyI = document.getElementById('keyCorriente').value.trim();
    const keyP = document.getElementById('keyPotencia').value.trim();
    const resultDiv = document.getElementById('mappingResult');

    if (!payloadStr) {
        showToast("Ingrese un JSON de ejemplo", "error");
        return;
    }

    try {
        const data = JSON.parse(payloadStr);
        let resultHtml = '<strong>Resultados de Extracción:</strong><br>';
        
        const getVal = (key, obj) => {
            if (!key) return '<span style="color:#999">No configurado</span>';
            if (obj[key] !== undefined) return `<span style="color:#28a745">${obj[key]}</span>`;
            return '<span style="color:#dc3545">No encontrado</span>';
        };

        resultHtml += `Voltaje [${keyV || '-'}]: <b>${getVal(keyV, data)}</b><br>`;
        resultHtml += `Corriente [${keyI || '-'}]: <b>${getVal(keyI, data)}</b><br>`;
        resultHtml += `Potencia [${keyP || '-'}]: <b>${getVal(keyP, data)}</b>`;

        resultDiv.innerHTML = resultHtml;
        resultDiv.style.display = 'block';
    } catch (e) {
        resultDiv.innerHTML = '<span style="color:#dc3545">Error: JSON inválido</span>';
        resultDiv.style.display = 'block';
    }
  };

  window.clearPointConfig = () => {
    if (pointConfigs[currentConfigId] && pointConfigs[currentConfigId].client) {
        pointConfigs[currentConfigId].client.end();
    }
    pointConfigs[currentConfigId] = null;
    
    document.getElementById(`p${currentConfigId}_topic_display`).textContent = "Simulación";
    document.getElementById(`p${currentConfigId}_topic_display`).style.color = "#888";
    document.getElementById(`p${currentConfigId}_status_led`).style.backgroundColor = "#ccc";
    
    showToast(`Punto ${currentConfigId}: Restaurado a Simulación`, "info");
    persistConfigs(); // Guardar que se borró
    closeConfigModal();
  };

  // Iniciar carga de configs
  setTimeout(loadSavedConfigs, 500);

  // --- Lógica Panel de Luces Piloto ---
  window.openPilotConfigModal = () => {
    document.getElementById('pilotConfigModal').style.display = 'block';
    if (pilotConfig) {
        document.getElementById('pilotBroker').value = pilotConfig.broker || '';
        document.getElementById('pilotTopic').value = pilotConfig.topic || '';
        document.getElementById('keyLamp1').value = pilotConfig.keys?.l1 || '';
        document.getElementById('keyLamp2').value = pilotConfig.keys?.l2 || '';
        document.getElementById('keyLamp3').value = pilotConfig.keys?.l3 || '';
        document.getElementById('keyLamp4').value = pilotConfig.keys?.l4 || '';
    }
  };

  window.closePilotConfigModal = () => {
    document.getElementById('pilotConfigModal').style.display = 'none';
  };

  window.savePilotConfig = () => {
    const broker = document.getElementById('pilotBroker').value;
    const topic = document.getElementById('pilotTopic').value;
    const k1 = document.getElementById('keyLamp1').value.trim();
    const k2 = document.getElementById('keyLamp2').value.trim();
    const k3 = document.getElementById('keyLamp3').value.trim();
    const k4 = document.getElementById('keyLamp4').value.trim();

    if (!broker || !topic) { showToast("Ingrese Broker y Topic", "error"); return; }

    if (pilotConfig && pilotConfig.client) pilotConfig.client.end();

    connectPilotMqtt(broker, topic, { l1: k1, l2: k2, l3: k3, l4: k4 });
    closePilotConfigModal();
  };

  function connectPilotMqtt(broker, topic, keys) {
    const client = mqtt.connect(broker);
    
    client.on('connect', () => {
        showToast("Panel Luces: Conectado", "success");
        client.subscribe(topic);
        document.getElementById('pilot_topic_display').textContent = topic;
        document.getElementById('pilot_topic_display').style.color = "#28a745";
    });

    client.on('message', (t, msg) => {
        try {
            const data = JSON.parse(msg.toString());
            const updateLamp = (id, key) => {
                if (key && data[key] !== undefined) {
                    const val = data[key];
                    const isActive = val == 1 || val === "true" || val === true;
                    document.getElementById(id).className = `pilot-light-large ${isActive ? 'active' : 'inactive'}`;
                }
            };
            updateLamp('lamp1', keys.l1);
            updateLamp('lamp2', keys.l2);
            updateLamp('lamp3', keys.l3);
            updateLamp('lamp4', keys.l4);
        } catch(e) { console.warn("Error parseando luces", e); }
    });

    pilotConfig = { broker, topic, client, keys };
    localStorage.setItem('fazs_pilot_config', JSON.stringify({ broker, topic, keys }));
  }

  window.clearPilotConfig = () => {
    if (pilotConfig && pilotConfig.client) pilotConfig.client.end();
    pilotConfig = null;
    localStorage.removeItem('fazs_pilot_config');
    
    document.getElementById('pilot_topic_display').textContent = "Simulación";
    document.getElementById('pilot_topic_display').style.color = "#888";
    // Resetear a inactivo
    for(let i=1; i<=4; i++) document.getElementById(`lamp${i}`).className = 'pilot-light-large inactive';
    
    showToast("Panel Luces: Restaurado a Simulación", "info");
    closePilotConfigModal();
  };

  // --- Lógica Configuración KPIs ---
  let currentKpiType = null;
  const kpiNames = { power: 'Potencia Total', energy: 'Energía Total', pf: 'Factor de Potencia' };

  window.openKpiConfigModal = (type) => {
    currentKpiType = type;
    document.getElementById('configKpiName').textContent = kpiNames[type];
    document.getElementById('kpiConfigModal').style.display = 'block';
    
    if (kpiConfigs[type]) {
        document.getElementById('kpiBroker').value = kpiConfigs[type].broker || '';
        document.getElementById('kpiTopic').value = kpiConfigs[type].topic || '';
        document.getElementById('kpiKey').value = kpiConfigs[type].key || '';
    } else {
        document.getElementById('kpiBroker').value = '';
        document.getElementById('kpiTopic').value = '';
        document.getElementById('kpiKey').value = '';
    }
  };

  window.closeKpiConfigModal = () => {
    document.getElementById('kpiConfigModal').style.display = 'none';
  };

  window.saveKpiConfig = () => {
    const broker = document.getElementById('kpiBroker').value;
    const topic = document.getElementById('kpiTopic').value;
    const key = document.getElementById('kpiKey').value.trim();

    if (!broker || !topic) { showToast("Ingrese Broker y Topic", "error"); return; }

    if (kpiConfigs[currentKpiType] && kpiConfigs[currentKpiType].client) {
        kpiConfigs[currentKpiType].client.end();
    }

    connectKpiMqtt(currentKpiType, broker, topic, key);
    closeKpiConfigModal();
  };

  function connectKpiMqtt(type, broker, topic, key) {
    const client = mqtt.connect(broker);
    const elementId = type === 'power' ? 'kpi_total_power' : (type === 'energy' ? 'kpi_energy' : 'kpi_pf');
    const displayId = type === 'power' ? 'kpi_power_topic_display' : (type === 'energy' ? 'kpi_energy_topic_display' : 'kpi_pf_topic_display');
    const unit = type === 'power' ? 'kW' : (type === 'energy' ? 'kWh' : '');

    client.on('connect', () => {
        showToast(`${kpiNames[type]}: Conectado`, "success");
        client.subscribe(topic);
        document.getElementById(displayId).textContent = topic;
        document.getElementById(displayId).style.color = "rgba(255,255,255,1)";
    });

    client.on('message', (t, msg) => {
        try {
            const data = JSON.parse(msg.toString());
            if (key && data[key] !== undefined) {
                updateElement(elementId, parseFloat(data[key]).toFixed(type === 'pf' ? 3 : 1), unit);
            }
        } catch(e) { console.warn(`Error KPI ${type}`, e); }
    });

    kpiConfigs[type] = { broker, topic, key, client };
    
    // Guardar persistencia
    const toSave = {};
    if (kpiConfigs.power) toSave.power = { broker: kpiConfigs.power.broker, topic: kpiConfigs.power.topic, key: kpiConfigs.power.key };
    if (kpiConfigs.energy) toSave.energy = { broker: kpiConfigs.energy.broker, topic: kpiConfigs.energy.topic, key: kpiConfigs.energy.key };
    if (kpiConfigs.pf) toSave.pf = { broker: kpiConfigs.pf.broker, topic: kpiConfigs.pf.topic, key: kpiConfigs.pf.key };
    localStorage.setItem('fazs_kpi_configs', JSON.stringify(toSave));
  }

  window.clearKpiConfig = () => {
    if (kpiConfigs[currentKpiType] && kpiConfigs[currentKpiType].client) {
        kpiConfigs[currentKpiType].client.end();
    }
    kpiConfigs[currentKpiType] = null;
    
    const displayId = currentKpiType === 'power' ? 'kpi_power_topic_display' : (currentKpiType === 'energy' ? 'kpi_energy_topic_display' : 'kpi_pf_topic_display');
    document.getElementById(displayId).textContent = "Simulación";
    document.getElementById(displayId).style.color = "rgba(255,255,255,0.7)";
    
    // Actualizar persistencia (borrando la key correspondiente)
    const saved = localStorage.getItem('fazs_kpi_configs');
    if (saved) {
        const parsed = JSON.parse(saved);
        delete parsed[currentKpiType];
        localStorage.setItem('fazs_kpi_configs', JSON.stringify(parsed));
    }

    showToast(`${kpiNames[currentKpiType]}: Restaurado a Simulación`, "info");
    closeKpiConfigModal();
  };
});