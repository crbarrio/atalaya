import { Injectable } from '@nestjs/common';

import {
  PrometheusAlert,
  PrometheusAlertsResponse,
  PrometheusQueryRangeResponse,
  PrometheusQueryResponse,
  PrometheusRangeSeries,
  PrometheusSample,
} from './interfaces/prometheus-sample.interface';

const DEFAULT_TIMEOUT_MS = 10_000;

/** Thin client for Prometheus's HTTP API. Knows nothing of servers or instances. */
@Injectable()
export class PrometheusService {
  private readonly baseUrl = process.env.PROMETHEUS_URL ?? 'http://127.0.0.1:9090';

  async query(promql: string): Promise<PrometheusSample[]> {
    const body = await this.get<PrometheusQueryResponse>(
      `/api/v1/query?query=${encodeURIComponent(promql)}`,
    );
    return body.data.result.map((r) => ({ metric: r.metric, value: Number(r.value[1]) }));
  }

  /**
   * `startSec`/`endSec` are Unix seconds, `stepSec` the resolution — the
   * caller picks it so a 24h window and a 30d window do not both come back
   * as the same number of points.
   */
  async queryRange(promql: string, startSec: number, endSec: number, stepSec: number): Promise<PrometheusRangeSeries[]> {
    const params = new URLSearchParams({
      query: promql,
      start: String(startSec),
      end: String(endSec),
      step: String(stepSec),
    });
    const body = await this.get<PrometheusQueryRangeResponse>(`/api/v1/query_range?${params}`);
    return body.data.result.map((r) => ({
      metric: r.metric,
      values: r.values.map(([t, v]) => [t, Number(v)] as [number, number]),
    }));
  }

  /** Every alert Prometheus is currently evaluating as true — pending and firing, with annotations. */
  async alerts(): Promise<PrometheusAlert[]> {
    const body = await this.get<PrometheusAlertsResponse>('/api/v1/alerts');
    return body.data.alerts;
  }

  private async get<T extends { status: 'success' | 'error'; error?: string }>(path: string): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, { signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Prometheus at ${this.baseUrl} did not answer: ${message}`);
    }
    if (!response.ok) {
      throw new Error(`Prometheus returned HTTP ${response.status}`);
    }

    const body = (await response.json()) as T;
    if (body.status !== 'success') {
      throw new Error(`Prometheus request failed: ${body.error ?? 'unknown error'}`);
    }
    return body;
  }
}
