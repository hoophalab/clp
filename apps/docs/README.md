# Documentation

Run commands from `apps/docs` with pnpm and uv installed.

## Build and preview

| Command | Mode | Output |
| --- | --- | --- |
| `pnpm exec turbo run build --filter=.` | Public | `build/public/html/` |
| `pnpm exec turbo run build:internal --filter=.` | Internal | `build/internal/html/` |
| `pnpm run dev` | Public preview | `build/public/html/` |
| `pnpm run dev:internal` | Internal preview | `build/internal/html/` |

<!-- markdownlint-disable-next-line MD052 -->
> [!WARNING]
> Publish only `build/public/html/` after a successful build. Internal output includes developer
> documentation and must not be deployed publicly.

Both build commands run an uncached cleanup of their own output before building or restoring a cached build. Preview commands also clean their own output before starting.

## Source layout

Both modes share `src/conf.py`. Public builds read `src/user/`; internal builds read all of `src/`.

* Add user pages and assets to `src/user/`, and list pages in its `index.md` toctree.
* Add developer pages and assets to `src/developer/`, and list pages in the `src/index.md`
  toctree alongside the user guide.

Do not include or link to developer files from user pages.

## Cleanup

| Command | Contents cleared |
| --- | --- |
| `pnpm run clean:public` | `build/public/` |
| `pnpm run clean:internal` | `build/internal/` |
| `pnpm run clean` | `build/`, including both modes and the typecheck cache |
