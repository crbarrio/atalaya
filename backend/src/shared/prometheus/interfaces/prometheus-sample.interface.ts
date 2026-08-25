/** One time series returned by an instant query, reduced to its label set and current value. */
export interface PrometheusSample {
  metric: Record<string, string>;
  value: number;
}

/** The shape of `/api/v1/query`'s body, only as much as is read. */
export interface PrometheusQueryResponse {
  status: 'success' | 'error';
  error?: string;
  data: {
    resultType: string;
    result: { metric: Record<string, string>; value: [number, string] }[];
  };
}

/** One time series returned by a range query — its label set and every (timestamp, value) pair over the window. */
export interface PrometheusRangeSeries {
  metric: Record<string, string>;
  values: [number, number][];
}

/** The shape of `/api/v1/query_range`'s body, only as much as is read. */
export interface PrometheusQueryRangeResponse {
  status: 'success' | 'error';
  error?: string;
  data: {
    resultType: string;
    result: { metric: Record<string, string>; values: [number, string][] }[];
  };
}

/** One entry from `/api/v1/alerts` — a currently active alert, pending or firing. */
export interface PrometheusAlert {
  labels: Record<string, string>;
  annotations: Record<string, string>;
  state: 'pending' | 'firing';
  activeAt: string;
}

/** The shape of `/api/v1/alerts`'s body, only as much as is read. */
export interface PrometheusAlertsResponse {
  status: 'success' | 'error';
  error?: string;
  data: { alerts: PrometheusAlert[] };
}
