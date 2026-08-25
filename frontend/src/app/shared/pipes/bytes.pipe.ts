import { Pipe, PipeTransform } from '@angular/core';

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

@Pipe({ name: 'bytes' })
export class BytesPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (value === null || value === undefined) return '—';
    if (value === 0) return '0 B';

    const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), UNITS.length - 1);
    const scaled = value / 1024 ** exponent;
    return `${scaled.toFixed(exponent === 0 || scaled >= 10 ? 0 : 1)} ${UNITS[exponent]}`;
  }
}
