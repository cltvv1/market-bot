# FE-1A Design foundation

Draft, not approved. Shared tokens live in
`client-ui/src/reference/foundation.css`; the admin reference imports that file.
It is a stylesheet, not a new app/package/framework. All rules are scoped to
`.ui-reference-root` or its specific admin/client descendant. Existing CSS is
not edited. No new dependency, font, component framework or store.

## Semantic palette

| Token | Value | Purpose |
| --- | --- | --- |
| `--ui-text` | `#171615` | Body, headings, primary buttons |
| `--ui-text-muted` | `#625d58` | Secondary text |
| `--ui-accent` | `#80766d` | Restrained navigation/section emphasis |
| `--ui-accent-strong` | `#5f5650` | Links, active emphasis |
| `--ui-canvas` | `#f5f4f2` | Quiet loading surface |
| `--ui-surface` | `#ffffff` | Dominant page surface |
| `--ui-surface-subtle` | `#faf9f7` | Sidebar and documents |
| `--ui-border` | `#dfdcd7` | Decorative dividers |
| `--ui-border-strong` | `#c7c2bb` | Disabled/document hierarchy |
| `--ui-control-border` | `#827b73` | Interactive boundaries, >=3:1 against white |
| `--ui-warning-text/surface` | `#805514` / `#fff7e8` | Waiting/review with written status |
| `--ui-danger-text/surface` | `#93413d` / `#fff1ef` | Cancelled/urgent with text/icon |
| `--ui-info-text/surface` | `#4d5963` / `#f0f3f5` | Informational notices |
| `--ui-focus` | `#6f6259` | 2px visible keyboard outline |

White dominates; warm neutrals are accents, not a beige canvas everywhere.
No gradients, glass, neon, dark theme, decorative illustrations or bright blue.
No new green values or green-named variables. Completion uses Check + text +
neutral surface. Warning/danger/info each include text, never color alone.
The client uses the existing local VITMA logo, not remote/stock photographs.

## Type and density

System stack: Segoe UI Variable Text, Segoe UI, Arial, sans-serif.
No font downloads. Letter spacing zero. No viewport-scaled font sizes.

- Admin body 14px/1.5; secondary labels 12px; headings 28/18/14px.
- Client body 16px/1.5; intro 40px desktop, 30px mobile; sections 22px.
- Mobile admin heading 24px; long names wrap, no forced single-line titles.
- Controls >=40px, key client commands >=46px; mobile tabs >=44px.
- Spacing tokens: 4, 8, 12, 16, 24, 32px. Client uses wider section spacing.
- Radius 6px for buttons/documents, 4px for status/navigation. No pill UI.
- No floating page sections or nested cards. Separate documents are bounded
  objects; the existing-request box is an actual navigation tool. Other sections
  use dividers, typography, list rows and whitespace.
- No decorative shadows. Active navigation uses a narrow inset accent line.

## Interaction contract

Primary button: graphite/white; secondary: white/graphite with visible boundary.
Icon actions use lucide-react, accessible names and native title tooltips.
Unknown/disabled operations explain why; no fake success. Focus never depends
on hover. Error states contain plain language and retry, not raw server messages.
Session expiry links to existing login; permission denial never fetches the
restricted queue. Loading preserves shell and uses quiet nonanimated placeholders.
Empty unfiltered and empty filtered results have different explanations.

Detail tab roles, IDs, controls and selected state are explicit; arrow/Home/End
keyboard navigation uses a roving tab stop. Payment files are adjacent to the
disabled confirmation, not mixed into the conversation or visit controls.
Generic messages are not misrepresented as linked payment proofs.

Desktop sidebar is 248px. Below 1024px it becomes a native modal dialog with
Escape, focus restoration, backdrop and background scroll lock. Below 768px
queue rows become one-column objects, details stack, public navigation becomes
a disclosure, and fields become one column. Pagination remains operable.
The public menu is not a modal and does not trap focus.

## Accessibility policy

Body text target >=4.5:1, large text/interactive boundaries >=3:1.
Decorative separators are not sole interactive boundaries and need not use
the darker control-border token. Disabled actions are also explained in readable
text. Focus outline is visible on white/subtle surfaces. Status icons have
adjacent text; decorative SVGs are hidden from assistive technology when useful.
Semantic landmarks, skip link, labeled fields and active navigation are present.
No essential animation. Reduced-motion disables smooth scrolling for reference.

## Legacy green inventory (unchanged here)

| Existing source | Remaining green / conflict | Removal stage |
| --- | --- | --- |
| `client-ui/src/styles.css` first :root | `--green: #18785d`, dark/soft variants | FE-1C and later migrated public screens |
| Same file, Visual system refresh | Another green root (`#087a5b`) and derived surfaces | Replace migrated CSS, do not append another override |
| Same file, Monochrome warm-neutral palette | Brown values still misleadingly called `--green*` | Semantic tokens replace aliases during migration |
| Client legacy component selectors | Hardcoded green success/accent/hover variants remain beyond variable overrides | Screen-by-screen replacement with browser regression |
| `admin-ui/src/styles.css` | Teal accent/success-related styles and existing badges/buttons | FE-1B service shell; later domain slices |
| Existing JSX/icons and static assets | Current UI can still render old success colors; no mass edits | Verify each production slice including states |

This inventory is not a claim that the whole product has become green-free.
Only the new isolated reference layer follows that rule in FE-1A.
