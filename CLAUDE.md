# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**GVDB** (Gay Video Database Management System) is a Flask-based application for managing, querying, and analyzing adult video production data. It includes studios, actors, stage names, productions (singles/albums/segments), performances, and tags.

**Tech Stack**:
- Backend: Python Flask 3.x with PostgreSQL
- Frontend: HTML5, CSS3, Vanilla JavaScript (no frameworks)
- Architecture: Separate backend API + frontend

## Build & Run Commands

### Prerequisites
```bash
pip install -r requirements.txt
```

### Database Setup
```bash
# PostgreSQL database must be running with correct credentials in config.py
# Load the schema:
psql -U postgres -d gvdb_red -f gvdb_schema.sql
```

### Running the Application
```bash
python app.py
```
Runs on `http://0.0.0.0:5000`

### Configuration
Edit `config.py` to set:
- Database connection details (host, port, database, user, password)
- Flask SECRET_KEY for session encryption
- DEBUG mode

## High-Level Architecture

### Core Entities and Relationships

```
studios (1) ──────── (many) stage_names ──────── (1) actors
             ────────────────────────────

productions ──────── (many) performances ──────── (many) stage_names
    │
    ├─ parent_id → productions (self-reference: album contains segments)
    │
    └─ production_tags ──────── tags
```

### Production Types
- **single**: Individual video with performances and tags
- **album**: Collection with segments (no direct performances)
- **segment**: Part of an album with performances and tags

### Key Business Logic

**Production Deduplication**: When counting works, segments are counted by their parent album ID, not individually. This prevents the same album from being counted multiple times.

```sql
COUNT(DISTINCT CASE
    WHEN p.type IN ('single', 'album') THEN p.id
    WHEN p.type = 'segment' THEN p.parent_id
END) as total_productions
```

**Role Types**: top, bottom, giver, receiver, NULL (treated as "other")

**Stage Names**: Each actor can have different stage names per studio, enabling the same person to be tracked across different production companies.

### Core Backend Architecture (app.py)

The application is organized into logical sections:

1. **Database Connection** (app:33-36)
   - `get_db_connection()`: Returns PostgreSQL connection using credentials from config.py

2. **Add Routes** (app:49-295)
   - `/add_actor` (POST/GET): Create actors with multiple stage names
   - `/add_studio` (POST/GET): Create studios, auto-generates anonymous actors
   - `/add_production` (POST/GET): Create singles, albums, or segments with performances and tags

3. **Search/Query Routes** (app:544-860)
   - `/search`: Production search page
   - `/api/search`: Production filtering with complex criteria
   - `/api/filter-options`: Get available filters (studios, tags) with icons and custom ordering
   - `/api/segments/<parent_id>`: Get segments for an album

4. **Actor Management Routes** (app:893-1368)
   - `/edit_actor`: Edit actor page
   - `/api/actor/<id>` (GET/PUT): Get/update actor details including stage names
   - `/actors`: Actor search page
   - `/api/actors/query`: Complex actor filtering with statistics
   - `/api/actors/suggestions`: Auto-complete suggestions
   - `/api/actors/search`: Stage name search for production form

5. **Production Editing Routes** (app:1370-1632)
   - `/edit_production`: Edit production page
   - `/api/search_productions`: Search productions by code/title/studio
   - `/api/production/<id>` (GET): Fetch complete production data for editing
   - `/api/production/<id>` (PUT): Update production, performers, and tags

6. **API Helper Routes** (app:465-542)
   - `/api/studios`: Studio list
   - `/api/search_albums`: Album autocomplete
   - `/api/studio_actors/<studio_id>`: Get actors for a studio

### Global Configuration (app:14-28)

**STYLE_ICONS**: Maps style tags to emoji icons for UI display
**STYLE_ORDER, BODY_TYPE_ORDER, SOURCE_ORDER**: Custom sort orders for tag categories (not alphabetical)

### Frontend Architecture

```
templates/
├── base.html          # Navigation, shared layout
├── index.html         # Home page
├── add_studio.html    # Add studio form
├── add_actor.html     # Add actor with dynamic stage names
├── add_production.html # Conditional form for single/album/segment
├── edit_actor.html    # Actor search + edit form
├── edit_production.html # Production search + edit form
├── view_production.html # Complex production search UI
└── view_actor.html    # Two-level actor list with statistics

static/
├── style.css          # Global styles
├── script.js          # Common utilities (debounce, table rendering)
├── add_production.js  # Form logic: conditional rendering, GVDB format parsing
├── edit_actor.js      # Actor search + stage name management
├── edit_production.js # Production search + performer/tag management
├── edit_production.css # Styling for edit production form
├── view_production.js # State management for filtering/sorting productions
├── view_production.css # Grid layout for results
├── view_actor.js      # Two-level expandable list with statistics
└── view_actor.css    # Complex styling for role breakdown charts
```

### Complex Features

**0. Edit Production** (edit_production.html + edit_production.js + edit_production.css)
- Search phase: Find production by code, title, or studio name
- Selection phase: Load complete production with performers and tags
- Conditional fields based on type:
  - Singles: Show studio, date, performers, tags
  - Albums: Show studio, date (no performers/tags at album level)
  - Segments: Show inherited parent studio/date (read-only), performers, tags
- Performer management:
  - Display current performers in table
  - Edit role and performer type inline
  - Add new performers with studio filter and autocomplete
  - Remove performers (tracked for deletion)
- Tag management:
  - Checkboxes for 5 tag categories
  - Multi-select with state tracking
- Save operation:
  - Flag-based performer tracking (is_new, modified)
  - Delete + recreate for tags
  - Full transaction with error handling

**1. Add Production** (add_production.html + add_production.js)
- Conditional rendering based on production type (single/album/segment)
- GVDB format parsing to auto-fill code, title, release date
- Dynamic role-based actor lists
- Multiple tag categories with custom ordering (uses STYLE_ORDER, BODY_TYPE_ORDER, SOURCE_ORDER)
- Code generation for segments (prefix + suffix or custom)

**2. View Production** (view_production.html + view_production.js)
- State-based filtering: studios, actors, types, date range, keyword, tags
- Multi-dimensional sorting
- Album expansion to show segments
- Actor filtering by stage name ID
- Pagination with configurable page size

**3. View Actor** (view_actor.html + view_actor.js)
- Two-level expandable list (actor → studios)
- Global and per-studio role statistics
- Role breakdown displayed as color-coded bar charts
- Custom sorting: by name, latest work, or work count
- Excludes auto-generated actors (STUDIO_*) by default
- Complex SQL aggregation with UNION for latest work calculation

**4. Edit Actor** (edit_actor.html + edit_actor.js)
- Actor search by tag or stage name (excluding STUDIO_* patterns)
- Stage name management: view, add, edit, delete per studio
- Handles both existing and new stage names in a single update

## Important SQL Patterns

### Latest Work Query (Using UNION)
Used in actor search to find the most recent work correctly:
```sql
SELECT p.code, p.release_date FROM performances perf
JOIN productions p ON perf.production_id = p.id
WHERE p.type = 'single'

UNION

SELECT p.code, p.release_date FROM performances perf
JOIN productions seg ON perf.production_id = seg.id
JOIN productions p ON seg.parent_id = p.id
WHERE seg.type = 'segment' AND p.type = 'album'

ORDER BY release_date DESC LIMIT 1
```

### Role Aggregation
Handles NULL roles as "other":
```sql
COALESCE(SUM(CASE WHEN perf.role IS NULL THEN 1 ELSE 0 END), 0) as role_other
```

### Performance Search with Array Operators
PostgreSQL array operations for tag filtering:
```sql
WHERE sex_acts && %s::varchar[]
```

## Important Implementation Details

### Database Views
- **production_search_view**: Aggregates production data with actor IDs, tags, and metadata for efficient searching

### Form Validation
- Frontend: Prevents form submission on Enter key in add_studio
- Backend: Validates actor_tag uniqueness, checks duplicate stage names per studio, validates required fields

### State Management
- View Production: Single state object tracking filters, current page, expanded albums
- View Actor: Tracks search, filters, sort order, expanded actors

### API Response Patterns
- All responses use JSON with consistent error handling
- Actor queries include comprehensive statistics: total productions, role breakdown, per-studio details
- Tag filters return with icons (styles) and custom ordering

## File Locations Reference

- **Main application**: `app.py` (~1400 lines)
- **Database schema**: `gvdb_schema.sql`
- **Configuration**: `config.py` (contains hardcoded DB credentials and SECRET_KEY)
- **Dependencies**: `requirements.txt`
- **Static assets**: `static/` (CSS, JavaScript)
- **Templates**: `templates/` (HTML)

## Development Tips

### Adding a New Tag Category
1. Add entries to the `tags` table with a new `category` value
2. Update `app.py` global tag ordering constants if needed (e.g., add `TAG_ORDER`)
3. Update the `tags` dictionary in `/api/filter-options` (app:570-627)
4. Update form rendering in relevant template

### Modifying the Actor Query
The most complex query in the system is `/api/actors/query` (app:1070-1368). It:
- Counts distinct productions excluding duplicates
- Calculates role statistics globally and per-studio
- Uses UNION for latest work calculation
- Applies custom sorting with GROUP BY to avoid DISTINCT conflicts

### Debugging Database Issues
- Check `config.py` for correct credentials
- Verify PostgreSQL is running and database is initialized with schema
- Use database logs to identify constraint violations or missing tables
- NULL value handling is critical for roles and optional fields

## Known Patterns & Conventions

- **Entry points**: Routes without `api/` are page views (render_template), routes with `api/` are JSON endpoints
- **Naming**: `add_*` for creation, `edit_*` for modification, `view_*` for querying
- **Database cursor pattern**: Always use `RealDictCursor` for readable column names in JSON responses
- **Error handling**: Flash messages for user-facing errors, JSON error responses for API calls
- **Pagination**: Implemented via LIMIT/OFFSET with total count calculation

---

## Database Schema

### Core Tables

#### **studios**
Production companies/publishers
```
id (int, PK, auto)
name (varchar, UNIQUE)          - Studio name
country (varchar, nullable)      - Studio country
website (varchar, nullable)      - Official website
notes (text, nullable)           - Additional notes
created_at (timestamp)           - Auto-created timestamp
```
**Constraints**: UNIQUE(name)

#### **actors**
Performers/talent
```
id (int, PK, auto)
actor_tag (varchar, UNIQUE)     - Unique identifier for this actor
gvdb_id (varchar, nullable)     - External GVDB reference ID
notes (text, nullable)          - Notes about the actor
created_at (timestamp)          - Auto-created timestamp
```
**Constraints**: UNIQUE(actor_tag)

**Special actor_tag patterns**:
- `STUDIO_<name>_SUNGLASSES`: Auto-generated anonymous actor (sunglasses)
- `STUDIO_<name>_PASSERBY`: Auto-generated anonymous actor (passerby)
- `ANONYMOUS_POOL`: Pool for completely anonymous performers
- `UNKNOWN_POOL`: Pool for unknown performers

#### **stage_names**
The name an actor uses at a specific studio (many-to-many bridge)
```
id (int, PK, auto)
actor_id (int, FK → actors)     - Reference to actor
studio_id (int, FK → studios)   - Reference to studio
stage_name (varchar)             - The name used at this studio
created_at (timestamp)           - Auto-created timestamp
```
**Constraints**: UNIQUE(actor_id, studio_id, stage_name), FK CASCADE

**Purpose**: Enables the same actor to have different stage names per studio

#### **productions**
Videos, albums, or segments
```
id (int, PK, auto)
code (varchar, UNIQUE)           - Production code (e.g., ABC-123)
type (varchar)                   - Type: 'single', 'album', or 'segment'
parent_id (int, FK → productions) - For segments: reference to parent album
studio_id (int, FK → studios)    - Studio that produced this work
title (text, nullable)           - Full title
release_date (varchar(10), nullable) - ISO date format (YYYY-MM-DD)
comment (text, nullable)         - Internal notes
performer_ids (int[])            - **DENORMALIZED**: Array of stage_name_ids
created_at (timestamp)           - Auto-created timestamp
updated_at (timestamp)           - Updated when performers change
```
**Constraints**:
- UNIQUE(code)
- CHECK(type IN ('single', 'album', 'segment'))
- CHECK(segment_must_have_parent): segments must have parent_id
- CHECK(non_segment_must_have_studio): singles/albums must have studio_id
- CHECK(non_segment_must_have_date): singles/albums must have release_date

**Important**: The `performer_ids` column is a **denormalized array** maintained by triggers. It's used for efficient filtering and is NOT queried directly from performances table during searches.

#### **performances**
Records of a specific actor appearing in a production with a role
```
id (int, PK, auto)
production_id (int, FK → productions) - The production
stage_name_id (int, FK → stage_names) - Which stage name this performer used
role (varchar, nullable)         - Role: 'top', 'bottom', 'giver', 'receiver', or NULL
performer_type (varchar)         - Type: 'named', 'anonymous', 'masked', 'pov_only'
notes (text, nullable)           - Performance-specific notes
created_at (timestamp)           - Auto-created timestamp
```
**Constraints**:
- UNIQUE(production_id, stage_name_id) - One actor per role type per production
- CHECK(role IN ('top', 'bottom', 'giver', 'receiver', NULL))
- CHECK(performer_type IN ('named', 'anonymous', 'masked', 'pov_only'))
- FK CASCADE on both foreign keys

#### **tags**
Classification tags for productions
```
id (int, PK, auto)
category (varchar)               - Category: 'sex_act', 'style', 'scenario', 'body_type', 'source'
name (varchar)                   - Tag value
created_at (timestamp)           - Auto-created timestamp
```
**Constraints**: UNIQUE(category, name)

#### **production_tags**
Associates tags with productions (many-to-many)
```
production_id (int, FK → productions, PK)
tag_id (int, FK → tags, PK)
created_at (timestamp)           - Auto-created timestamp
```
**Constraints**: COMPOSITE PRIMARY KEY(production_id, tag_id), FK CASCADE

---

### Database Views

#### **production_search_view**
Optimized view for the production search API. Denormalizes data for efficient filtering and sorting.

**Columns**:
```
id, code, type, parent_id, studio_id, studio (name),
title, release_date, comment,
performers_display (formatted string),
performer_ids (int[]),
sex_acts (text[]),
styles (text[]),
body_types (text[]),
sources (text[])
```

**Purpose**:
- Pre-formats performer display strings with role-based ordering
- Aggregates all tags per production as arrays
- Handles albums differently than singles (albums show union of segment performers)
- Used by `/api/search` endpoint for filtering and sorting

**Key Logic**:
- For albums: Shows union of all segment performers
- For singles/segments: Shows performers with role-based ordering (top → giver → receiver → bottom → other)
- All NULL arrays are handled in the view definition

#### **notion_export**
Exports data in Notion-compatible format for external use.

**Columns**:
```
id, code, publisher (studio.name), title, date (release_date),
type, parent_code, actors (formatted), source, sex_acts, styles, body_types, comment
```

**Purpose**:
- Converts internal format to human-readable Notion export format
- Handles performer type display (anonymous → '墨鏡男', masked → '蒙面男')
- Formats actors with roles: "Actor Name (role)"
- Aggregates tags by category as comma-separated strings

---

### Triggers

#### **sync_album_performers() Function** (BEFORE INSERT/UPDATE/DELETE on performances)

**Purpose**: Maintains denormalized `performer_ids` array in productions table when performances change.

**Triggered by**:
- `performances_sync_album_insert`: AFTER INSERT
- `performances_sync_album_update`: AFTER UPDATE
- `performances_sync_album_delete`: AFTER DELETE

**Behavior**:
1. Updates the direct production's `performer_ids` with all distinct stage_name_ids
2. If the performance's production is a segment, also updates the parent album's `performer_ids` with the union of all segment performers

**Why denormalization**: The API's `/api/search` endpoint filters using PostgreSQL array operators (`&&`), which is more efficient than JOINing performances table repeatedly.

**Critical**: This function must run AFTER performance changes to ensure data consistency.

#### **cleanup_album_performers_on_segment_delete() Function** (BEFORE DELETE on productions)

**Purpose**: Cleans up parent album's performer list when a segment is deleted.

**Triggered by**:
- `productions_cleanup_album_delete`: BEFORE DELETE

**Behavior**:
1. When deleting a segment (type = 'segment' with parent_id)
2. Recalculates the parent album's `performer_ids` from remaining segments
3. Sets `updated_at` timestamp on the parent album

**Why BEFORE**: Runs before actual deletion to calculate from old data, then cascading DELETE handles the segment itself.

---

### Indexes

**Performance-critical indexes**:

| Index | Table | Columns | Type | Purpose |
|-------|-------|---------|------|---------|
| `idx_productions_type` | productions | type | BTREE | Filter by type (single/album/segment) |
| `idx_productions_performer_ids` | productions | performer_ids | GIN | Array filtering (&&) in search API |
| `idx_productions_studio_id` | productions | studio_id | BTREE | Filter by studio |
| `idx_productions_parent_id` | productions | parent_id | BTREE | Find segments for album |
| `idx_performances_production_id` | performances | production_id | BTREE | Get performers for production |
| `idx_performances_stage_name_id` | performances | stage_name_id | BTREE | Find performances by actor |
| `idx_stage_names_actor_id` | stage_names | actor_id | BTREE | Get stage names for actor |
| `idx_stage_names_studio_id` | stage_names | studio_id | BTREE | Get actors for studio |
| `idx_production_tags_production` | production_tags | production_id | BTREE | Get tags for production |
| `idx_production_tags_tag` | production_tags | tag_id | BTREE | Find productions with tag |

**GIN Index Note**: The `performer_ids` array uses a GIN index to optimize the `&&` (array overlap) operator used in filtering.

---

### Foreign Key Constraints

| Constraint | From | To | Behavior |
|-----------|------|----|-|
| `stage_names_actor_id_fkey` | stage_names.actor_id | actors.id | CASCADE |
| `stage_names_studio_id_fkey` | stage_names.studio_id | studios.id | CASCADE |
| `performances_production_id_fkey` | performances.production_id | productions.id | CASCADE |
| `performances_stage_name_id_fkey` | performances.stage_name_id | stage_names.id | CASCADE |
| `production_tags_production_id_fkey` | production_tags.production_id | productions.id | CASCADE |
| `production_tags_tag_id_fkey` | production_tags.tag_id | tags.id | CASCADE |
| `productions_studio_id_fkey` | productions.studio_id | studios.id | (default) |
| `productions_parent_id_fkey` | productions.parent_id | productions.id | (default) |

**Cascading Deletes**:
- Deleting an actor cascades to stage_names
- Deleting stage_names cascades to performances
- Deleting a performance triggers `sync_album_performers()` to update parent album
- Deleting a production cascades to performances and production_tags
- Deleting a segment triggers `cleanup_album_performers_on_segment_delete()` to update parent album

---

### Data Flow with Denormalization

**When adding a performance**:
1. INSERT into performances table
2. `sync_album_performers()` trigger fires:
   - Updates the production's `performer_ids` array
   - If segment: also updates parent album's `performer_ids`
3. `/api/search` reads from denormalized `performer_ids` using array overlap filtering

**When deleting a segment**:
1. `cleanup_album_performers_on_segment_delete()` fires (BEFORE DELETE)
2. Recalculates parent album's `performer_ids` from remaining segments
3. Segment is deleted (cascades to its performances)
4. `sync_album_performers()` fires again from remaining segment deletes
5. Final result: parent album has correct performer list

This design trades storage space for query performance, since `/api/search` is used frequently with complex filtering.

---

### Data Integrity Considerations

**Unique Constraints**:
- `actor_tag` must be unique across all actors
- `code` must be unique across all productions
- `category + name` must be unique in tags
- `production_id + stage_name_id` must be unique in performances
- `actor_id + studio_id + stage_name` must be unique in stage_names (same actor can't have duplicate names at same studio)
- Studio `name` must be unique

**Data Validation**:
- Type constraints ensure only valid production types exist
- Role constraints ensure only valid roles are used
- Performer type constraints limit values to expected types
- Segments must have parent album, singles/albums must have studio and release date

---

## Recent Features & Updates

### 1. Newest Edit Time Sorting
- **Backend** (app.py:746, 1036, 1104, 1184-1193):
  - Production search: Added `'updated': 'updated_at'` to allowed sort fields
  - Actor search: Added `'newest_edit'` to valid sort options
  - Sorting logic finds MAX(updated_at) from productions for each actor
- **Database View** (production_search_view):
  - Now includes `p.updated_at` field for sorting support
- **Frontend**:
  - view_production.html: Added "Updated ▼" button with data-field="updated" (line 106-108)
  - view_actor.html: Added "按最新編輯" option to sortBy dropdown (line 43)

### 2. Smooth Toggle Animation for Segments
- **CSS** (view_production.css:377-406):
  - `.segment-row`: Animation on display with 0.3s slideDown
  - `.segment-row.removing`: Animation on removal with 0.3s slideUp
  - @keyframes slideDown/slideUp: Smooth height and opacity transitions
- **JavaScript** (view_production.js:604-622):
  - `removeSegments()`: Adds 'removing' class before deletion, waits 300ms for animation

### 3. Full Display as Default
- **HTML** (view_production.html):
  - Removed "顯示完整內容" (Show Full Content) checkbox
- **CSS** (view_production.css):
  - Removed full-display-toggle styles
- **JavaScript** (view_production.js:120-121):
  - Changed from toggle event to: `document.body.classList.add('full-display')` on page load
- **Result**: All text always shows (no truncation), full content display is permanent

### 4. Reduced Text Sizes
- **view_production.css**:
  - Table headers: 12px font (from default)
  - Table cells: 12px font (from default)
  - Padding: 10px 6px headers, 8px 6px cells (from 12px 8px and 10px 8px)
- **view_actor.css**:
  - Headers: 12px font
  - Cells: 12px font
  - Details content: 12px font
  - Smaller padding throughout

### 5. View Production Table Updates
- **Functionality**:
  - Keeps original table layout with all columns visible
  - Segments expand/collapse with smooth slide animation
  - Shows all information (no hidden/truncated fields)
  - Original card sizes maintained
- **Performance**:
  - Smooth 0.3s animation when expanding/collapsing

### 6. View Actor Improvements
- **Expandable List Pattern**:
  - Same smooth animation as view_actor (0.3s transition)
  - Smaller font sizes (12px header, 11-12px details)
  - Compact display showing more information per screen
- **Sorting Options**:
  - Name (A-Z)
  - Latest Production
  - Work Count
  - Newest Edit (newest production edit time)

### 7. Button-Based Sorting (Both Pages)
- **view_production.js** (handleSortClick, updateSortButtons):
  - Multi-field sorting: Primary field shows active state
  - Click same field to toggle direction (▲/▼)
  - Click different field to change primary sort
  - buildSortString() creates comma-separated sort parameters
- **view_actor.js** (handleSortClick, updateSortButtons):
  - Similar pattern to view_production
  - Handles 4 sort options: name, latest, count, newest_edit

### 8. Home Page Card Reorganization
- **Layout**:
  - Grid: 4 columns with minmax(250px, 1fr)
  - Row 1 (Add): Add Actor, Add Production, Add Studio, [blank]
  - Row 2 (View): View Actor, View Production, [blank], [blank]
  - Row 3 (Edit): Edit Actor, Edit Production, [blank], [blank]
- **CSS** (style.css:114-142):
  - Fixed 4-column grid with blank placeholders
  - Responsive: 3 columns @1200px, 2 columns @768px, 1 column @480px
  - Card size maintains 250px minimum (same as before)
- **Blank Cards**:
  - `<div class="function-card-blank"></div>` for layout spacing
  - No styling (invisible placeholders)

### 9. Actor Pool Management
- **Special Actors**:
  - ANONYMOUS_POOL: Global anonymous actor pool
  - UNKNOWN_POOL: Global unknown actor pool
  - GIRL_POOL: Global girls/female actor pool
  - Each has stage_names per studio (auto-generated when studio is created)
- **Backend** (app.py:206-294):
  - `add_studio()`: Auto-creates 3 pool stage names (ANONYMOUS, UNKNOWN, GIRL) for each new studio
  - ON CONFLICT DO NOTHING: Safely handles duplicate inserts

---

## Public Website Deployment Concept (For Future Implementation)

### Architecture
- **Frontend**: GitHub Pages (static HTML, CSS, JS)
- **Backend**: Flask API on Railway/Render
- **Database**: Supabase (PostgreSQL + Auth)
- **Access Control**: API Key or IP-based restriction

### Read Access (Public)
- All view endpoints: view_production, view_actor, search endpoints
- No authentication required
- Anyone can browse the database

### Write Access (Admin Only)
- All add/edit endpoints: add_production, edit_production, add_actor, edit_actor, add_studio
- **Option 1 - API Key**:
  - Store secret key in backend environment variables
  - Client requests include `Authorization: Bearer API_KEY` header
  - Backend validates key before allowing write operations
- **Option 2 - IP Whitelist**:
  - Check `request.remote_addr` against whitelist
  - Only allow requests from specific IP addresses
- **Option 3 - Combination**:
  - Require both valid IP AND valid API key
  - Extra security layer

### Security
- All secrets stored in deployment platform environment variables (not in GitHub)
- Database RLS policies enforce authorization at data layer
- HTTPS required for all requests
- API key rotation mechanism for security updates
