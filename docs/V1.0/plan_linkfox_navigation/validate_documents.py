from pathlib import Path
import json,re,hashlib,sys
D=Path(__file__).resolve().parent
s=json.loads((D/'tool_specs.json').read_text()); tools=s['tools']; ids={t['id'] for t in tools}
checks={
 '39_unique':len(tools)==len(ids)==39,
 'origin_30_9':(sum(t['origin']=='original' for t in tools),sum(t['origin']=='supplemental' for t in tools))==(30,9),
 'unique_routes':len({t['route'] for t in tools})==39,
 'four_primary_plus_batch':set(t['category'] for t in tools)=={'suite','edit','design','video'} and len(s['batchReferences'])==12,
}
for f,prefix in [('prd.md','REQ-T'),('ui_brief.md','UI-T'),('technical_design.md','TECH-T')]:
 text=(D/f).read_text()
 checks[f+'_39_sections']=len(re.findall(r'^### '+prefix,text,re.M))==39
 checks[f+'_all_ids']=all(t['id'] in text for t in tools)
 if f=='ui_brief.md':
  checks['ui_layout_component_interaction_color']=all(all(k in b for k in ['**布局**','**组件**','**交互/状态**','**配色/风格**']) for b in re.split(r'^### UI-T',text,flags=re.M)[1:])
broken=[]
for f in D.glob('*.md'):
 for link in re.findall(r'\[[^]]*\]\(([^)]+)\)',f.read_text()):
  if not re.match(r'https?://|#|/',link) and not (f.parent/link).exists(): broken.append((f.name,link))
checks['links_not_broken']=not broken
q=(D/'task_list.md').read_text(); task_rows=re.findall(r'^\| (TASK-[0-9A-Z]+) .*?\| (\d+) \| BACKLOG \|$',q,re.M); sizes=[int(n) for _,n in task_rows]; task_ids=[x for x,_ in task_rows]
checks['no_task_over_350']=bool(sizes) and max(sizes)<=350
checks['task_ids_contiguous']=task_ids==['TASK-001','TASK-002A','TASK-002B']+[f'TASK-{i:03d}' for i in range(3,51)]
checks['tool_tasks_39']=sum(t['id'] in q for t in tools)==39
tc_text=(D/'test_cases.md').read_text(); ac_text=(D/'acceptance.md').read_text()
checks['64_tc_64_ac']=len(re.findall(r'^\| TC-',tc_text,re.M))==len(re.findall(r'^\| AC-',ac_text,re.M))==64
checks['all_tc_referenced_by_ac']=all(f'TC-{i:03d}' in ac_text for i in range(1,65))
checks['independent_r2_pass']=all('VERDICT: PASS' in (D/f).read_text() for f in ['review_product_ui_r2.md','review_technical_test_r2.md'])
files=['tool_specs.json','prd.md','ui_brief.md','technical_design.md','test_cases.md','acceptance.md','task_list.md']
report={'status':'PASS' if all(checks.values()) else 'FAIL','checks':checks,'broken_links':broken,'sha256':{f:hashlib.sha256((D/f).read_bytes()).hexdigest() for f in files},'counts':{'tools':39,'tests':len(re.findall(r'^\| TC-',(D/'test_cases.md').read_text(),re.M)),'acceptance':len(re.findall(r'^\| AC-',(D/'acceptance.md').read_text(),re.M)),'tasks':len(sizes)},'code_modified':False}
(D/'document_validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False,indent=2));sys.exit(0 if report['status']=='PASS' else 1)
