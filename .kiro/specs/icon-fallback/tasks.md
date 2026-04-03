# Tasks: Icon Fallback

## Task 1: Create utility functions

- [x] 1.1 Create `src/components/iconFallbackUtils.ts` with `getIconColor` and `getIconLetter` functions
  - Implement `ICON_COLORS` palette array (10 colors, all ≥ 4.5:1 contrast vs white)
  - Implement `getIconColor(text: string): string` — hash-based palette lookup
  - Implement `getIconLetter(title: string, alias: string): string` — first char uppercased, fallback to alias, then `"?"`
  - Export both functions

## Task 2: Create IconFallback component

- [x] 2.1 Create `src/components/IconFallback.tsx`
  - Define `IconFallbackProps` interface with `iconUrl`, `title`, `alias`, `size`
  - Implement component with `useState` for image error tracking
  - Render `<img>` with `onError` handler when `iconUrl` is truthy
  - Render generated icon `<div>` with inline styles when no valid image
  - Set `aria-hidden="true"` on the element, no `tabIndex`

## Task 3: Integrate into AliasCard

- [x] 3.1 Update `src/components/AliasCard.tsx` to use `IconFallback`
  - Import `IconFallback`
  - Replace the `<img>` + `<span>` placeholder + `onError` DOM manipulation with `<IconFallback iconUrl={record.icon_url} title={record.title} alias={record.alias} size={20} />`
  - Remove the hidden placeholder span logic

## Task 4: Integrate into PopularLinks

- [x] 4.1 Update `src/components/PopularLinks.tsx` to use `IconFallback`
  - Import `IconFallback`
  - Replace the conditional `<img>` / `<span>` placeholder with `<IconFallback iconUrl={link.icon_url} title={link.title} alias={link.alias} size={32} />`

## Task 5: Write unit tests

- [x] 5.1 Create `src/components/__tests__/IconFallback.test.tsx`
  - Test: renders `<img>` when `iconUrl` is provided
  - Test: renders letter div when `iconUrl` is null
  - Test: switches to letter div on image `onError`
  - Test: `getIconLetter` returns `"?"` for empty title and alias
  - Test: `getIconColor` returns valid hex string

## Task 6: Write property-based tests

- [x] 6.1 Create `src/components/__tests__/iconFallback.property.test.ts` with property tests
  - Property 1: Icon letter derivation — `getIconLetter` returns correct first char for random title/alias
  - Property 2: Icon color determinism — `getIconColor` returns same result on repeated calls
  - Property 3: WCAG AA contrast — all generated colors have ≥ 4.5:1 contrast ratio vs white
  - Property 4: Size prop dimensions — rendered element matches provided size
  - Property 5: Fallback rendering — no `<img>` when `iconUrl` is null/empty
  - Property 6: Accessibility — generated icon has `aria-hidden="true"` and no `tabIndex`
