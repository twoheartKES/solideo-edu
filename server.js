require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const si = require('systeminformation');
const cors = require('cors');
const path = require('path');

// Constants
const PORT = process.env.PORT || 3000;
const MONITORING_DURATION_SECONDS = parseInt(process.env.MONITORING_DURATION_SECONDS) || 300;
const UPDATE_INTERVAL_MS = parseInt(process.env.UPDATE_INTERVAL_MS) || 1000;
const MAX_DATA_POINTS = parseInt(process.env.MAX_DATA_POINTS) || 300;
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000'];

const app = express();
const server = http.createServer(app);

// CORS 설정 강화
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Middleware
app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 세션별 모니터링 데이터 저장소
const monitoringSessions = new Map();

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
    console.error('Error getting system info:', error.message);
    // 에러 정보를 포함한 객체 반환
    return {
      error: true,
      message: 'Failed to fetch system information',
      timestamp: new Date().toISOString()
    };
  }
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // 클라이언트별 세션 초기화
  monitoringSessions.set(socket.id, {
    isMonitoring: false,
    data: [],
    startTime: null
  });

  // Send initial system info
  getSystemInfo().then(info => {
    if (info && !info.error) {
      socket.emit('systemInfo', info);
    } else if (info && info.error) {
      socket.emit('systemError', { message: info.message });
    }
  }).catch(err => {
    console.error('Failed to get initial system info:', err);
    socket.emit('systemError', { message: 'Failed to initialize system monitoring' });
  });

  // Handle start monitoring request
  socket.on('startMonitoring', () => {
    const session = monitoringSessions.get(socket.id);
    if (session && !session.isMonitoring) {
      session.isMonitoring = true;
      session.data = [];
      session.startTime = Date.now();
      console.log(`Monitoring started for client: ${socket.id}`);
      socket.emit('monitoringStarted', { startTime: session.startTime });
    }
  });

  // Handle stop monitoring request
  socket.on('stopMonitoring', () => {
    const session = monitoringSessions.get(socket.id);
    if (session && session.isMonitoring) {
      session.isMonitoring = false;
      console.log(`Monitoring stopped for client: ${socket.id}. Data points: ${session.data.length}`);
      socket.emit('monitoringData', {
        data: session.data,
        startTime: session.startTime,
        endTime: Date.now(),
        dataPoints: session.data.length
      });
    }
  });

  // Handle get monitoring data request
  socket.on('getMonitoringData', () => {
    const session = monitoringSessions.get(socket.id);
    if (session) {
      socket.emit('monitoringData', {
        data: session.data,
        startTime: session.startTime,
        endTime: Date.now(),
        dataPoints: session.data.length,
        isMonitoring: session.isMonitoring
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    // 세션 데이터 정리
    monitoringSessions.delete(socket.id);
  });
});

// Broadcast system info every second
setInterval(async () => {
  const info = await getSystemInfo();

  if (info && !info.error) {
    io.emit('systemInfo', info);

    // 각 클라이언트 세션별로 모니터링 데이터 저장
    monitoringSessions.forEach((session, socketId) => {
      if (session.isMonitoring) {
        // 메모리 누수 방지: 최대 데이터 포인트 제한
        if (session.data.length >= MAX_DATA_POINTS) {
          session.data.shift(); // 가장 오래된 데이터 제거
        }
        session.data.push(info);

        // 모니터링 시간 체크
        const elapsedTime = (Date.now() - session.startTime) / 1000;
        if (elapsedTime >= MONITORING_DURATION_SECONDS) {
          session.isMonitoring = false;
          console.log(`Monitoring complete for client: ${socketId}. Data points: ${session.data.length}`);

          const socket = io.sockets.sockets.get(socketId);
          if (socket) {
            socket.emit('monitoringComplete', {
              data: session.data,
              startTime: session.startTime,
              endTime: Date.now(),
              dataPoints: session.data.length
            });
          }
        }
      }
    });
  } else if (info && info.error) {
    io.emit('systemError', { message: info.message });
  }
}, UPDATE_INTERVAL_MS);

// API endpoint to get health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    activeSessions: monitoringSessions.size
  });
});

// API endpoint to get system info
app.get('/api/system-info', async (req, res) => {
  try {
    const info = await getSystemInfo();
    if (info && !info.error) {
      res.json(info);
    } else {
      res.status(500).json({
        error: 'Failed to retrieve system information',
        message: info ? info.message : 'Unknown error'
      });
    }
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
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
