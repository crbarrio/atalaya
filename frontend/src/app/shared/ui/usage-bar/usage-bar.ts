import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-usage-bar',
  template: `
    <div class="flex flex-col gap-2 rounded-xs border border-outline-variant bg-surface-container-low p-4">
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-on-surface-variant text-base">{{ icon() }}</span>
          <span class="text-on-surface-variant text-xs uppercase tracking-wide">{{ label() }}</span>
        </div>
        <span class="font-jetbrains text-on-surface text-xs">{{ detail() }}</span>
      </div>
      <div class="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-highest">
        <div class="h-full rounded-full" [class]="barClasses()" [style.width.%]="clampedPercent()"></div>
      </div>
    </div>
  `,
})
export class UsageBar {
  readonly icon = input.required<string>();
  readonly label = input.required<string>();
  readonly detail = input.required<string>();
  readonly percent = input<number | null>(null);

  protected readonly clampedPercent = computed(() => Math.min(100, Math.max(0, this.percent() ?? 0)));

  protected barClasses(): string {
    const percent = this.percent();
    if (percent === null) return 'bg-surface-container-highest';
    if (percent >= 90) return 'bg-error';
    if (percent >= 75) return 'bg-tertiary';
    return 'bg-secondary';
  }
}
