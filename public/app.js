// =========================================
// 시스템 리소스 모니터 - Frontend Application
// =========================================

// Socket.io 연결
const socket = io();

// 상태 변수
let isMonitoring = false;
let monitoringStartTime = null;
let monitoringTimer = null;
let collectedData = [];
let diskCharts = {};

// Chart 설정
const chartColors = {
    cpu: 'rgba(168, 85, 247, 1)',
    cpuBg: 'rgba(168, 85, 247, 0.2)',
    memory: 'rgba(16, 185, 129, 1)',
    memoryBg: 'rgba(16, 185, 129, 0.2)',
    gpu: 'rgba(245, 158, 11, 1)',
    gpuBg: 'rgba(245, 158, 11, 0.2)',
    download: 'rgba(52, 211, 153, 1)',
    downloadBg: 'rgba(52, 211, 153, 0.2)',
    upload: 'rgba(192, 132, 252, 1)',
    uploadBg: 'rgba(192, 132, 252, 0.2)',
    diskUsed: 'rgba(139, 92, 246, 1)',
    diskFree: 'rgba(30, 20, 50, 0.8)'
};

// 데이터 히스토리 (최근 60초)
const dataHistory = {
    labels: [],
    cpu: [],
    memory: [],
    gpu: [],
    download: [],
    upload: []
};
const MAX_DATA_POINTS = 60;

// Chart.js 기본 설정
Chart.defaults.color = '#c4b5fd';
Chart.defaults.borderColor = 'rgba(139, 92, 246, 0.1)';

// 메인 차트 초기화
let mainChart = null;
let networkChart = null;

function initCharts() {
    // 메인 차트 (CPU, Memory, GPU)
    const mainCtx = document.getElementById('main-chart').getContext('2d');
    mainChart = new Chart(mainCtx, {
        type: 'line',
        data: {
            labels: dataHistory.labels,
            datasets: [
                {
                    label: 'CPU',
                    data: dataHistory.cpu,
                    borderColor: chartColors.cpu,
                    backgroundColor: chartColors.cpuBg,
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 4
                },
                {
                    label: '메모리',
                    data: dataHistory.memory,
                    borderColor: chartColors.memory,
                    backgroundColor: chartColors.memoryBg,
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 4
                },
                {
                    label: 'GPU',
                    data: dataHistory.gpu,
                    borderColor: chartColors.gpu,
                    backgroundColor: chartColors.gpuBg,
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(10, 6, 18, 0.9)',
                    borderColor: 'rgba(139, 92, 246, 0.3)',
                    borderWidth: 1,
                    titleColor: '#f3e8ff',
                    bodyColor: '#c4b5fd',
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: function (context) {
                            return `${context.dataset.label}: ${context.parsed.y.toFixed(1)}%`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    grid: {
                        display: false
                    },
                    ticks: {
                        maxTicksLimit: 10,
                        font: {
                            size: 10
                        }
                    }
                },
                y: {
                    min: 0,
                    max: 100,
                    grid: {
                        color: 'rgba(139, 92, 246, 0.1)'
                    },
                    ticks: {
                        callback: value => value + '%',
                        font: {
                            size: 10
                        }
                    }
                }
            },
            animation: {
                duration: 300
            }
        }
    });

    // 네트워크 차트
    const networkCtx = document.getElementById('network-chart').getContext('2d');
    networkChart = new Chart(networkCtx, {
        type: 'line',
        data: {
            labels: dataHistory.labels,
            datasets: [
                {
                    label: '다운로드',
                    data: dataHistory.download,
                    borderColor: chartColors.download,
                    backgroundColor: chartColors.downloadBg,
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2,
                    pointRadius: 0
                },
                {
                    label: '업로드',
                    data: dataHistory.upload,
                    borderColor: chartColors.upload,
                    backgroundColor: chartColors.uploadBg,
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(10, 6, 18, 0.9)',
                    borderColor: 'rgba(139, 92, 246, 0.3)',
                    borderWidth: 1,
                    callbacks: {
                        label: function (context) {
                            return `${context.dataset.label}: ${formatBytes(context.parsed.y)}/s`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    grid: {
                        display: false
                    },
                    ticks: {
                        maxTicksLimit: 10,
                        font: {
                            size: 10
                        }
                    }
                },
                y: {
                    min: 0,
                    grid: {
                        color: 'rgba(139, 92, 246, 0.1)'
                    },
                    ticks: {
                        callback: value => formatBytes(value),
                        font: {
                            size: 10
                        }
                    }
                }
            },
            animation: {
                duration: 300
            }
        }
    });
}

// 유틸리티 함수
function formatBytes(bytes, decimals = 1) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

function formatTime(date) {
    return new Date(date).toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function getTemperatureClass(temp) {
    if (temp === null || temp === undefined) return '';
    if (temp >= 80) return 'danger';
    if (temp >= 60) return 'warning';
    return '';
}

function updateGauge(gaugeId, valueId, percentage) {
    const gaugeFill = document.getElementById(gaugeId);
    const gaugeValue = document.getElementById(valueId);

    if (gaugeFill && gaugeValue) {
        const deg = (percentage / 100) * 360;
        gaugeFill.style.background = `conic-gradient(
      rgba(168, 85, 247, 1) 0deg,
      rgba(192, 132, 252, 1) ${deg}deg,
      rgba(30, 20, 50, 0.5) ${deg}deg
    )`;
        gaugeValue.textContent = percentage !== null ? `${percentage.toFixed(1)}%` : 'N/A';
    }
}

// 시스템 정보 업데이트
function updateSystemInfo(data) {
    const now = new Date();
    const timeLabel = formatTime(now);

    // 데이터 히스토리 업데이트
    dataHistory.labels.push(timeLabel);
    dataHistory.cpu.push(data.cpu.usage || 0);
    dataHistory.memory.push(data.memory.usage || 0);
    dataHistory.gpu.push(data.gpu?.usage || 0);
    dataHistory.download.push(data.network.downloadSpeed || 0);
    dataHistory.upload.push(data.network.uploadSpeed || 0);

    // 최대 데이터 포인트 유지
    if (dataHistory.labels.length > MAX_DATA_POINTS) {
        dataHistory.labels.shift();
        dataHistory.cpu.shift();
        dataHistory.memory.shift();
        dataHistory.gpu.shift();
        dataHistory.download.shift();
        dataHistory.upload.shift();
    }

    // OS 정보
    if (data.os) {
        document.getElementById('os-info').textContent =
            `${data.os.distro} | ${data.os.hostname}`;
    }

    // CPU 업데이트
    updateGauge('cpu-gauge-fill', 'cpu-value', data.cpu.usage);
    document.getElementById('cpu-model').textContent =
        `${data.cpu.manufacturer} ${data.cpu.brand}`;
    document.getElementById('cpu-cores').textContent =
        `${data.cpu.physicalCores}C / ${data.cpu.cores}T`;

    const cpuTempEl = document.getElementById('cpu-temp');
    if (data.cpu.temperature !== null) {
        cpuTempEl.textContent = `${data.cpu.temperature.toFixed(0)}°C`;
        cpuTempEl.className = `temp-value ${getTemperatureClass(data.cpu.temperature)}`;
    } else {
        cpuTempEl.textContent = 'N/A';
    }

    // CPU 코어 로드
    const coreLoadsEl = document.getElementById('core-loads');
    if (data.cpu.coreLoads && data.cpu.coreLoads.length > 0) {
        coreLoadsEl.innerHTML = data.cpu.coreLoads.map((load, i) => `
      <div class="core-bar" title="Core ${i}: ${load.toFixed(1)}%">
        <div class="core-bar-fill" style="width: ${load}%"></div>
      </div>
    `).join('');
    }

    // 온도 표시 업데이트
    const cpuTempFill = document.getElementById('cpu-temp-fill');
    const cpuTempDisplay = document.getElementById('cpu-temp-display');
    if (data.cpu.temperature !== null) {
        const cpuTempPercent = Math.min(100, (data.cpu.temperature / 100) * 100);
        cpuTempFill.style.height = `${cpuTempPercent}%`;
        cpuTempDisplay.textContent = `${data.cpu.temperature.toFixed(0)}°C`;
    }

    // GPU 업데이트
    if (data.gpu) {
        const gpuUsage = data.gpu.usage || 0;
        updateGauge('gpu-gauge-fill', 'gpu-value', gpuUsage);
        document.getElementById('gpu-model').textContent = data.gpu.model || 'Unknown GPU';

        const gpuTempEl = document.getElementById('gpu-temp');
        if (data.gpu.temperature !== null) {
            gpuTempEl.textContent = `${data.gpu.temperature.toFixed(0)}°C`;
            gpuTempEl.className = `temp-value ${getTemperatureClass(data.gpu.temperature)}`;

            const gpuTempFill = document.getElementById('gpu-temp-fill');
            const gpuTempDisplay = document.getElementById('gpu-temp-display');
            const gpuTempPercent = Math.min(100, (data.gpu.temperature / 100) * 100);
            gpuTempFill.style.height = `${gpuTempPercent}%`;
            gpuTempDisplay.textContent = `${data.gpu.temperature.toFixed(0)}°C`;
        } else {
            gpuTempEl.textContent = 'N/A';
        }

        document.getElementById('gpu-vram').textContent =
            data.gpu.vram ? `${data.gpu.vram} MB` : 'N/A';
    } else {
        document.getElementById('gpu-value').textContent = 'N/A';
        document.getElementById('gpu-model').textContent = 'GPU 감지되지 않음';
    }

    // 메모리 업데이트
    const memUsage = data.memory.usage;
    const memBarFill = document.getElementById('memory-bar-fill');
    memBarFill.style.width = `${memUsage}%`;

    document.getElementById('memory-used').textContent = formatBytes(data.memory.used);
    document.getElementById('memory-total').textContent = `/ ${formatBytes(data.memory.total)}`;
    document.getElementById('memory-percent').textContent = `${memUsage.toFixed(1)}%`;
    document.getElementById('memory-free').textContent = formatBytes(data.memory.free);
    document.getElementById('memory-active').textContent = formatBytes(data.memory.active);

    // 디스크 업데이트
    updateDiskCharts(data.disk);

    // 네트워크 업데이트
    document.getElementById('download-speed').textContent =
        `${formatBytes(data.network.downloadSpeed)}/s`;
    document.getElementById('upload-speed').textContent =
        `${formatBytes(data.network.uploadSpeed)}/s`;

    // 차트 업데이트
    if (mainChart) {
        mainChart.data.labels = dataHistory.labels;
        mainChart.data.datasets[0].data = dataHistory.cpu;
        mainChart.data.datasets[1].data = dataHistory.memory;
        mainChart.data.datasets[2].data = dataHistory.gpu;
        mainChart.update('none');
    }

    if (networkChart) {
        networkChart.data.labels = dataHistory.labels;
        networkChart.data.datasets[0].data = dataHistory.download;
        networkChart.data.datasets[1].data = dataHistory.upload;
        networkChart.update('none');
    }

    // 마지막 업데이트 시간
    document.getElementById('last-update').textContent = timeLabel;

    // 모니터링 데이터 수집
    if (isMonitoring) {
        collectedData.push(data);
        document.getElementById('data-points').textContent = `${collectedData.length} 포인트`;
    }
}

// 디스크 차트 업데이트
function updateDiskCharts(disks) {
    const container = document.getElementById('disk-charts');

    // 유효한 디스크만 필터링
    const validDisks = disks.filter(d => d.size > 0);

    validDisks.forEach((disk, index) => {
        const diskId = `disk-chart-${index}`;
        let diskItem = document.getElementById(`disk-item-${index}`);

        if (!diskItem) {
            // 새 디스크 아이템 생성
            diskItem = document.createElement('div');
            diskItem.className = 'disk-item';
            diskItem.id = `disk-item-${index}`;
            diskItem.innerHTML = `
        <div class="disk-chart-container">
          <canvas id="${diskId}"></canvas>
          <div class="disk-chart-label">
            <div class="disk-percent" id="disk-percent-${index}">0%</div>
            <div class="disk-mount" id="disk-mount-${index}">${disk.mount}</div>
          </div>
        </div>
        <div class="disk-info">
          <div class="disk-size" id="disk-size-${index}">
            ${formatBytes(disk.used)} / ${formatBytes(disk.size)}
          </div>
        </div>
      `;
            container.appendChild(diskItem);

            // 도넛 차트 생성
            const ctx = document.getElementById(diskId).getContext('2d');
            diskCharts[diskId] = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    datasets: [{
                        data: [disk.usage, 100 - disk.usage],
                        backgroundColor: [chartColors.diskUsed, chartColors.diskFree],
                        borderWidth: 0,
                        cutout: '75%'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { display: false },
                        tooltip: { enabled: false }
                    },
                    animation: {
                        duration: 500
                    }
                }
            });
        } else {
            // 기존 차트 업데이트
            document.getElementById(`disk-percent-${index}`).textContent = `${disk.usage.toFixed(0)}%`;
            document.getElementById(`disk-size-${index}`).textContent =
                `${formatBytes(disk.used)} / ${formatBytes(disk.size)}`;

            if (diskCharts[diskId]) {
                diskCharts[diskId].data.datasets[0].data = [disk.usage, 100 - disk.usage];
                diskCharts[diskId].update('none');
            }
        }
    });
}

// 5분 모니터링 시작
function startMonitoring() {
    isMonitoring = true;
    monitoringStartTime = Date.now();
    collectedData = [];

    const btn = document.getElementById('start-monitoring');
    btn.innerHTML = '<span class="btn-icon">⏹️</span><span>모니터링 중지</span>';
    btn.classList.add('monitoring');

    document.getElementById('timer-container').classList.add('active');
    document.getElementById('monitoring-status').style.display = 'flex';
    document.getElementById('generate-pdf').disabled = true;

    // 타이머 업데이트
    updateTimer();
    monitoringTimer = setInterval(updateTimer, 1000);

    socket.emit('startMonitoring');
}

// 모니터링 중지
function stopMonitoring() {
    isMonitoring = false;
    clearInterval(monitoringTimer);

    const btn = document.getElementById('start-monitoring');
    btn.innerHTML = '<span class="btn-icon">▶️</span><span>5분 모니터링</span>';
    btn.classList.remove('monitoring');

    document.getElementById('timer-container').classList.remove('active');
    document.getElementById('monitoring-status').style.display = 'none';
    document.getElementById('generate-pdf').disabled = false;

    socket.emit('stopMonitoring');
}

// 타이머 업데이트
function updateTimer() {
    const elapsed = (Date.now() - monitoringStartTime) / 1000;
    const remaining = Math.max(0, 300 - elapsed);

    const minutes = Math.floor(remaining / 60);
    const seconds = Math.floor(remaining % 60);

    document.getElementById('timer-text').textContent =
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    // 타이머 진행 원형
    const progress = ((300 - remaining) / 300) * 100;
    document.getElementById('timer-progress').style.strokeDasharray = `${progress}, 100`;

    // 5분 완료
    if (remaining <= 0) {
        stopMonitoring();
    }
}

// PDF 생성
async function generatePDF() {
    if (collectedData.length === 0) {
        alert('모니터링 데이터가 없습니다. 먼저 5분 모니터링을 실행해주세요.');
        return;
    }

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');

    // 통계 계산
    const stats = calculateStats(collectedData);

    // PDF 스타일
    const primaryColor = [124, 58, 237]; // #7c3aed
    const textColor = [30, 30, 30];
    const mutedColor = [100, 100, 100];

    // 헤더
    pdf.setFillColor(...primaryColor);
    pdf.rect(0, 0, 210, 35, 'F');

    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(22);
    pdf.text('시스템 리소스 모니터링 리포트', 105, 18, { align: 'center' });

    pdf.setFontSize(10);
    const startDate = new Date(collectedData[0].timestamp).toLocaleString('ko-KR');
    const endDate = new Date(collectedData[collectedData.length - 1].timestamp).toLocaleString('ko-KR');
    pdf.text(`${startDate} ~ ${endDate}`, 105, 28, { align: 'center' });

    // 요약 섹션
    pdf.setTextColor(...textColor);
    pdf.setFontSize(14);
    pdf.text('📊 요약 통계', 15, 50);

    pdf.setDrawColor(...primaryColor);
    pdf.setLineWidth(0.5);
    pdf.line(15, 53, 195, 53);

    // 통계 카드 그리기
    const cardY = 60;
    const cardWidth = 55;
    const cardHeight = 35;
    const gap = 5;

    const summaryCards = [
        { title: 'CPU 평균', value: `${stats.cpu.avg.toFixed(1)}%`, sub: `최대: ${stats.cpu.max.toFixed(1)}%` },
        { title: '메모리 평균', value: `${stats.memory.avg.toFixed(1)}%`, sub: `최대: ${stats.memory.max.toFixed(1)}%` },
        { title: '데이터 포인트', value: `${collectedData.length}`, sub: `5분간 수집` }
    ];

    summaryCards.forEach((card, i) => {
        const x = 15 + (cardWidth + gap) * i;

        // 카드 배경
        pdf.setFillColor(245, 243, 255);
        pdf.roundedRect(x, cardY, cardWidth, cardHeight, 3, 3, 'F');

        // 왼쪽 보더
        pdf.setFillColor(...primaryColor);
        pdf.rect(x, cardY, 2, cardHeight, 'F');

        // 텍스트
        pdf.setFontSize(9);
        pdf.setTextColor(...primaryColor);
        pdf.text(card.title, x + 6, cardY + 10);

        pdf.setFontSize(18);
        pdf.setTextColor(...textColor);
        pdf.text(card.value, x + 6, cardY + 23);

        pdf.setFontSize(8);
        pdf.setTextColor(...mutedColor);
        pdf.text(card.sub, x + 6, cardY + 30);
    });

    // 상세 통계 테이블
    pdf.setTextColor(...textColor);
    pdf.setFontSize(14);
    pdf.text('📈 상세 통계', 15, 110);

    pdf.setDrawColor(...primaryColor);
    pdf.line(15, 113, 195, 113);

    // 테이블 헤더
    const tableY = 120;
    pdf.setFillColor(...primaryColor);
    pdf.rect(15, tableY, 180, 8, 'F');

    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(9);
    pdf.text('항목', 20, tableY + 5.5);
    pdf.text('평균', 70, tableY + 5.5);
    pdf.text('최소', 105, tableY + 5.5);
    pdf.text('최대', 140, tableY + 5.5);
    pdf.text('단위', 175, tableY + 5.5);

    // 테이블 데이터
    const tableData = [
        { name: 'CPU 사용률', avg: stats.cpu.avg.toFixed(1), min: stats.cpu.min.toFixed(1), max: stats.cpu.max.toFixed(1), unit: '%' },
        { name: '메모리 사용률', avg: stats.memory.avg.toFixed(1), min: stats.memory.min.toFixed(1), max: stats.memory.max.toFixed(1), unit: '%' },
        { name: 'GPU 사용률', avg: stats.gpu.avg.toFixed(1), min: stats.gpu.min.toFixed(1), max: stats.gpu.max.toFixed(1), unit: '%' },
        { name: 'CPU 온도', avg: stats.cpuTemp.avg.toFixed(1), min: stats.cpuTemp.min.toFixed(1), max: stats.cpuTemp.max.toFixed(1), unit: '°C' },
        { name: '다운로드 속도', avg: formatBytes(stats.download.avg), min: formatBytes(stats.download.min), max: formatBytes(stats.download.max), unit: '/s' },
        { name: '업로드 속도', avg: formatBytes(stats.upload.avg), min: formatBytes(stats.upload.min), max: formatBytes(stats.upload.max), unit: '/s' }
    ];

    pdf.setTextColor(...textColor);
    tableData.forEach((row, i) => {
        const y = tableY + 8 + (i + 1) * 8;

        if (i % 2 === 0) {
            pdf.setFillColor(250, 250, 255);
            pdf.rect(15, y - 5.5, 180, 8, 'F');
        }

        pdf.text(row.name, 20, y);
        pdf.text(row.avg, 70, y);
        pdf.text(row.min, 105, y);
        pdf.text(row.max, 140, y);
        pdf.text(row.unit, 175, y);
    });

    // 차트 캡처 및 추가
    pdf.addPage();

    pdf.setFillColor(...primaryColor);
    pdf.rect(0, 0, 210, 20, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(16);
    pdf.text('📊 실시간 모니터링 그래프', 105, 13, { align: 'center' });

    // 메인 차트 캡처
    try {
        const mainChartCanvas = document.getElementById('main-chart');
        const mainChartImage = mainChartCanvas.toDataURL('image/png');
        pdf.addImage(mainChartImage, 'PNG', 15, 30, 180, 80);

        pdf.setTextColor(...textColor);
        pdf.setFontSize(10);
        pdf.text('CPU / 메모리 / GPU 사용률 변화', 105, 115, { align: 'center' });

        // 네트워크 차트 캡처
        const networkChartCanvas = document.getElementById('network-chart');
        const networkChartImage = networkChartCanvas.toDataURL('image/png');
        pdf.addImage(networkChartImage, 'PNG', 15, 130, 180, 60);

        pdf.text('네트워크 다운로드 / 업로드 속도', 105, 195, { align: 'center' });
    } catch (e) {
        console.error('차트 캡처 오류:', e);
    }

    // 푸터
    pdf.setFontSize(8);
    pdf.setTextColor(...mutedColor);
    pdf.text(`생성 시간: ${new Date().toLocaleString('ko-KR')}`, 105, 280, { align: 'center' });
    pdf.text('System Resource Monitor - Purple Theme', 105, 285, { align: 'center' });

    // PDF 저장
    const fileName = `시스템모니터링_${new Date().toISOString().slice(0, 10)}.pdf`;
    pdf.save(fileName);
}

// 통계 계산
function calculateStats(data) {
    const getStats = (values) => {
        const filtered = values.filter(v => v !== null && v !== undefined && !isNaN(v));
        if (filtered.length === 0) return { avg: 0, min: 0, max: 0 };
        return {
            avg: filtered.reduce((a, b) => a + b, 0) / filtered.length,
            min: Math.min(...filtered),
            max: Math.max(...filtered)
        };
    };

    return {
        cpu: getStats(data.map(d => d.cpu.usage)),
        memory: getStats(data.map(d => d.memory.usage)),
        gpu: getStats(data.map(d => d.gpu?.usage || 0)),
        cpuTemp: getStats(data.map(d => d.cpu.temperature).filter(t => t !== null)),
        gpuTemp: getStats(data.map(d => d.gpu?.temperature).filter(t => t !== null)),
        download: getStats(data.map(d => d.network.downloadSpeed)),
        upload: getStats(data.map(d => d.network.uploadSpeed))
    };
}

// Socket 이벤트 핸들러
socket.on('connect', () => {
    console.log('Connected to server');
    document.getElementById('connection-status').classList.add('connected');
    document.getElementById('connection-text').textContent = '연결됨';
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    document.getElementById('connection-status').classList.remove('connected');
    document.getElementById('connection-text').textContent = '연결 끊김';
});

socket.on('systemInfo', (data) => {
    updateSystemInfo(data);
});

socket.on('monitoringComplete', (data) => {
    console.log('Monitoring complete:', data);
    collectedData = data.data;
    stopMonitoring();
    alert('5분 모니터링이 완료되었습니다! PDF 저장 버튼을 클릭하여 리포트를 생성하세요.');
});

// 이벤트 리스너
document.addEventListener('DOMContentLoaded', () => {
    initCharts();

    // 5분 모니터링 버튼
    document.getElementById('start-monitoring').addEventListener('click', () => {
        if (isMonitoring) {
            stopMonitoring();
        } else {
            startMonitoring();
        }
    });

    // PDF 생성 버튼
    document.getElementById('generate-pdf').addEventListener('click', generatePDF);
});
