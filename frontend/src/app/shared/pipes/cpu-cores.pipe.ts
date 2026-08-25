import { Pipe, PipeTransform } from '@angular/core';

/** 1.0 = one full core saturated over the window. Millicores below one core, same convention Kubernetes uses. */
@Pipe({ name: 'cpuCores' })
export class CpuCoresPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (value === null || value === undefined) return '—';

    const millicores = value * 1000;
    return millicores < 1000 ? `${millicores.toFixed(1)}m` : `${(millicores / 1000).toFixed(2)} cores`;
  }
}
