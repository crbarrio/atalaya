# frontend

Angular 22, standalone, signals throughout. Tailwind 4 configured from `src/styles.css` (no
`tailwind.config.js`). Conventions below are read off the code; where they differ from what
Angular tutorials do, the code wins.

## Layout

```
src/app/core/models/       one file per API shape, mirroring the backend's *View interfaces by hand
src/app/core/services/     one `providedIn: 'root'` service per API area, returning httpResource refs
src/app/core/http/         API_BASE = '/api' (relative: same origin in prod, proxied in dev)
src/app/features/<name>/   <name>.ts + <name>.html, one routed screen; nested folders for its pieces
src/app/layouts/app-layout/ shell, sidebar (nav list lives in sidebar.ts), topbar (search, register)
src/app/shared/ui/         reusable components: state-badge, meta-chip, usage-bar, history-chart, command-console…
src/app/shared/            helpers: resource-value, poll-resource, error-message, command-runner, console-output, pipes/
```

## How things are done here

- **Data is `httpResource()`**, created in a `core/services` method and handed to the component.
  A service holds a shared resource only when the data is global (`ServersService.list()`); a
  detail page gets its own via a method taking the route-param signal (`serverDetail(name)`).
- **Poll with `pollResource(resource)`** from `shared/poll-resource.ts` (30 s, the scrape
  interval). No ad hoc timers. Not everything polls: the catalogue does not.
- **Read a resource with `valueOr(resource, fallback)`** from `shared/resource-value.ts`, never
  `.value()` directly in a `computed` or a template. `.value()` on an errored resource throws
  and blanks the whole page; this has bitten twice.
- **Route params are `input.required<string>()`** (`withComponentInputBinding()` in
  `app.config.ts`), not `ActivatedRoute`. See `server-detail.ts`.
- **Templates use `@if` / `@for` / `@else`**, `track` on every loop, `@if (x(); as v)` to
  narrow. Component fields the template reads are `protected readonly`.
- **Loading and error are the resource's own states**: `resource.isLoading()`,
  `resource.error()`. A server SSH cannot reach is *data* (`health: 'unreachable'` in a 200) and
  is drawn by `StateBadge`, not treated as a request failure.
- **`unknown` reads as unknown**: grey, "no data". Never as an outage.
- **Every card says how old its data is** (`relativeTime` pipe).
- **Confirmation is inline, not a dialog**, and it names what is about to change (instance,
  server, and for `rollback` the version). Destructive actions add a type-the-name gate and, for
  data deletion, a separate acknowledgement (`instance-detail`'s danger zone).
- **Commands stream through `commandRunner()`** (`shared/command-runner.ts`), created in the
  component's injection context, one per page that wants its own console; rendered by
  `CommandConsole`.
- **Error text comes from `errorMessage(error)`** (`shared/error-message.ts`).
- **Mobile**: sidebar is a drawer below `lg` via `MobileNavService`; tables get a stacked-card
  twin (`md:hidden` / `hidden md:block`). Check new screens at 375 px wide.
- **Styling**: Tailwind utilities with the theme tokens from `styles.css` (`text-on-surface`,
  `bg-surface-container-low`, `font-jetbrains`, `rounded-xs`…). Icons are Material Symbols via
  a `material-symbols-outlined` span; keep the icon glyph and its circle as separate elements
  (`styles.css` forces `inline-block` on the glyph). No i18n.
- **Secrets never prefill.** An input for a variable value starts empty every time.
- Comments in components say why, and what a real test found.

## Recipe: a new screen

Taken from `features/apps/` (list screen, non-polled resource). Compare against it.

1. **`core/models/<area>.model.ts`**: interfaces mirroring the backend response. Comment the
   fields that carry a rule, as `catalogue.model.ts` does with `source`.
2. **`core/services/<area>.service.ts`**: `@Injectable({ providedIn: 'root' })` with a method
   returning `httpResource<T>(() => \`${API_BASE}/<path>\`)`; call `pollResource()` on it if
   the data changes on its own.
3. **`features/<name>/<name>.ts` + `.html`**: `@Component({ selector: 'app-<name>', imports:
   [...], templateUrl })`, `inject()` the service, `protected readonly resource = …`,
   `computed(() => valueOr(this.resource, undefined))` for the value, template branches on
   `isLoading()` / `error()` / data, with a sentence in the error branch that says what could
   not be reached.
4. **`app.routes.ts`**: a `loadComponent` child of `AppLayout` with a `title`.
5. **`layouts/app-layout/components/sidebar/sidebar.ts`**: an entry in `sections` if it is
   top-level navigation.
6. Check at 375 px and desktop, with the backend up, and with the data source it depends on
   down (Prometheus unreachable, a server off) — the page must degrade, not blank.

## Verifying

```bash
npm run build          # ng build: strict templates, this is the type check
```

There is no lint. `npm test` runs the two scaffold specs.
