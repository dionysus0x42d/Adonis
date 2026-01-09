# Tag Display Debugging Guide

## Issue
Tags (sex_act, body_type, style, source) are not displaying on the view_production page.

## Investigation Summary

### Data Verification ✓
- Production ID 3 (GD-002, type: "single") has **49 tags** in the database
- Tag examples:
  - Tag ID 1: sex_act → "肛"
  - Tag ID 8: style → "工作/西裝"
  - Tag ID 17: body_type → "壯碩"
- All JSON data files are correctly exported and present

### Code Changes Made
1. **indexeddb-loader.js** (line 449-452):
   - Added debug logging to track when production details are being loaded
   - Logs: `[DEBUG] Production 3: { tags: {...}, actors: [...] }`

2. **view_production.js**:
   - **renderResults()** (line 498): Logs first item structure to console
   - **createResultRow()** (line 525): Logs `item.tags` property
   - **renderTags()** (line 561): Logs each call with tags and type parameter

### How to Debug

1. **Open the page in a browser**:
   ```
   http://localhost:8000
   ```

2. **Open Developer Console** (F12 or right-click → Inspect → Console tab)

3. **Look for these console logs** (in order):
   ```
   [DEBUG] Production 3: { tags: {...}, actors: [...] }
   [renderResults] First item structure: { ... }
   [createResultRow] item.tags= {...}
   [renderTags] type=sex-act, tags= [...]
   [renderTags] type=style, tags= [...]
   [renderTags] type=body-type, tags= [...]
   [renderTags] type=source, tags= [...]
   ```

4. **Check what each log shows**:
   - If `item.tags` is undefined: Tags not being attached to production object
   - If `item.tags` is an empty object: Tags not being loaded from IndexedDB
   - If `item.tags` is an empty array: No tags exist for this production
   - If `renderTags` receives `undefined` or `[]`: Tag display issue is in renderTags()

### Expected Output
- singles should have tags
- Albums will have empty tags (expected - they're containers with no direct tags)

### Code Flow
```
performSearch()
  ↓
GVDBData.getProductions(filters, sort, pagination)
  ├─ Get all productions
  ├─ Filter out segments
  ├─ Apply filters
  ├─ For each production: getProductionDetails(prod.id)
  │  ├─ Get performances → build actors array
  │  └─ Get production_tags → build tags object
  └─ Return productions with details
    ↓
renderResults()
  ├─ For each item: createResultRow(item)
  │  └─ renderTags(item.tags?.sex_acts, 'sex-act')
  │     renderTags(item.tags?.styles, 'style')
  │     renderTags(item.tags?.body_types, 'body-type')
  │     renderTags(item.tags?.sources, 'source')
```

### Most Likely Issues
1. **getProductionDetails not being awaited**: Would show undefined tags
2. **Promise.all() not completing**: Would show partial or missing data
3. **Tag arrays not initialized**: Would show undefined instead of []
4. **Data not loading from IndexedDB**: Would show empty or missing tags

---

Once you share the console output, we'll be able to pinpoint exactly where the issue is.
