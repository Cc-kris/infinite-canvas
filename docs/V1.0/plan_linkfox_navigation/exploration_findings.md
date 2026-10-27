# LinkFox Navigation Exploration Findings

**Generated**: 2026-10-27

**Purpose**: Evidence collection for replicating LinkFox top navigation in infinite-canvas

**Mode**: Read-only exploration, no code/document modification

---

## 1. LinkFox Top Navigation Bar

**Evidence Source**: `docs/V1.0/plan_linkfox_navigation/evidence/linkfox_home_dom.json`


**Top Navigation Items (left to right)**:

1. **首页**
2. **电商套图** ⭐
3. **智能修图** ⭐
4. **新模型**
5. **AI视频** ⭐
6. **HOT**
7. **批量生图** ⭐
8. **商品图设计** ⭐
9. **Skills**
10. **Agent**
11. **更多**

**Key Observations**:
- Total 11 items in top nav bar
- Core 5 product categories marked with ⭐ above
- HOT badge appears after 'AI视频'
- Position [24, 50, 1026, 60] px in layout (from landmarks)
- Uses CSS class `_menu_139v7_27` for container

## 2. Five Primary Navigation Categories

**Analysis Basis**: Cross-referenced DOM text, route patterns, and tool distribution


### Category Identification

From top navigation bar, the **five main product categories** are:

1. **电商套图** (E-commerce Image Suites)
2. **智能修图** (Smart Image Editing)
3. **AI视频** (AI Video) - marked with HOT badge
4. **批量生图** (Batch Image Generation)
5. **商品图设计** (Product Image Design)

**Other Top Nav Items** (not primary categories):
- 首页 (Home) - landing page
- 新模型 (New Model) - possibly a filter/feature flag
- Skills - external link to `https://skill.linkfox.com/`
- Agent - AI agent feature panel
- 更多 (More) - overflow menu

## 3. Left Sidebar Tool Hierarchy

**Evidence Source**: `docs/V1.0/plan_linkfox_navigation/evidence/linkfox_tool_dom.json`


**Extracted Sidebar Structure**:

```

图片编辑:

智能修图:
  - 局部重绘
  - 局部消除
  - 一键换色
  - 图片裁剪
  - 质量提升
  - 商品精修
  - 图像修复
  - 色差修复
  - 印花修复

抠图工具:
  - 精细抠图
  - 批量抠图

企业功能:
  - 批量生图
  - 即将下架
  - 手部修复
  - 下架
```

**Layout Properties**:
- Sidebar width: 180px
- Position: [0, 110, 180, 673]
- Uses Ant Design menu components: `ant-menu ant-menu-root ant-menu-inline`
- Styling class: `_menu_1xhca_92`

## 4. Complete Tool Inventory (39 Tools)

**Evidence Sources**:
- `docs/analysis/assets/linkfox/tool_types_and_coverage.json` (type field)
- `linkfox-deep-20261027/tools_final.json` (biz field, chunks)


**Total Tools**: 39

| Tool ID | Chinese Name | Type | Biz | Cases | Prompts |
|---------|--------------|------|-----|-------|---------|
| SCALE_UP | 高清放大 | 7 | 7 | 0 | 0 |
| REPLACE_GOODS | 换商品 | 12 | 1 | 33 | 0 |
| PRODUCT_SCENE | 商品场景图 | 13 | 1 | 34 | 33 |
| AI_TEXT | AI文字 | 14 | 1 | 0 | 0 |
| MATERIAL_UPPER_BODY | 上装换料 | 16 | 1 | 0 | 0 |
| ORNAMENT_TEXT | 装饰文字 | 17 | 15 | 0 | 0 |
| CHANGE_COLOR | 套图换色 | 19 | 1 | 35 | 0 |
| SDS_DESIGN | SDS设计 | 22 | 16 | 18 | 0 |
| REMOVE_PEN | 消除笔 | 23 | 17 | 0 | 0 |
| AI_DRESSING_V2 | AI试衣V2 | 24 | 24 | 18 | 0 |
| AI_OUTPAINTING | 智能扩图 | 25 | 20 | 24 | 0 |
| FIX_COLOR | 修复色差 | 26 | 26 | 0 | 0 |
| NEW_REPLACE_BG_V2 | 换背景V2 | 28 | 28 | 0 | 0 |
| PRINTING_REPAIR | 印花修复 | 29 | 30 | 0 | 0 |
| IMAGE_TO_VIDEO | 图生视频 | 30 | 26 | 10 | 9 |
| HAND_REPAIR | 手部修复 | 31 | 27 | 0 | 0 |
| AREA_REPAIR | 局部重绘 | 32 | 28 | 0 | 0 |
| AI_WEARABLE | AI穿戴 | 34 | 1 | 22 | 0 |
| AI_DRESSING_XSY | AI试衣XSY | 39 | 39 | 0 | 0 |
| IMAGE_TRANSLATION | 图片翻译 | 45 | 45 | 0 | 0 |
| HANDHELD_GOODS | 手持商品 | 49 | 49 | 1 | 0 |
| VIDEO_CONCAT | 视频拼接 | 52 | 52 | 0 | 0 |
| PRODUCT_REFINE | 商品精修 | 56 | 56 | 0 | 0 |
| AI_POSE_GENERATOR | AI姿势生成 | 57 | 57 | 0 | 0 |
| AI_POSTURE | AI摆姿 | 58 | 58 | 1 | 1 |
| PRINT_EXTRACT | 印花提取 | 60 | 60 | 0 | 0 |
| SCENE_TRANSFER | 场景迁移 | 63 | 62 | 0 | 0 |
| PRODUCT_MARKET_MATERIAL | 爆款图复刻 | 64 | 64 | 0 | 0 |
| IMAGE_CROP | 图片裁剪 | 67 | 67 | 0 | 0 |
| DRESS_WEAR_SET | 穿搭套装 | 69 | 69 | 51 | 12 |
| PRODUCT_IMAGE_SUITE | 商品套图 | 71 | 71 | 42 | 15 |
| SALE_VIDEO | 带货视频 | 73 | 73 | 10 | 10 |
| IMAGE_TEXT_EDIT | 图片文字编辑 | 78 | 78 | 0 | 0 |
| FISSION_LINK | 场景裂变 | 83 | 83 | 0 | 0 |
| VIDEO_REPLICATION | 视频复刻 | 89 | 89 | 8 | 8 |
| CHANGE_COLOR_V2 | 套图换色V2 | 93 | 811 | 13 | 0 |
| AI_VIDEO_EDITING | AI视频剪辑 | 95 | 95 | 8 | 5 |
| VIDEO_TRANSLATION | 视频翻译 | 96 | 814 | 8 | 0 |
| NEW_DESIGNER | 商品图设计 | 99 | 99 | 0 | 0 |
## 5. Tool-to-Category Mapping

**Mapping Method**: Analyzed tool names, routes, and functional similarity

**Certainty Level**: ⚠️ This mapping is **inferred** from naming patterns and route structure. 
Actual LinkFox internal categorization may differ.


### 电商套图

| Tool ID | Chinese Name | Type | Biz | Status |
|---------|--------------|------|-----|--------|
| PRODUCT_IMAGE_SUITE | 商品套图 | 71 | 71 | ✓ |
| CLOTHING_IMAGE_SUITE | *Not in coverage* | - | - | ? |
| PRODUCT_SCENE | 商品场景图 | 13 | 1 | ✓ |
| CHANGE_COLOR | 套图换色 | 19 | 1 | ✓ |
| CHANGE_COLOR_V2 | 套图换色V2 | 93 | 811 | ✓ |
| DRESS_WEAR_SET | 穿搭套装 | 69 | 69 | ✓ |

### 智能修图

| Tool ID | Chinese Name | Type | Biz | Status |
|---------|--------------|------|-----|--------|
| SMART_REPAIR | *Not in coverage* | - | - | ? |
| AREA_REPAIR | 局部重绘 | 32 | 28 | ○ |
| REMOVE_PEN | 消除笔 | 23 | 17 | ○ |
| HAND_REPAIR | 手部修复 | 31 | 27 | ○ |
| FIX_COLOR | 修复色差 | 26 | 26 | ○ |
| PRINTING_REPAIR | 印花修复 | 29 | 30 | ○ |
| PRODUCT_REFINE | 商品精修 | 56 | 56 | ○ |
| IMAGE_CROP | 图片裁剪 | 67 | 67 | ○ |
| SCALE_UP | 高清放大 | 7 | 7 | ○ |
| AI_OUTPAINTING | 智能扩图 | 25 | 20 | ✓ |

### AI视频

| Tool ID | Chinese Name | Type | Biz | Status |
|---------|--------------|------|-----|--------|
| IMAGE_TO_VIDEO | 图生视频 | 30 | 26 | ✓ |
| SALE_VIDEO | 带货视频 | 73 | 73 | ✓ |
| VIDEO_REPLICATION | 视频复刻 | 89 | 89 | ✓ |
| VIDEO_CONCAT | 视频拼接 | 52 | 52 | ○ |
| AI_VIDEO_EDITING | AI视频剪辑 | 95 | 95 | ✓ |
| VIDEO_TRANSLATION | 视频翻译 | 96 | 814 | ✓ |

### 批量生图

| Tool ID | Chinese Name | Type | Biz | Status |
|---------|--------------|------|-----|--------|
| BATCH_GENERATE_IMAGES | *Not in coverage* | - | - | ? |

### 商品图设计

| Tool ID | Chinese Name | Type | Biz | Status |
|---------|--------------|------|-----|--------|
| NEW_DESIGNER | 商品图设计 | 99 | 99 | ○ |
| SDS_DESIGN | SDS设计 | 22 | 16 | ✓ |
| PRODUCT_GENERATION | *Not in coverage* | - | - | ? |
| PRODUCT_MARKET_MATERIAL | 爆款图复刻 | 64 | 64 | ○ |
| FISSION_LINK | 场景裂变 | 83 | 83 | ○ |
| SCENE_TRANSFER | 场景迁移 | 63 | 62 | ○ |

### Ambiguous/Uncategorized Tools (16 tools)

**These tools don't clearly map to the 5 main categories**:

| Tool ID | Chinese Name | Type | Biz | Notes |
|---------|--------------|------|-----|-------|
| REPLACE_GOODS | 换商品 | 12 | 1 | Specialized/utility |
| AI_DRESSING_V2 | AI试衣V2 | 24 | 24 | Specialized/utility |
| AI_WEARABLE | AI穿戴 | 34 | 1 | Specialized/utility |
| AI_DRESSING_XSY | AI试衣XSY | 39 | 39 | Specialized/utility |
| AI_POSTURE | AI摆姿 | 58 | 58 | Specialized/utility |
| AI_POSE_GENERATOR | AI姿势生成 | 57 | 57 | Specialized/utility |
| HANDHELD_GOODS | 手持商品 | 49 | 49 | Specialized/utility |
| MATERIAL_UPPER_BODY | 上装换料 | 16 | 1 | Specialized/utility |
| NEW_REPLACE_BG_V2 | 换背景V2 | 28 | 28 | Specialized/utility |
| AI_TEXT | AI文字 | 14 | 1 | Specialized/utility |
| ORNAMENT_TEXT | 装饰文字 | 17 | 15 | Specialized/utility |
| IMAGE_TRANSLATION | 图片翻译 | 45 | 45 | Specialized/utility |
| PRINT_EXTRACT | 印花提取 | 60 | 60 | Specialized/utility |
| IMAGE_TEXT_EDIT | 图片文字编辑 | 78 | 78 | Specialized/utility |
## 6. Route Structure Analysis

**Evidence Source**: `analysis-linkfox-20261027/routes.txt`

**Total Routes**: 96
**Routes under `/draw/*`**: 57 (tool pages)


**Key Route Patterns**:

- **Product/Suite**: 9 routes
  - `/draw/clothing-image-suite`
  - `/draw/hand-product`
  - `/draw/product-generation`
  - ... and 6 more
- **Repair/Edit**: 8 routes
  - `/draw/area-repair`
  - `/draw/batch-matting`
  - `/draw/color-diff-repair`
  - ... and 5 more
- **Video**: 9 routes
  - `/draw/ai-video-edit`
  - `/draw/batch-generate-videos`
  - `/draw/inspiration-video`
  - ... and 6 more
- **Batch**: 6 routes
  - `/draw/batch-generate-images`
  - `/draw/batch-generate-images/create-task/:type?`
  - `/draw/batch-generate-images/create-task/draft/:type/:id?`
  - ... and 3 more
- **Design**: 6 routes
  - `/draw/designer-home`
  - `/draw/my-design`
  - `/draw/product-scene`
  - ... and 3 more

**External Links**:
- `https://os.linkfox.com/` - OS platform
- `https://os.linkfox.com/claw` - Claw tool
- `https://skill.linkfox.com/` - Skills platform

## 7. Existing infinite-canvas Navigation Architecture

**Key Files Identified**:

| File Path | Purpose | Notes |
|-----------|---------|-------|
| `web/src/constant/navigation-tools.ts` | Navigation config | Defines 6 current nav items: canvas, image, video, prompts, assets, config |
| `web/src/router.tsx` | Route definitions | BrowserRouter with 7 routes + UserLayout wrapper |
| `web/src/components/layout/app-top-nav.tsx` | Top navigation bar | 98 lines, uses navigationTools config, includes agent toggle |
| `web/src/components/layout/mobile-nav-drawer.tsx` | Mobile navigation | Drawer for mobile responsive nav |
| `web/src/components/canvas/canvas-context-menu.tsx` | Canvas context menu | Right-click menu in canvas |
| `web/src/components/canvas/canvas-create-menus.tsx` | Canvas create menu | Creation tools dropdown |

**Current Navigation Structure**:

```typescript
// From web/src/constant/navigation-tools.ts
export const navigationTools = [
  { slug: 'canvas', icon: Maximize2 },
  { slug: 'image', icon: ImagePlus },
  { slug: 'video', icon: Video },
  { slug: 'prompts', icon: FileText },
  { slug: 'assets', icon: Images },
  { slug: 'config', icon: Settings2 },
]
```

**Reusable Components**:
- `AppTopNav`: Main navigation bar with responsive layout
- `MobileNavDrawer`: Mobile slide-out menu
- `UserStatusActions`: User profile/auth actions
- `AppConfigModal`: Settings modal
- Uses Ant Design components: `Button`, `Tooltip`, `Menu`
- Uses lucide-react icons
- Route detection via `useLocation()` from react-router-dom

## 8. Uncertainties and Missing Evidence

**Items requiring clarification or further investigation**:


### Exact tool-to-category mapping
- **Issue**: The 5-category grouping is inferred from naming patterns. LinkFox's internal categorization system is not directly exposed in DOM/routes.
- **Impact**: High - affects navigation structure design

### Skills vs Agent classification
- **Issue**: 'Skills' links to external domain (skill.linkfox.com), 'Agent' appears to be in-app feature. Neither clearly map to tool categories.
- **Impact**: Medium - affects top nav count and organization

### '新模型' (New Model) purpose
- **Issue**: Appears in top nav between 智能修图 and AI视频, but unclear if it's a category, filter, or promotional tag.
- **Impact**: Medium - could be a temporary promotional item

### Batch tools categorization
- **Issue**: 批量生图 has dedicated top nav position but appears in sidebar under '企业功能'. Multiple batch tools exist (batch-matting, batch-videos).
- **Impact**: Medium - enterprise vs consumer feature distinction

### Deprecated/下架 tools
- **Issue**: Sidebar shows '即将下架' and '下架' tags (e.g., 手部修复). Unclear if these should be included in new navigation.
- **Impact**: Low - can filter during implementation

### Mobile navigation differences
- **Issue**: Only extracted desktop DOM. Mobile layout may have different prioritization or grouping.
- **Impact**: Low - can reference existing mobile-nav-drawer.tsx pattern

### Route parameter patterns
- **Issue**: Some routes have dynamic segments (e.g., /draw/batch-generate-images/create-task/:type?). Full routing logic not analyzed.
- **Impact**: Low - implementation detail

## 9. Evidence Summary

**Data Sources Analyzed**:

- ✓ `docs/V1.0/plan_linkfox_navigation/evidence/linkfox_home_dom.json` - Home page DOM structure
- ✓ `docs/V1.0/plan_linkfox_navigation/evidence/linkfox_tool_dom.json` - Tool page with left sidebar
- ✓ `docs/analysis/assets/linkfox/tool_types_and_coverage.json` - 39 tools with type/coverage data
- ✓ `linkfox-deep-20261027/tools_final.json` - Tool biz field and chunk mappings
- ✓ `linkfox-deep-20261027/schema_flat.json` - Schema structure (tool-keyed)
- ✓ `analysis-linkfox-20261027/routes.txt` - 96 routes including 57 /draw/* routes
- ✓ `web/src/constant/navigation-tools.ts` - Current infinite-canvas nav config
- ✓ `web/src/router.tsx` - Current routing structure
- ✓ `web/src/components/layout/app-top-nav.tsx` - Existing nav component implementation

**Verification Methods**:
- Parsed Python dict syntax for DOM JSON files using `ast.literal_eval`
- Cross-referenced tool IDs across 3 data sources (coverage JSON, tools_final, routes)
- Extracted layout positions and CSS classes from landmarks array
- Analyzed route patterns for functional grouping
- Compared with existing infinite-canvas navigation architecture

## 10. Key Findings

**Five Primary Navigation Categories** (verified in DOM):
1. **电商套图** - E-commerce image suites (~6-7 related tools)
2. **智能修图** - Smart editing/repair (~10 related tools)
3. **AI视频** - Video generation/editing (~6 related tools, HOT badge)
4. **批量生图** - Batch image generation (1 primary tool, enterprise feature)
5. **商品图设计** - Product design tools (~6 related tools)

**Navigation Architecture**:
- **Top bar**: 11 items (5 categories + home/skills/agent/more)
- **Left sidebar**: Hierarchical tool menu with group headers
- **Layout**: Fixed top bar (h-14), 180px left sidebar, responsive design
- **Technology**: React Router, Ant Design Menu, lucide-react icons

**Implementation Notes**:
- Existing infinite-canvas has 6 nav items; LinkFox pattern suggests 5-7 category structure is optimal
- Current `navigation-tools.ts` pattern can be extended with category grouping
- `app-top-nav.tsx` already handles active state detection and responsive layout
- Consider adding badge/tag support (HOT, NEW) for promotional items
- Tools marked '下架' (deprecated) should be filtered from new navigation

---

**Report Generation**: 2026-10-27

**Status**: ✅ Evidence collection complete

**Next Steps** (not in scope of this exploration):
- Finalize 5-category structure with product team
- Design navigation UI mockups
- Implement extended navigation-tools config
- Add category-based routing
- Create tool subcategory components