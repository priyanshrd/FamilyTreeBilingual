# Family Tree — Architecture

Status: **Phases 0–4 implemented, Phase 5 basic** (scaffold, database, domain core, login, people & relationships, tree view). See §0 for decisions made after review.

---

## 0. Decisions after review

| Topic | Decision |
|---|---|
| Relationship keys | The canonical key is the **kinship path** (`M.B` = mother's brother). Each path also gets a readable **English identifier** (`maternal_uncle`). Both are **calculated** by the relationship engine when the relationship finder runs. Derived relationships are never stored. |
| Login | **No per-person user accounts or user screens.** The family shares **one Supabase Auth account**. The login screen asks only for a **password**; the account email is fixed in config (`VITE_FAMILY_LOGIN_EMAIL`). Public sign-up is disabled. Membership-based RLS stays in place, so any other account sees nothing, and per-person accounts can be added later without schema changes. |
| "Who changed this?" | Because everyone shares one account, each device can set an optional editor name. It is sent as the `x-editor-name` header and recorded in `audit_log.actor_label`. |
| "How am I related to X?" | "Me" is chosen **per browser** (stored in localStorage), not tied to an account or IP (households share an IP and mobile IPs change). With "me" set, every box shows its relationship to me ("father", "आत्या"). The finder can always take any two people. |
| Undo | Each change the app saves runs as one **operation**: every request carries the same `x-operation-id` header, which the audit trigger records in `audit_log.op_id`. `undo_operation(op)` reverses exactly those audited rows (newest first, one transaction) and refuses if anything touched the same rows later. The browser keeps the last 20 operation ids of the tab in sessionStorage. |
| Profile photos | Resized in the browser (≤1024px photo + 192px square thumbnail, WebP) and uploaded to the private `family-media` bucket under `{family}/people/{person}/`; a `media` row plus a `media_links` row with role `profile`. Shown through short-lived signed URLs. Removing a photo keeps the file, so it can be undone. |
| Marathi (and English) relationship terms | An **editable dictionary inside the site**. Built-in defaults ship in code, and per-family overrides and additions live in `kinship_terms`. Lookup order: family override → built-in default → composed description. |
| One tree | The shared login has **one family tree**. After login the app opens straight into it (the family row is created silently on first use). The schema still supports several families. |
| Hosting | **Vercel** (static Vite build, SPA rewrites in `vercel.json`, env vars set in the Vercel dashboard). Language-provider calls go through Supabase Edge Functions so API keys never reach the browser. |
| Supabase project | `hbpguqvcyebidnvjvxzy`. Migrations are written and tested locally. Applying them to the hosted project needs network access and credentials (see README). |

---

## 1. Repository inspection

| Item | Finding |
|---|---|
| Repo state | Empty. No commits, no files, no remote branches. Greenfield. |
| Stack / framework | None yet. |
| Package manager | None chosen. Container has Node 22, npm 10, pnpm 10. |
| Supabase | No project config, no migrations, no CLI installed. Docker + Postgres 16 available, so a local Supabase stack (`supabase start`) is feasible for migration/RLS testing. |
| Auth | Does not exist. |
| UI conventions | None — we set them. |

**Conflicts with the spec:** none from existing code. Small deviations I recommend:

1. **Storage file naming** — spec shows `people/{person_id}/profile.jpg`. I propose `people/{person_id}/{media_id}.{ext}` with the "profile" role stored in the DB. Fixed names cause CDN/browser cache staleness on replace, lose history, and race on concurrent uploads.
2. **Step-parents** are *derived* by default (spouse of a parent who is not themselves a parent), not stored as edges. An explicit `step` lineage exists only for asserted step-parenthood where the linking marriage is unknown. Otherwise we would store the same fact twice.
3. **Canonical relationship keys** are *kinship paths* (e.g. `M.B` = mother's brother), not English labels like `maternal_uncle`. Marathi makes distinctions English collapses (काका vs मामा, आत्या vs मावशी, elder vs younger), so English must be one renderer of the path, not the key.

---

## 2. Stack decisions

| Concern | Choice | Why / tradeoff |
|---|---|---|
| Build | **Vite + React + TypeScript** | All data is private and behind auth; no SSR/SEO benefit from Next.js. Supabase is the backend, so a static SPA keeps hosting trivial. |
| Package manager | **pnpm** | Fast, strict. |
| Styling | Tailwind CSS v4 | Per spec. |
| Routing | react-router | Standard, small. |
| Server state | TanStack Query | Caching, invalidation, optimistic updates; pairs with Realtime later. |
| Graph view | `@xyflow/react` (React Flow v12) | Per spec. |
| Layout (MVP) | `@dagrejs/dagre` on a **union graph**, behind a `LayoutEngine` interface | Small, layered (generation-aware). Spouse adjacency fixed up post-layout. Replaceable by a custom family layout / ELK in a later phase without touching callers. |
| Validation | zod | Form + RPC payload validation, shared types. |
| Tests | Vitest for domain logic (`pnpm test`) and for schema/RLS against a disposable local Postgres (`pnpm test:db`) | Relationship engine is pure TS → fast unit tests. Supabase Docker images are unavailable in the dev environment, so DB tests use plain Postgres + a small Supabase shim. |
| UI strings i18n | Small typed dictionary (`en.ts`, `mr.ts`) + `Intl.PluralRules` | Avoids an i18n framework until needed. |
| Backend | Supabase: Postgres, Auth, Storage, RLS, Edge Functions (translation), Realtime (later) | Per spec. No other DB. |

---

## 3. Database schema

Conventions:
- All PKs `uuid default gen_random_uuid()`.
- Every family-owned table has `family_id` and **composite FKs `(family_id, x_id) → persons(family_id, id)`**, so a relationship can never span two families, even if application code is wrong.
- Mutable tables have `created_at, created_by, updated_at, updated_by` (set by trigger from `auth.uid()`) and `deleted_at, deleted_by` (soft delete).
- Uniqueness constraints are **partial indexes `where deleted_at is null`**.

### 3.1 Enums

```sql
create type family_role      as enum ('owner','editor','viewer');
create type gender           as enum ('male','female','other','unknown');
create type text_source      as enum ('manual','auto','corrected');   -- §5/§20 of spec
create type date_qualifier   as enum ('exact','about','before','after','between','estimated','unknown');
create type date_precision   as enum ('day','month','year');
create type lineage          as enum ('biological','adoptive','step','foster','guardian','unknown');
create type union_type       as enum ('marriage','partnership','unknown');
create type union_status     as enum ('ongoing','divorced','separated','widowed','annulled','unknown');
create type name_type        as enum ('primary','birth','married','alias','nickname');
create type fact_type        as enum ('birth','death','burial','occupation','residence','education','religion','custom');
create type union_fact_type  as enum ('engagement','marriage','divorce','separation','custom');
create type media_kind       as enum ('photo','document');
```

Enums can be extended with `alter type ... add value` (e.g. `foster` relationships, more fact types).

### 3.2 Fuzzy dates (column group, reused)

Genealogy dates are not `date`. Every dated record carries this group (prefix varies, e.g. `date_`, `end_date_`):

| Column | Type | Meaning |
|---|---|---|
| `date_qualifier` | `date_qualifier` | exact / about / before / after / between / estimated / unknown |
| `date_from` | `date` null | anchor date. Year-only `1958` → `1958-01-01` with precision `year` |
| `date_from_precision` | `date_precision` null | day / month / year |
| `date_to` | `date` null | upper bound, only for `between` |
| `date_to_precision` | `date_precision` null | |
| `date_text` | `text` null | original user phrasing ("around Diwali 1958") |
| `date_sort` | `date` generated | for ordering/age estimates |

CHECK constraints: `unknown ⇒ date_from is null`; `between ⇒ date_to is not null and date_from <= date_to`; `not between ⇒ date_to is null`; `date_from is not null ⇒ precision is not null`.
Future: `date_calendar` (e.g. Shaka / tithi) can be added without migrating existing data.

The TS side has `domain/dates` with parse/format/compare and tests (`"c. 1958"`, `"before 1920"`, `"1950–1955"`, `"Mar 1958"`).

### 3.3 Localized text (non-name fields)

Prose fields that need English/Marathi (notes, occupation title, place, union notes, media captions) use a **`jsonb` localized value**:

```json
{
  "en": { "v": "Engineer", "src": "manual" },
  "mr": { "v": "अभियंता", "src": "auto", "from": "en", "provider": "claude", "at": "2026-10-02T10:00:00Z", "src_hash": "a1b2…" }
}
```

- A CHECK function `is_localized_text(jsonb)` validates shape: language keys are in `languages`, `src` is a `text_source` value.
- `src_hash` = hash of the source text at generation time. The UI can show "English changed since Marathi was generated — regenerate?" **without** overwriting.
- **Overwrite rule (enforced in the language service *and* a DB trigger):** an `auto` write may only replace a target value whose `src` is `auto` (or which is empty). `manual`/`corrected` values are never replaced by auto output.
- Editing an auto value by hand flips it to `corrected`.

Why `jsonb` here and a table for names: these fields are display-only, never joined or searched heavily, and there are many of them. Names need multiple forms, search, and duplicate detection, so they get proper tables.

### 3.4 Tables

#### `languages` (reference data)
| column | type | notes |
|---|---|---|
| code | text PK | `en`, `mr` (BCP-47) |
| name / native_name | text | `Marathi` / `मराठी` |
| script | text | ISO 15924: `Latn`, `Deva` |
| enabled | bool | add `hi`, `gu`, `kn`… later with no schema change |

(The proposed `profiles` table was dropped: with one shared login there is no per-user profile. The editor name lives on the device.)

#### `families`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| name | jsonb localized | "Dhotar family" / "धोतर कुटुंब" |
| description | jsonb localized null | |
| default_language | text → languages | |
| root_person_id | uuid null | default focus person |
| created_* / updated_* / deleted_* | | |

#### `family_members`
| column | type | notes |
|---|---|---|
| family_id | uuid → families | PK part |
| user_id | uuid → auth.users | PK part |
| role | family_role | the shared login is `owner` of the families it creates |
| created_at, created_by | | |

Trigger: a family must always keep ≥1 owner. There is no membership UI and no API write access; rows are created by `create_family()`. `family_invitations (id, family_id, email, role, token_hash, expires_at, accepted_at)` is added in the collaboration phase; the table shape already supports it.

#### `persons`
| column | type | notes |
|---|---|---|
| id | uuid PK | stable identity; one row per human |
| family_id | uuid → families | unique `(family_id, id)` for composite FKs |
| gender | gender | default `unknown` |
| is_living | bool null | null = unknown; used for privacy later |
| is_placeholder | bool default false | "Unknown parent" stand-in (see §4.6); excluded from search/duplicates |
| notes | jsonb localized null | |
| privacy | text default `'family'` | reserved for future public sharing; living people never auto-public |
| created_* / updated_* / deleted_* | | |

Birth, death, birthplace, occupation and residence are **facts**, not columns (§3.4 `person_facts`). The profile photo is a `media_links` row with `role = 'profile'` (at most one per person).

#### `person_names` + `person_name_forms`
A person can have several names (birth name, married name; common for Marathi women who historically took a new given name and surname at marriage). Each name has one *form* per language.

`person_names`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| family_id, person_id | uuid | composite FK |
| name_type | name_type | |
| is_primary | bool | partial unique: one primary per person |
| sort_order | int | |
| deleted_at | | |

`person_name_forms`
| column | type | notes |
|---|---|---|
| name_id | uuid → person_names | PK part |
| lang | text → languages | PK part |
| given_name | text null | `Rajiv` / `राजीव` |
| middle_name | text null | Marathi convention: father's/husband's given name |
| surname | text null | `Dhotar` / `धोतर` |
| full_name | text | display string; editable to override composition |
| source | text_source | manual / auto / corrected |
| generated_from | text null | source lang for auto |
| provider | text null | |
| source_hash | text null | staleness detection |
| search_key | text | normalized lowercase, diacritics/nukta stripped; trigger-maintained |

Indexes: `gin (search_key gin_trgm_ops)` (pg_trgm) for fuzzy search and duplicate detection; `(family_id)`.

#### `unions` (family unit / partnership)
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| family_id | uuid | |
| union_type | union_type | |
| status | union_status | |
| sort_order | int | ordering of a person's multiple unions (1st marriage, 2nd…) |
| notes | jsonb localized null | |
| created_* / updated_* / deleted_* | | |

#### `union_partners`
| column | type | notes |
|---|---|---|
| union_id | uuid → unions | PK part |
| person_id | uuid | PK part; composite FK |
| family_id | uuid | |
| partner_order | smallint | position in drawing (left/right) |

Triggers: **≤ 2 partners per union**; no person partnered with themselves (implied by PK); no two live unions with the same partner pair (remarriage of the same couple → union facts, not a second union).

#### `parent_child` (authoritative parentage)
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| family_id | uuid | |
| parent_id | uuid | composite FK |
| child_id | uuid | composite FK |
| lineage | lineage | biological / adoptive / step / foster / guardian / unknown |
| union_id | uuid null → unions | which family unit this child is drawn under; trigger: `parent_id` must be a partner of `union_id` |
| child_order | smallint null | birth order among siblings, for elder/younger terms (दादा/ताई) when dates are unknown |
| date_* (fuzzy) | | adoption/guardianship start |
| deleted_* | | |

Constraints:
- `check (parent_id <> child_id)`
- partial unique `(parent_id, child_id) where deleted_at is null`, so there are no duplicate relationships
- trigger: **≤ 2 live `biological` parents per child**
- trigger: **no ancestor cycles**. A recursive CTE rejects `parent_id` if it is already a descendant of `child_id`.

Indexes: `(family_id, child_id)`, `(family_id, parent_id)`, `(union_id)`.

#### `person_facts` (birth, death, occupation, residence, … — time-bounded, multi-valued)
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| family_id, person_id | uuid | composite FK |
| fact_type | fact_type | |
| value | jsonb localized null | occupation title, cause of death, custom label |
| place | jsonb localized null | `{"en":"Pune","mr":"पुणे"}` (a normalized `places` table can come later) |
| date_* | fuzzy | start/point date |
| end_date_* | fuzzy | for occupation/residence ranges |
| notes | jsonb localized null | |
| sort_order | int | |
| deleted_* | | |

Partial unique: one live `birth` and one live `death` per person. Sources attach to facts later (`Person → Fact → Source`).

#### `union_facts`
Same shape as `person_facts`, but with `union_id` and `union_fact_type` (marriage date/place, divorce date…).

#### `media` + `media_links`
`media`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| family_id | uuid | |
| kind | media_kind | |
| storage_path, thumb_path | text | must start with `{family_id}/` (CHECK), e.g. `{family_id}/people/{person_id}/{media_id}.jpg` |
| mime_type, size_bytes, width, height | | validated: jpeg/png/webp/pdf, ≤ 15 MB |
| title, description | jsonb localized null | |
| date_* | fuzzy | when taken |
| uploaded_by, created_at, deleted_* | | |

`media_links (media_id, family_id, person_id null, union_id null, role text ('profile','tagged','attachment'), crop jsonb)` with exactly one target non-null (CHECK), and at most one `profile` link per person.

#### `audit_log` (append-only, from day one)
| column | type | notes |
|---|---|---|
| id | bigint identity | |
| family_id | uuid | |
| table_name, row_key, action | | `row_key` is the primary key as jsonb; action is `insert/update/delete/soft_delete/restore` |
| actor_id | uuid | `auth.uid()` |
| actor_label | text null | device editor name from the `x-editor-name` header |
| at | timestamptz | |
| old_values, new_values | jsonb | changed columns only |

A generic `AFTER` trigger on all family tables populates it. Members can select; **no one** can insert, update or delete through the API. This trigger is cheap to add now; adding it later would mean losing the history of everything entered in between. The history UI comes post-MVP.

#### `kinship_terms` (editable relationship dictionary)
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| family_id | uuid | |
| term_key | text | kinship path, e.g. `M.B`, `F.eB`, `Sp.F` |
| lang | text → languages | `mr`, `en`, … |
| label | text | e.g. `मामा` |
| notes | text null | e.g. regional usage |
| created_* / updated_* / deleted_* | | partial unique `(family_id, term_key, lang)` among live rows |

Defaults live in code. "Reset to default" soft-deletes the override.

#### Future (shape reserved, not built in MVP)
- `sources (id, family_id, source_type, title jsonb, citation, media_id)`, `citations (source_id, fact_id | union_fact_id | person_name_id, page, note)`
- `places (id, family_id, name jsonb, parent_place_id, lat, lng)` if place normalization is wanted
- `family_invitations`

### 3.5 Server-side operations (Postgres RPCs, `security invoker` so RLS applies)

Multi-row writes are atomic RPCs, never several client round-trips:

| RPC | Does |
|---|---|
| `create_family(name jsonb, default_language)` | inserts family + owner membership (the only `security definer` write; bootstraps membership) |
| `create_person(family_id, person jsonb)` | a person with no relationships yet (e.g. the first person) |
| `add_relative(anchor_id, relation, person jsonb, options jsonb)` | creates person + names + facts + correct union/parent_child rows in one transaction |
| `connect_existing(anchor_id, other_id, relation, options)` | same relationship logic, no new person |
| `person_delete_impact(person_id)` | counts parents/spouses/children/media for the confirmation dialog |
| `soft_delete_person(person_id)` / `restore_person(person_id)` | sets `deleted_at` on the person only; edges remain and are hidden because an endpoint is deleted, so restore is lossless |

Relations understood by `add_relative` / `connect_existing` ("other is anchor's …"): `parent`, `adoptive_parent`, `child`, `spouse`, `sibling`, `step_parent`. Options: `lineage`, `union_id`, `other_parent_id`, `apply_to_siblings`, `parent_ids` (half-siblings), `via_parent_id` (step-parent), `children_lineage`, `union_type`, `status`. The auto/manual overwrite rule (I9) is enforced by triggers, so it holds for direct table writes too.

### 3.6 RLS strategy

Helper functions (`security definer`, `stable`, `set search_path = ''`, wrapped as `(select auth.uid())` for per-statement caching):

```sql
private.is_family_member(fid uuid) returns bool
private.has_family_role(fid uuid, min_role family_role) returns bool  -- owner > editor > viewer
```

| Table | select | insert / update | delete |
|---|---|---|---|
| families | member | update: owner | none (soft delete by owner via RPC) |
| family_members | member of same family | none (via `create_family` only) | none |
| persons, person_names, person_name_forms, person_facts, unions, union_partners, union_facts, parent_child, media, media_links, kinship_terms | member | editor+ | **none** (soft delete), except link/value tables `person_name_forms`, `union_partners`, `media_links`: editor |
| audit_log | member | none | none |
| languages | any authenticated | none | none |

Grants: `anon` has no table access; `TRUNCATE` (which bypasses RLS) is revoked.

Tests (Vitest against a disposable local Postgres with a Supabase shim, `pnpm test:db`) assert: non-member sees 0 rows; anon is denied; viewer cannot write; editor cannot change membership; no hard deletes or truncate; cross-family links fail; cycles fail; storage folder isolation.

### 3.7 Storage

- Bucket **`family-media`**, **private**. Bucket-level `file_size_limit` (e.g. 15 MB) and `allowed_mime_types` (`image/jpeg, image/png, image/webp, application/pdf`).
- Layout:
  ```
  family-media/{family_id}/people/{person_id}/{media_id}.jpg
  family-media/{family_id}/people/{person_id}/{media_id}_thumb.webp
  family-media/{family_id}/documents/{media_id}.pdf
  family-media/{family_id}/family/{media_id}.jpg        -- group photos (linked via media_links)
  family-media/{family_id}/exports/{export_id}.png
  ```
- Storage policies on `storage.objects`: `bucket_id = 'family-media' and private.has_family_role(private.storage_family_id(name), …)`. Read requires viewer, upload/update requires editor, and deleting a binary requires owner (media rows are soft-deleted). `storage_family_id` returns null for a non-uuid first segment, so malformed paths are denied.
- Client resizes photos before upload (max 2000px + 256px thumbnail, EXIF stripped for privacy). Display uses short-lived **signed URLs**.

---

## 4. Relationship model

### 4.1 Primitives (the only stored relationships)

```
Person ──(union_partners)── Union ──(union_partners)── Person      spouse/partner
Person ──(parent_child, lineage)──▶ Person                         parentage
          └─ optional union_id: "child of this couple"
```

Everything else is **derived**.

### 4.2 Parent → child
One `parent_child` row per (parent, child), each with its own `lineage`. Per-parent lineage is required: a child can be biological to the mother and adopted by her husband in the same household. GEDCOM's per-family PEDI cannot express that; Gramps' per-parent frel/mrel can, and we follow Gramps.

### 4.3 Spouse / partner and multiple marriages
A `union` has 0–2 partners in `union_partners`. A person may be in any number of unions, ordered by `sort_order` and marriage date. Divorce, separation and widowhood are `unions.status` plus dated `union_facts`. Children point at the union they are drawn under via `parent_child.union_id`:

```
Rajiv ══ U1 ══ Madhuri          Rajiv ══ U2 ══ Sunita (2nd marriage)
         │                                │
     ┌───┴───┐                            C3
     C1     C2
```

Gender is never enforced for partners.

### 4.4 Siblings (derived)
`siblings(X)` = children of any parent of X, minus X.
- **full**: share 2 parents, both biological
- **half**: share exactly 1 biological parent (paternal/maternal side recorded)
- **adoptive**: shared parent through an `adoptive` edge
- **step**: no shared parent, but a parent of X is in a union with a parent of Y

Elder/younger comes from birth `date_sort`, falling back to `child_order`.

### 4.5 Adoption
An `adoptive` lineage edge. For kinship it counts as a parent edge (an adoptive mother's brother is still मामा), but the result is annotated `lineage: 'adoptive'` and drawn dashed. Biological and adoptive parents can coexist on the same child.

### 4.6 Step relationships
**Derived**: `step_parent(X)` = partners, in any union, of X's parents who are not themselves parents of X. "Add step-parent" in the UI asks which parent they married and creates that union. Stored `step` lineage is only for the case where the user asserts step-parenthood but the marriage is unknown.

### 4.7 "Add sibling" when no parents are recorded
Siblings are linked through parents, so this flow asks: *"Rajiv has no parents recorded. Add parents now, or link as siblings with unknown parents?"* The second option creates one **placeholder parent** (`is_placeholder = true`, drawn as a faint "?"), in a single-partner union with both children. Later, "This unknown parent is Shankar" re-points the edges to the real person. This is also the basis of a future "merge duplicates" tool. Placeholders are excluded from search, duplicate checks and counts.

### 4.8 Invariants

| # | Invariant | Enforced by |
|---|---|---|
| I1 | No one is their own parent | CHECK |
| I2 | No ancestor cycles | trigger (recursive CTE) + domain validator |
| I3 | ≤ 2 live biological parents per child | trigger |
| I4 | ≤ 2 partners per union; no duplicate live union for the same pair | trigger |
| I5 | No duplicate live `(parent, child)` edge | partial unique index |
| I6 | `parent_child.union_id` ⇒ parent is a partner of that union | trigger |
| I7 | All endpoints belong to the same family | composite FKs |
| I8 | One primary name per person; one birth and one death fact | partial unique indexes |
| I9 | Auto language output never overwrites `manual`/`corrected` | language service + DB triggers on every localized column and name form |
| I10 | No hard deletes from the client | RLS (no delete policies) |
| W1–Wn | *Warnings, not blocks:* parent younger than child, birth after death, marrying a close blood relative, child born after a parent's death + 1 year | domain validator in the UI |

The DB enforces hard invariants (I1–I10). The UI warns on plausibility issues (W*), because real genealogy data is messy and unknown dates must not block entry.

### 4.9 Relationship engine (`src/domain/kinship`, pure TypeScript)

1. **Build** an in-memory `GenealogyGraph` from DB rows (persons, unions, partners, parent_child).
2. **Consanguinity**: BFS up from A and B to find lowest common ancestors. A distance pair (up `a`, down `b`) classifies the relationship: `(1,0)` parent, `(0,1)` child, `(1,1)` sibling, `(2,0)` grandparent, `(2,1)` aunt/uncle, `(1,2)` niece/nephew, `(2,2)` first cousin, and in general cousin degree `min(a,b)-1`, removed `|a-b|`, with a "great-" count.
3. **Affinity** if there is no blood path: spouse-of-blood-relative, blood-relative-of-spouse, spouse's-relative's-spouse, and co-parents-in-law (व्याही/विहीण). In-laws stop at one marriage hop per side.
4. **Step**: via a parent's union where there is no shared parent.
5. Several paths can exist (cousin marriage, adoption). Return the shortest/closest as primary, and the others in `alternatives`.

Output (structured, language-neutral, **computed on demand, never stored**):

```ts
{
  kind: 'blood' | 'affinal' | 'step' | 'self' | 'none',
  key: 'M.M.eB',              // kinship path: mother → mother → elder brother
  english: 'maternal_grand_uncle',   // readable English identifier for the same relationship
  steps: [
    { from: 'you',  to: 'mom',     edge: 'parent', lineage: 'biological' },
    { from: 'mom',  to: 'grandma', edge: 'parent', lineage: 'biological' },
    { from: 'grandma', to: 'shankar', edge: 'sibling', half: false, relativeAge: 'elder' },
  ],
  personPath: ['you','mom','grandma','shankar'],
  generations: { up: 2, down: 1 },
  cousin: null,               // { degree, removed } when applicable
  side: 'maternal',
  alternatives: [ ... ],
}
```

**Terminology**: the built-in defaults (`src/domain/kinship/terms/{en,mr}.ts`) map the path pattern + genders + relative age to a label. The family can override or add any label from the in-site **Relationship dictionary** page (`kinship_terms` table). Lookup tries the most specific key first, then generalisations (`F.eB` → `F.B` → `P.Sib`).

| key | English | Marathi |
|---|---|---|
| `F.B` / `F.eB` / `F.yB` | paternal uncle | काका (मोठे / धाकटे काका) |
| `F.B.W` | paternal aunt (by marriage) | काकू |
| `M.B` | maternal uncle | मामा |
| `M.B.W` | maternal aunt (by marriage) | मामी |
| `F.Z` | paternal aunt | आत्या |
| `M.Z` | maternal aunt | मावशी |
| `F.F` / `M.F` | grandfather | आजोबा |
| `F.F.F` | great-grandfather | पणजोबा |
| `eB` / `eZ` | elder brother / sister | दादा / ताई |
| `B.S` / `Z.S` | nephew | पुतण्या / भाचा |
| `F.B.S` / `M.Z.S` / `M.B.S` / `F.Z.S` | first cousin | चुलत / मावस / मामे / आत्ये भाऊ |
| `Sp.F` / `Sp.M` | father/mother-in-law | सासरे / सासू |
| `D.H` / `S.W` | son-in-law / daughter-in-law | जावई / सून |
| `C.Sp.F` | child's father-in-law | व्याही |

Unknown gender falls back to a neutral form ("parent's sibling", "पालकांचे भावंड"). If no term exists, the label is composed ("mother's grandmother's brother"). Regional variants become additional term tables selected by a family setting. **Please review the Marathi terms. Regional usage varies.**

Tests (Vitest), on a fixture family: parent, child, spouse, sibling, half-sibling (paternal/maternal), grandparent, grandchild, great-grandparent, uncle/aunt (both sides), niece/nephew, first cousin, second cousin once removed, multiple spouses, children from different unions, adoption, step-parent, step-sibling, in-laws, व्याही, disconnected people (`none`), missing parents, unknown dates (elder/younger via `child_order`), cycle rejection, duplicate-edge rejection, cousin marriage (multiple paths).

---

## 5. Frontend architecture

The pipeline from the spec, mapped to folders:

```
DB rows ─▶ domain/genealogy (GenealogyGraph) ─▶ graph/projection (focus, depth, collapse)
        ─▶ graph/layout (LayoutEngine) ─▶ graph/flow (React Flow nodes/edges)
                                       └▶ export/svg ─▶ PNG / PDF
```

React Flow and export are **siblings**, both consuming the layout output. The poster/export never screenshots the DOM.

```
src/
  app/                 App.tsx, router, providers (QueryClient, Auth, Language)
  pages/               LoginPage, FamiliesPage, FamilyTreePage, TrashPage, FamilySettingsPage
  components/
    ui/                Button, Dialog, Drawer, Input, Combobox, Toast… (Tailwind primitives)
    tree/              FamilyCanvas, PersonNode, UnionNode, edges/, TreeToolbar, FocusControls
    person/            PersonDrawer, PersonForm, AddRelativeMenu, AddRelativeDialog,
                       ConnectExistingDialog, DuplicateWarning, DeletePersonDialog, FactList
    language/          BilingualField, BilingualNameField, LanguageSwitcher, SourceBadge
    relationship/      RelationshipFinder, RelationshipPath
    media/             PhotoUploader, MediaGallery
    export/            ExportDialog
  domain/              ← PURE TS. No React, no Supabase. Most of the tests live here.
    genealogy/         types, buildGraph(rows), queries (parents, children, unions, siblings, ancestors, descendants)
    kinship/           resolver.ts, classify.ts, terms/en.ts, terms/mr.ts, render.ts
    dates/             FuzzyDate type, parse, format (per language, Devanagari numerals optional), compare
    validation/        invariants + plausibility warnings
    dedupe/            candidate scoring (name similarity across scripts, birth year ±2, place, shared relatives)
    localized/         LocalizedText helpers, overwrite rule, staleness
  graph/
    projection.ts      subgraph around focus (N generations, collapsed branches, ancestors/descendants mode)
    layout/            LayoutEngine interface, dagreLayout.ts, spouse/union post-processing
    flow.ts            layout → React Flow nodes/edges; edge style from lineage (UI metadata only)
  export/              svgRenderer.ts (layout → SVG string, embedded Noto Sans Devanagari), rasterize.ts (SVG → PNG)
  services/
    supabase.ts        typed client
    repositories/      familyRepo, personRepo, relationshipRepo, mediaRepo (the only place that talks to Supabase tables/RPCs)
    language/          LanguageService interface; edgeFunctionProvider (calls the Edge Function)
  hooks/               useFamilyGraph, usePerson, useAddRelative, useConnectExisting,
                       useSearchPeople, useRelationship, useUploadPhoto (TanStack Query)
  i18n/                ui strings en.ts / mr.ts, useT()
  types/               database.types.ts (generated: `supabase gen types typescript`)
supabase/
  config.toml
  migrations/          0001_extensions_enums.sql, 0002_core_tables.sql, 0003_integrity_triggers.sql,
                       0004_rls.sql, 0005_storage.sql, 0006_audit.sql, 0007_rpcs.sql
  functions/language/  Edge Function: translate / transliterate / detect, with pluggable providers
  tests/               Vitest DB tests: rpcs, invariants, rls (+ support/ shim and harness)
  seed.sql             demo family for local dev only
```

Key behaviours:
- **Data loading:** the whole family *structure* (ids, primary name forms, birth/death summary, unions, edges) loads once per family into `GenealogyGraph`. Even 5,000 people is about 1–2 MB, which makes search, duplicate detection and kinship instant and client-side. Details (facts, media, notes) load lazily per person. Only the **projected subgraph** is rendered (default: 3 generations around the focus), so React Flow never receives thousands of nodes.
- **Two "languages":** the *UI language* (chrome) and the *data display language* (`en` | `mr` | bilingual) are separate settings. A missing value falls back to the other language with a subtle marker.
- **Language service** (`translateText`, `transliterateText`, `detectLanguage`) is an interface. The client calls one Edge Function, which holds API keys and routes **names → transliteration provider** and **prose → translation provider**. Script detection is local (Unicode ranges), with no network call.
- **Add relative flow:** the person drawer has **+ Add relative** → Mother / Father / Child / Spouse / Sibling / Adoptive parent / Step-parent / Connect existing. Then a short form (bilingual name, gender, optional birth year) → live duplicate check → save via a single RPC → TanStack Query invalidates → the graph re-projects. Context questions ("Child of Rajiv & Madhuri, or with someone else?") appear only when ambiguous.

---

## 6. Phased plan

Each phase ends at a checkpoint for your review: typecheck, lint and tests pass, with a short report.

| Phase | Scope | Exit criteria |
|---|---|---|
| **0. Scaffold** ✅ | Vite + React + TS + Tailwind + ESLint/Prettier + Vitest + pnpm; `supabase init`; folder skeleton; README with local setup | `pnpm build`, `pnpm test`, `pnpm lint` green |
| **1. Database** ✅ | Migrations: enums, tables, FKs, indexes, constraints, integrity triggers, RLS, storage bucket + policies, audit trigger, kinship dictionary, RPCs; DB tests | `pnpm test:db` green (77 tests); still to do: apply to the hosted project and generate TS types |
| **2. Domain core** ✅ | `dates` (parse/format en+mr, compare), `genealogy` graph (derived siblings/step/ancestors), `kinship` resolver (path key + English id) with default en/mr terms and dictionary lookup, `localized` overwrite rule, `dedupe`, `validation` warnings | `pnpm test` green (128 tests) |
| **3. Auth & families** ✅ | Password-only login to the shared account, sign out, family list + create (bilingual name), family page, device editor name (sent as `x-editor-name`, URI-encoded), UI language toggle (Marathi default) | Browser smoke test with mocked Supabase passes; real sign-in pending migrations on the hosted project |
| **4. People & relationships** ✅ | Add first person, person drawer, bilingual person form (manual entry, fuzzy dates with live preview), add relative (father/mother/spouse/son/daughter/brother/sister/adoptive/step) with context questions, connect existing, duplicate warning, header search (English + Marathi), edit, soft delete with impact dialog | Browser e2e against local Postgres + PostgREST with real RLS passes |
| **5. Tree view** (basic ✅) | React Flow + dagre union-graph layout, gender accents, lineage edge styles, divorced partnerships dashed, focus neighbourhood for >150 people. Still to do: spouse-adjacent family layout, expand/collapse, ancestors/descendants modes | — |
| **6. Language service** | Edge Function + provider interface + first providers; Generate Marathi/English buttons; source badges; staleness hint | Overwrite rule tested; provider swappable via env |
| **7. Relationship finder** | "How am I related to X?", path list, English + Marathi term, path highlight in graph, **Relationship dictionary** editor page | Matches domain tests in the UI; dictionary edits apply immediately |
| **8. Media** | Profile photo upload (client resize, EXIF strip), signed URLs, gallery basics | Storage RLS verified (non-member denied) |
| **9. Export** | SVG renderer from layout, PNG rasterization, scope (whole/branch/ancestors/descendants) and language (en/mr/bilingual) options | Printable PNG/SVG with correct Devanagari |

**Post-MVP:** realtime collaboration + invitations, audit-history UI, sources/citations, places table, better custom layout (ELK or bespoke), PDF/poster mode, foster/guardian UI, merge-duplicates tool, GEDCOM import/export, OCR, AI-assisted extraction, additional Indian languages.

---

## 7. Open items

1. **Hosted Supabase access from the dev environment.** The cloud dev environment's network policy blocks `hbpguqvcyebidnvjvxzy.supabase.co`, and applying migrations needs a credential. See README → "Applying migrations".
2. **Shared login account.** Create it once in the Supabase dashboard (README → "Shared family login").
3. **Language providers** (Phase 6): Bhashini / IndicXlit access and/or an Anthropic API key.
4. **Marathi kinship terms**: the defaults in §4.9 are a starting point and can be edited in the app.
