# TASK-009 notes (DRESS_WEAR_SET, 服装套图)

repo: /Users/mac/Documents/Dev/infinite-canvas (branch feat/linkfox-v1-real), web app in ./web
Allowed files (my scope): registry/dress-wear-set.ts, adapters/dress-wear-set.ts, adapters/dress-wear-set.test.ts, components/tools/workspaces/dress-suite.tsx

## Status
- registry/dress-wear-set.ts: DONE (limits, scene options+catalog, providers, zod schema, helpers)
- adapters/dress-wear-set.ts: DONE core (values/normalize/validate/units/prompt/input/references/grouping/summary/stale) — typecheck clean
- adapters/dress-wear-set.test.ts: DONE — 26 pass / 0 fail (bun test)
- components/tools/workspaces/dress-suite.tsx: TODO

## Env pitfalls
- `npx`/`bun` not in PATH: use `zsh -lc` and `~/.bun/bin/bun`
- typecheck: `zsh -lc 'cd web && npx tsc --noEmit'` (pre-existing unrelated error in change-color-v2.test.ts:448)
- react-router 7, react 19, tailwind v4, zod v4 (no z.record with 1 arg)

## Verified platform facts
- gateway submit: submitTool(input: BrowserToolInput, options?: SubmitOptions) => Promise<ToolTask>; BrowserToolInput = ToolAdapterInput & {toolId}
- ToolAdapterInput: prompt?, references?: ReferenceImage[], videos?, audios?, model?, size?, quality?, count?, fields?: Record<string,unknown>?
- ReferenceImage: {id,name,type,dataUrl,url?,storageKey?} (imageToDataUrl in @/services/image-storage resolves from storageKey/url)
- ToolTask fields: id,toolId,status,clientOperationId,fingerprint,capability,prompt,configSnapshot,sourceAssetIds,createdAt,updatedAt,attempts,pollCount,transientFailures,result?,error?,draftRevision?
- ToolTaskResultItem: {id,kind,dataUrl?,url?,mimeType?,bytes?,blob?}
- ToolAssetRecord: {id,kind,name,storageKey,url,bytes,mimeType,width?,height?,durationMs?,createdAt}
- ToolAssetInput props: {toolId, constraints?, maxCount?, library?, disabled?, title?, className?, onChange?(assetIds, records)}
- draft: useToolDraftStore.patch(toolId,{values,assetIds,revision?}) / hydrate(toolId)
- config store: useConfigStore((s)=>s.config) => AiConfig; selectableModelsByCapability(config,"image"), modelOptionLabel(config,value)
- existing suites: adapters/product-image-suite.ts (runSuite/groupSuiteUnits/saveSuiteResultItem) — pattern reference only
