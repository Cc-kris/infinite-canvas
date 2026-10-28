import spec from "/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/tool_specs.json";
import { toolNavigationCategories, toolNavigationItems, getCategoryMenuTools, getBatchNavigationTools, batchNavigationToolIds, TOOL_NAVIGATION_COUNT, resolveToolNavigation } from "/Users/mac/Documents/Dev/infinite-canvas/web/src/constant/navigation-tools";
import zh from "/Users/mac/Documents/Dev/infinite-canvas/web/src/i18n/locales/zh-CN.ts";
import en from "/Users/mac/Documents/Dev/infinite-canvas/web/src/i18n/locales/en-US.ts";

let fails = 0;
const ok = (cond: boolean, msg: string) => { if (!cond) { fails++; console.log("FAIL:", msg); } };

// 1 order + count
ok(JSON.stringify(toolNavigationCategories.map(c => c.slug)) === JSON.stringify(["ecommerce-suite","smart-edit","batch-generate","product-design","ai-video"]), "category order");
ok(toolNavigationItems.length === 39 && TOOL_NAVIGATION_COUNT === 39, `39 items, got ${toolNavigationItems.length}`);
ok(spec.tools.length === 39, "spec 39");

// 2 exact relationship vs spec
const byId = new Map(toolNavigationItems.map(i => [i.id, i]));
for (const t of spec.tools) {
  const item = byId.get(t.id);
  ok(!!item, `missing tool ${t.id}`);
  if (!item) continue;
  ok(item.category === t.categorySlug, `${t.id} category ${item.category} != ${t.categorySlug}`);
  ok(item.slug === t.slug, `${t.id} slug`);
  ok(item.route === t.route, `${t.id} route ${item.route} != ${t.route}`);
  ok(item.origin === t.origin, `${t.id} origin`);
  ok(item.batchCapable === t.batchCapable, `${t.id} batchCapable`);
}
// 3 no extras / no dupes
ok(new Set(toolNavigationItems.map(i => i.id)).size === 39, "unique ids");
ok(new Set(toolNavigationItems.map(i => i.route)).size === 39, "unique routes");
ok(toolNavigationItems.every(i => byId.has(i.id) && spec.tools.some((t: any) => t.id === i.id)), "no extra items");

// 4 category toolIds match actual membership
for (const c of toolNavigationCategories) {
  const members = toolNavigationItems.filter(i => i.category === c.slug).map(i => i.id);
  ok(JSON.stringify(members) === JSON.stringify(c.toolIds), `category ${c.slug} toolIds mismatch`);
}
// 5 batch references
const specBatch = spec.batchReferences?.map((b: any) => typeof b === "string" ? b : b.id) ?? [];
const batch = getBatchNavigationTools();
console.log("batch refs spec:", specBatch.length, "const:", batch.length);
ok(batch.length === 12, `batch refs 12, got ${batch.length}`);
ok(batch.every(b => b.batchCapable), "all batch refs batchCapable");
ok(toolNavigationItems.filter(i => i.batchCapable).length === 12, "12 batchCapable tools");

// 6 menu sizes
const sizes = toolNavigationCategories.map(c => [c.slug, getCategoryMenuTools(c.slug).length]);
console.log("menu sizes:", JSON.stringify(sizes));

// 7 i18n parity
const zhNav = (zh as any).toolsNav, enNav = (en as any).toolsNav;
ok(!!zhNav && !!enNav, "toolsNav block exists");
const ids = toolNavigationItems.map(i => i.id);
for (const id of ids) {
  ok(typeof zhNav.tools[id] === "string" && zhNav.tools[id].length > 0, `zh label ${id}`);
  ok(typeof enNav.tools[id] === "string" && enNav.tools[id].length > 0, `en label ${id}`);
  ok(zhNav.tools[id] !== enNav.tools[id], `labels differ ${id}`);
}
ok(Object.keys(zhNav.tools).length === 39 && Object.keys(enNav.tools).length === 39, "exactly 39 labels each");
for (const c of toolNavigationCategories) {
  ok(typeof zhNav.categories[c.slug] === "string" && typeof enNav.categories[c.slug] === "string", `category label ${c.slug}`);
  ok(typeof zhNav.categoryDescriptions[c.slug] === "string", `zh desc ${c.slug}`);
  ok(typeof enNav.categoryDescriptions[c.slug] === "string", `en desc ${c.slug}`);
  ok(c.labelKey === `toolsNav.categories.${c.slug}`, `labelKey ${c.slug}`);
  ok(c.descriptionKey === `toolsNav.categoryDescriptions.${c.slug}`, `descriptionKey ${c.slug}`);
}
// 8 resolve states
ok(resolveToolNavigation("/tools/product-design/new-designer").tool?.id === "NEW_DESIGNER", "resolve tool");
ok(resolveToolNavigation("/tools/batch-generate").category?.slug === "batch-generate", "resolve batch entry");
ok(resolveToolNavigation("/tools/batch-generate?mode=batch").category?.slug === "batch-generate", "resolve batch query");
ok(resolveToolNavigation("/canvas").category === undefined, "resolve non-tools");
ok(resolveToolNavigation("/tools/nope/x").category === undefined, "resolve unknown category");

// 9 legacy compat
import { navigationTools } from "/Users/mac/Documents/Dev/infinite-canvas/web/src/constant/navigation-tools";
ok(navigationTools[0].slug === "canvas" && navigationTools.length === 6, "legacy nav preserved");

console.log(fails === 0 ? "ALL CHECKS PASSED" : `${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
