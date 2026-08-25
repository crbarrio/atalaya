import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-state-badge',
  template: `
    <span
      class="inline-flex items-center gap-1.5 rounded-xs px-2 py-1 font-jetbrains text-xs uppercase tracking-wide"
      [class]="style().classes"
    >
      <span class="h-1.5 w-1.5 rounded-full" [class]="style().dot"></span>
      {{ style().label }}
    </span>
  `,
})
export class StateBadge {
  readonly state = input.required<string | null>();

  protected readonly style = computed(() => STYLES[this.state() ?? 'unknown'] ?? STYLES['unknown']);
}

interface StateStyle {
  label: string;
  classes: string;
  dot: string;
}

const STYLES: Record<string, StateStyle> = {
  running: { label: 'Running', classes: 'bg-secondary/10 text-secondary', dot: 'bg-secondary' },
  stopped: { label: 'Stopped', classes: 'bg-error/10 text-error', dot: 'bg-error' },
  'not deployed': {
    label: 'Not deployed',
    classes: 'bg-surface-container-highest text-on-surface-variant',
    dot: 'bg-outline',
  },
  disabled: {
    label: 'Disabled',
    classes: 'bg-surface-container-highest text-on-surface-variant',
    dot: 'bg-outline',
  },
  'disabled (still running)': {
    label: 'Disabled, still running',
    classes: 'bg-tertiary/10 text-tertiary',
    dot: 'bg-tertiary',
  },
  mixed: { label: 'Mixed', classes: 'bg-tertiary/10 text-tertiary', dot: 'bg-tertiary' },
  unknown: {
    label: 'Unknown',
    classes: 'bg-surface-container-highest text-on-surface-variant',
    dot: 'bg-outline',
  },

  ok: { label: 'OK', classes: 'bg-secondary/10 text-secondary', dot: 'bg-secondary' },
  stale: { label: 'Stale', classes: 'bg-tertiary/10 text-tertiary', dot: 'bg-tertiary' },
  unreachable: { label: 'Unreachable', classes: 'bg-error/10 text-error', dot: 'bg-error' },
  'never read': {
    label: 'Never read',
    classes: 'bg-surface-container-highest text-on-surface-variant',
    dot: 'bg-outline',
  },
};
