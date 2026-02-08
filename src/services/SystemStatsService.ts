import si from 'systeminformation';

class SystemStatsService {
  /**
   * 정적 시스템 정보 조회 (OS, CPU, Memory Total 등)
   * 자주 변경되지 않는 정보
   */
  async getSystemSummary() {
    const [os, cpu, mem, time] = await Promise.all([
      si.osInfo(),
      si.cpu(),
      si.mem(),
      si.time(),
    ]);

    return {
      os: {
        platform: os.platform,
        distro: os.distro,
        release: os.release,
        hostname: os.hostname,
        arch: os.arch,
      },
      cpu: {
        manufacturer: cpu.manufacturer,
        brand: cpu.brand,
        cores: cpu.cores,
        speed: cpu.speed,
      },
      memory: {
        total: mem.total,
        swaptotal: mem.swaptotal,
      },
      time: {
        current: time.current,
        uptime: time.uptime,
        timezone: time.timezone,
      },
    };
  }

  /**
   * 동적 시스템 리소스 조회 (CPU Load, Memory Usage, Network 등)
   * 실시간성이 필요한 정보
   */
  async getSystemStats() {
    const [load, mem, network, processLoad] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.networkStats(),
      si.processLoad('node'), // Node.js 프로세스 정보 (선택사항, 필요 없으면 제거 가능)
    ]);

    // 네트워크 인터페이스 중 활성화된 것만 필터링하거나 첫 번째 것만 사용
    const mainNet = network.find((n) => n.operstate === 'up') || network[0];

    return {
      timestamp: Date.now(),
      cpuLoad: {
        currentLoad: load.currentLoad,
        currentLoadUser: load.currentLoadUser,
        currentLoadSystem: load.currentLoadSystem,
      },
      memory: {
        active: mem.active,
        total: mem.total,
        free: mem.free,
        usePercentage: (mem.active / mem.total) * 100,
      },
      network: {
        iface: mainNet?.iface,
        rx_sec: mainNet?.rx_sec,
        tx_sec: mainNet?.tx_sec,
      },
      // 현재 Node 프로세스 메모리 사용량 (process.memoryUsage() 사용)
      process: {
        memory: process.memoryUsage(),
        uptime: process.uptime(),
      },
    };
  }
}

export default new SystemStatsService();
