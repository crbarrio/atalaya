import { Component, input } from '@angular/core';

@Component({
  selector: 'app-meta-chip',
  template: `
    @if (size() === 'tile') {
      <div class="flex items-center gap-3 rounded-xs border border-outline-variant bg-surface-container-low p-4">
        <span class="flex h-9 w-9 items-center justify-center rounded-full" [class]="toneClasses()">
          <span class="material-symbols-outlined text-base">{{ icon() }}</span>
        </span>
        <div class="flex flex-col">
          <span class="font-jetbrains text-on-surface text-lg leading-tight">{{ value() }}</span>
          <span class="text-on-surface-variant text-xs uppercase tracking-wide">{{ label() }}</span>
        </div>
      </div>
    } @else {
      <div class="flex items-center gap-2">
        <span class="material-symbols-outlined text-on-surface-variant text-base">{{ icon() }}</span>
        <div class="flex flex-col leading-tight">
          <span class="text-on-surface-variant text-[10px] uppercase tracking-wide">{{ label() }}</span>
          <span class="font-jetbrains text-on-surface text-xs">{{ value() }}</span>
        </div>
      </div>
    }
  `,
})
export class MetaChip {
  readonly icon = input.required<string>();
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly size = input<'tile' | 'chip'>('tile');
  readonly tone = input<'default' | 'success' | 'warning' | 'danger'>('default');

  protected toneClasses(): string {
    const map: Record<string, string> = {
      default: 'bg-surface-container-highest text-on-surface-variant',
      success: 'bg-secondary/15 text-secondary',
      warning: 'bg-tertiary/15 text-tertiary',
      danger: 'bg-error/15 text-error',
    };
    return map[this.tone()];
  }
}
