import { Component, ElementRef, effect, input, output, signal, viewChild } from '@angular/core';

import { ConsoleLine, RunState } from '../../../core/models/action.model';

/**
 * Output of a running command. Follows the tail while the operator is at the
 * bottom, and stops following the moment they scroll up — a console that yanks
 * you back to the end while you are reading is worse than no console.
 */
@Component({
  selector: 'app-command-console',
  template: `
    <div class="flex flex-col gap-2 rounded-xs border border-outline-variant bg-surface-container-low p-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="font-jetbrains text-on-surface-variant text-xs uppercase tracking-wide">
          {{ title() }}
        </span>

        <div class="flex items-center gap-3">
          @if (state() === 'running') {
            <span class="font-jetbrains text-[11px] text-tertiary">running…</span>
            <button
              type="button"
              (click)="stop.emit()"
              class="rounded-xs border border-outline-variant px-2 py-1 font-jetbrains text-[11px] uppercase text-on-surface hover:bg-surface-container-highest"
            >
              Stop
            </button>
          } @else if (state() === 'done') {
            <span class="font-jetbrains text-[11px] text-secondary">finished · exit 0</span>
          } @else if (state() === 'failed') {
            <span class="font-jetbrains text-[11px] text-error">
              {{ exitCode() !== null ? 'exit ' + exitCode() : 'failed' }}
            </span>
          }
          @if (state() !== 'running' && lines().length > 0) {
            <button
              type="button"
              (click)="clear.emit()"
              class="rounded-xs border border-outline-variant px-2 py-1 font-jetbrains text-[11px] uppercase text-on-surface hover:bg-surface-container-highest"
            >
              Clear
            </button>
          }
        </div>
      </div>

      @if (error()) {
        <p class="text-error text-xs">{{ error() }}</p>
      }

      <div
        #pane
        (scroll)="onScroll()"
        class="h-72 overflow-auto rounded-xs bg-surface-container-lowest p-3 font-jetbrains text-[11px] leading-relaxed"
      >
        @for (line of lines(); track $index) {
          <div
            class="whitespace-pre-wrap break-all"
            [class]="line.stream === 'stderr' ? 'text-error' : 'text-on-surface-variant'"
          >{{ line.text }}</div>
        } @empty {
          <span class="text-on-surface-variant opacity-60">No output yet.</span>
        }
      </div>

      @if (!following()) {
        <button
          type="button"
          (click)="resumeFollow()"
          class="self-start font-jetbrains text-[11px] text-primary hover:underline"
        >
          ↓ Jump to the end
        </button>
      }
    </div>
  `,
})
export class CommandConsole {
  readonly title = input.required<string>();
  readonly lines = input.required<ConsoleLine[]>();
  readonly state = input.required<RunState>();
  readonly exitCode = input<number | null>(null);
  readonly error = input<string | null>(null);

  readonly stop = output<void>();
  readonly clear = output<void>();

  private readonly pane = viewChild.required<ElementRef<HTMLDivElement>>('pane');

  /** Whether new output scrolls into view. False once the operator scrolls up. */
  protected readonly following = signal(true);

  constructor() {
    // Reading `lines()` is what subscribes this effect to new output.
    effect(() => {
      this.lines();
      if (!this.following()) return;
      // After the new lines render, or it scrolls to where the content ended.
      queueMicrotask(() => this.toBottom());
    });
  }

  protected onScroll(): void {
    const element = this.pane().nativeElement;
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 24;
    this.following.set(atBottom);
  }

  protected resumeFollow(): void {
    this.following.set(true);
    this.toBottom();
  }

  private toBottom(): void {
    const element = this.pane().nativeElement;
    element.scrollTop = element.scrollHeight;
  }
}
