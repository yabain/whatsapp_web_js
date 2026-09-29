import { Injectable } from '@nestjs/common';

interface Counter {
  label: string;
  count: number;
}

interface Histogram {
  label: string;
  sum: number;
  count: number;
  min: number;
  max: number;
}

@Injectable()
export class MetricsService {
  private counters: Map<string, number> = new Map();
  private histograms: Map<string, Histogram> = new Map();
  private startTime = Date.now();

  // --- Counters ---

  incrementCounter(label: string, delta = 1): void {
    const current = this.counters.get(label) ?? 0;
    this.counters.set(label, current + delta);
  }

  getCounter(label: string): number {
    return this.counters.get(label) ?? 0;
  }

  // --- Histograms ---

  observeHistogram(label: string, value: number): void {
    const existing = this.histograms.get(label);
    if (existing) {
      existing.count += 1;
      existing.sum += value;
      existing.min = Math.min(existing.min, value);
      existing.max = Math.max(existing.max, value);
    } else {
      this.histograms.set(label, {
        label,
        sum: value,
        count: 1,
        min: value,
        max: value,
      });
    }
  }

  // --- Snapshot ---

  snapshot() {
    const counters: Record<string, number> = {};
    for (const [key, value] of this.counters) {
      counters[key] = value;
    }

    const histograms: Record<string, { avg: number; min: number; max: number; count: number }> = {};
    for (const [key, h] of this.histograms) {
      histograms[key] = {
        avg: h.count > 0 ? Math.round((h.sum / h.count) * 100) / 100 : 0,
        min: h.min,
        max: h.max,
        count: h.count,
      };
    }

    return {
      uptimeSeconds: Math.round((Date.now() - this.startTime) / 1000),
      counters,
      histograms,
    };
  }

  // --- Text format for /metrics endpoint ---

  textFormat(): string {
    const snap = this.snapshot();
    const lines: string[] = [];

    // Uptime
    lines.push('# HELP app_uptime_seconds Application uptime in seconds');
    lines.push('# TYPE app_uptime_seconds gauge');
    lines.push(`app_uptime_seconds ${snap.uptimeSeconds}`);

    // Counters
    for (const [name, value] of Object.entries(snap.counters)) {
      const sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_');
      lines.push(`# HELP ${sanitized} Counter metric`);
      lines.push(`# TYPE ${sanitized} counter`);
      lines.push(`${sanitized} ${value}`);
    }

    // Histograms
    for (const [name, h] of Object.entries(snap.histograms)) {
      const sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_');
      lines.push(`# HELP ${sanitized} Histogram metric`);
      lines.push(`# TYPE ${sanitized} gauge`);
      lines.push(`${sanitized}_avg ${h.avg}`);
      lines.push(`${sanitized}_min ${h.min}`);
      lines.push(`${sanitized}_max ${h.max}`);
      lines.push(`${sanitized}_count ${h.count}`);
    }

    return lines.join('\n') + '\n';
  }
}