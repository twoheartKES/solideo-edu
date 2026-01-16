const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const si = require('systeminformation');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store monitoring session data
let monitoringData = [];
let isMonitoring = false;
let monitoringStartTime = null;

// Get system information
async function getSystemInfo() {
  try {
    const [cpu, cpuTemp, mem, disk, networkStats, graphics, osInfo, currentLoad] = await Promise.all([
      si.cpu(),
      si.cpuTemperature(),
      si.mem(),
      si.fsSize(),
      si.networkStats(),
      si.graphics(),
      si.osInfo(),
      si.currentLoad()
    ]);

    // Calculate network speeds
    const totalRx = networkStats.reduce((acc, net) => acc + (net.rx_sec || 0), 0);
    const totalTx = networkStats.reduce((acc, net) => acc + (net.tx_sec || 0), 0);

    // Get GPU info
    const gpuInfo = graphics.controllers && graphics.controllers.length > 0 
      ? graphics.controllers[0] 
      : null;

    const systemInfo = {
      timestamp: new Date().toISOString(),
      cpu: {
        manufacturer: cpu.manufacturer,
        brand: cpu.brand,
        cores: cpu.cores,
        physicalCores: cpu.physicalCores,
        speed: cpu.speed,
        usage: currentLoad.currentLoad || 0,
        coreLoads: currentLoad.cpus ? currentLoad.cpus.map(c => c.load) : [],
        temperature: cpuTemp.main || null
      },
      gpu: gpuInfo ? {
        vendor: gpuInfo.vendor,
        model: gpuInfo.model,
        vram: gpuInfo.vram,
        temperature: gpuInfo.temperatureGpu || null,
        usage: gpuInfo.utilizationGpu || null,
        memoryUsed: gpuInfo.memoryUsed || null,
        memoryTotal: gpuInfo.memoryTotal || null
      } : null,
      memory: {
        total: mem.total,
        used: mem.used,
        free: mem.free,
        usage: (mem.used / mem.total) * 100,
        active: mem.active,
        available: mem.available
      },
      disk: disk.map(d => ({
        fs: d.fs,
        type: d.type,
        size: d.size,
        used: d.used,
        available: d.available,
        usage: d.use,
        mount: d.mount
      })),
      network: {
        downloadSpeed: totalRx,
        uploadSpeed: totalTx,
        interfaces: networkStats.map(net => ({
          interface: net.iface,
          rx_sec: net.rx_sec || 0,
          tx_sec: net.tx_sec || 0,
          rx_bytes: net.rx_bytes,
          tx_bytes: net.tx_bytes
        }))
      },
      os: {
        platform: osInfo.platform,
        distro: osInfo.distro,
        hostname: osInfo.hostname
      }
    };

    return systemInfo;
  } catch (error) {
    console.error('Error getting system info:', error);
    return null;
  }
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Send initial system info
  getSystemInfo().then(info => {
    if (info) {
      socket.emit('systemInfo', info);
    }
  });

  // Handle start monitoring request
  socket.on('startMonitoring', () => {
    if (!isMonitoring) {
      isMonitoring = true;
      monitoringData = [];
      monitoringStartTime = Date.now();
      console.log('Monitoring started');
      io.emit('monitoringStarted', { startTime: monitoringStartTime });
    }
  });

  // Handle stop monitoring request
  socket.on('stopMonitoring', () => {
    if (isMonitoring) {
      isMonitoring = false;
      console.log('Monitoring stopped. Data points collected:', monitoringData.length);
      socket.emit('monitoringData', {
        data: monitoringData,
        startTime: monitoringStartTime,
        endTime: Date.now(),
        dataPoints: monitoringData.length
      });
    }
  });

  // Handle get monitoring data request
  socket.on('getMonitoringData', () => {
    socket.emit('monitoringData', {
      data: monitoringData,
      startTime: monitoringStartTime,
      endTime: Date.now(),
      dataPoints: monitoringData.length,
      isMonitoring: isMonitoring
    });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Broadcast system info every second
setInterval(async () => {
  const info = await getSystemInfo();
  if (info) {
    io.emit('systemInfo', info);
    
    // If monitoring is active, store the data
    if (isMonitoring) {
      monitoringData.push(info);
      
      // Check if 5 minutes (300 seconds) have passed
      const elapsedTime = (Date.now() - monitoringStartTime) / 1000;
      if (elapsedTime >= 300) {
        isMonitoring = false;
        console.log('5-minute monitoring complete. Data points:', monitoringData.length);
        io.emit('monitoringComplete', {
          data: monitoringData,
          startTime: monitoringStartTime,
          endTime: Date.now(),
          dataPoints: monitoringData.length
        });
      }
    }
  }
}, 1000);

// API endpoint to get current monitoring data
app.get('/api/monitoring-data', (req, res) => {
  res.json({
    data: monitoringData,
    startTime: monitoringStartTime,
    endTime: isMonitoring ? null : Date.now(),
    dataPoints: monitoringData.length,
    isMonitoring: isMonitoring
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║     🖥️  시스템 리소스 모니터링 서버 시작                    ║
║     📡 Server running on http://localhost:${PORT}             ║
║     🔌 WebSocket enabled for real-time updates             ║
╚════════════════════════════════════════════════════════════╝
  `);
});
