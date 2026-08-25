import { Component, computed, debounced, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MobileNavService } from '../../../../core/services/mobile-nav.service';
import { SessionService } from '../../../../core/services/session.service';
import { SearchService } from '../../../../core/services/search.service';
import { Dialog } from '@angular/cdk/dialog';
import { RegisterServer } from '../../../../features/register-server/register-server';

@Component({
  selector: 'app-topbar',
  templateUrl: './topbar.html',
})
export class Topbar {


    private readonly sessions = inject(SessionService);
    private readonly dialog = inject(Dialog);
    private readonly searchService = inject(SearchService);
    private readonly router = inject(Router);
    protected readonly mobileNav = inject(MobileNavService);

    readonly session = this.sessions.session;

    constructor() {
        this.sessions.load();
    }

    openFormModal() {
        const dialogRef = this.dialog.open(RegisterServer, {
            data: "Test Data",
        });

        dialogRef.componentInstance?.closed.subscribe(() => dialogRef.close());
    }

    protected readonly query = signal('');
    // 300ms: long enough that a normal typing cadence never fires a request
    // per keystroke, short enough that it still feels immediate.
    private readonly debouncedQuery = debounced(this.query, 300);
    protected readonly results = this.searchService.search(this.debouncedQuery.value);

    protected readonly dropdownOpen = signal(false);
    protected readonly hasResults = computed(
        () => this.results.value().servers.length > 0 || this.results.value().instances.length > 0,
    );

    protected onFocus(): void {
        this.dropdownOpen.set(true);
    }

    /** Delayed so a click on a result registers before the dropdown is torn down. */
    protected onBlur(): void {
        setTimeout(() => this.dropdownOpen.set(false), 150);
    }

    protected goToServer(name: string): void {
        this.closeAndClear();
        this.router.navigate(['/servers', name]);
    }

    protected goToInstance(server: string, instance: string): void {
        this.closeAndClear();
        this.router.navigate(['/servers', server, instance]);
    }

    private closeAndClear(): void {
        this.dropdownOpen.set(false);
        this.query.set('');
    }

}
