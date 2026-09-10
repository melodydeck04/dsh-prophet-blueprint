window.__ModuleLoader__.load({
	id: "@dsh-plugins/design-blueprint",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");
		const { createElement: h, useEffect, useMemo, useState } = React;
		const CLIENT_VERSION = "0.22.0";
		const FEATURE_SOURCE = "blueprint-feature";
		const PUBLIC_STAGES = ["refining", "ready", "implementing", "verifying", "blocked", "completed"];

		const css = `
.bp-root{height:100%;overflow:auto;background:#f5f6f8;color:#20242a;font:13px/1.5 ui-sans-serif,system-ui,sans-serif}.bp-shell{max-width:1500px;margin:0 auto;padding:20px}
.bp-head,.bp-actions,.bp-meta,.bp-tabs{display:flex;gap:9px;align-items:center;flex-wrap:wrap}.bp-head{justify-content:space-between;align-items:flex-start}.bp-title{margin:0;font-size:25px}.bp-path,.bp-muted{color:#68707c}.bp-version{font-size:12px;color:#2563eb;margin-left:8px}
.bp-button,.bp-tab,.bp-select,.bp-search{border:1px solid #cfd5dd;background:#fff;border-radius:7px;padding:7px 10px;color:inherit}.bp-button,.bp-tab{cursor:pointer}.bp-button.primary,.bp-tab.active{background:#1f62d0;border-color:#1f62d0;color:#fff}.bp-button:disabled{opacity:.55}.bp-search{min-width:210px}
.bp-alert,.bp-notice{border-radius:7px;padding:10px 12px;margin:10px 0}.bp-alert{background:#fff0f0;color:#9e2424}.bp-notice{background:#eef6ff;color:#174a88}.bp-tabs{margin:14px 0}
.bp-grid{display:grid;grid-template-columns:minmax(300px,390px) minmax(0,1fr);gap:14px}.bp-panel{background:#fff;border:1px solid #dfe3e8;border-radius:10px;padding:15px;box-shadow:0 1px 2px #00000008}.bp-panel h2,.bp-panel h3{margin:0 0 10px}
.bp-tree{max-height:72vh;overflow:auto}.bp-node{display:block;width:100%;text-align:left;border:0;border-radius:7px;background:transparent;padding:8px;cursor:pointer}.bp-node:hover{background:#f4f7fb}.bp-node.active{background:#eaf2ff;color:#174a88}.bp-node-row{display:flex;align-items:center;gap:7px}.bp-node-title{font-weight:650;min-width:0;overflow:hidden;text-overflow:ellipsis}.bp-node-id{font-size:11px;color:#727985;overflow:hidden;text-overflow:ellipsis}
.bp-badge{display:inline-block;border:1px solid #d7dce3;border-radius:999px;padding:2px 7px;background:#f9fafb;font-size:11px}.bp-badge.completed{color:#16704a}.bp-badge.blocked{color:#a23b32}.bp-badge.implementing,.bp-badge.verifying{color:#875000}.bp-section{border-top:1px solid #e7e9ed;padding-top:13px;margin-top:13px}.bp-doc{border:1px solid #e0e4ea;border-radius:8px;padding:12px;margin-top:10px;max-height:52vh;overflow:auto}.bp-plain-text{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;line-height:1.6;white-space:pre-wrap;word-break:break-word;color:#20242a;margin:0;padding:0;background:transparent;border:0;max-height:52vh;overflow:auto;font-weight:normal;letter-spacing:0}.bp-fallback{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;line-height:1.55;white-space:pre-wrap;word-break:break-word;color:#20242a;margin:0;padding:0;background:transparent;border:0;max-height:52vh;overflow:auto;font-weight:normal;letter-spacing:0}.bp-command{background:#171b22;color:#e9edf3;border-radius:7px;padding:10px 12px;overflow:auto;user-select:all}.bp-table{width:100%;border-collapse:collapse}.bp-table th,.bp-table td{border-bottom:1px solid #e4e7eb;text-align:left;padding:7px;vertical-align:top}.bp-list{margin:7px 0;padding-left:19px}.bp-doc-button{display:block;width:100%;text-align:left;margin:5px 0;border:1px solid #e1e4e8;background:#fff;border-radius:6px;padding:8px;cursor:pointer}.bp-empty{padding:22px;text-align:center;color:#6f7782}
@media(max-width:850px){.bp-grid{grid-template-columns:1fr}.bp-head{display:block}.bp-actions{margin-top:10px}}
`;

		async function callApi(payload) {
			const response = await fetch("/design-blueprint/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
			const result = await response.json();
			if (!result.ok) { const error = new Error(result.error?.message || "Blueprint request failed"); error.code = result.error?.code; throw error; }
			return result.value;
		}

		function commandHint(feature) {
			return feature ? `/blueprint @feature:${feature.id} 描述你的需求` : "/blueprint 描述你的需求";
		}

		function featureChildren(features) {
			const rows = new Map();
			for (const feature of features) { const key = feature.parentId || ""; if (!rows.has(key)) rows.set(key, []); rows.get(key).push(feature); }
			for (const list of rows.values()) list.sort((a,b)=>a.title.localeCompare(b.title));
			return rows;
		}

		function FeatureTree({ features, selectedId, onSelect }) {
			const children = useMemo(()=>featureChildren(features),[features]);
			const render = (feature, depth) => h("div",{key:feature.id},
				h("button",{className:`bp-node${selectedId===feature.id?" active":""}`,style:{paddingLeft:`${8+depth*18}px`},onClick:()=>onSelect(feature.id)},
					h("div",{className:"bp-node-row"},h("span",null,(children.get(feature.id)||[]).length?"▾":"·"),h("span",{className:"bp-node-title"},feature.title),h("span",{className:`bp-badge ${feature.workflow.stage}`},feature.workflow.stage)),
					h("div",{className:"bp-node-id"},feature.id)),
				...(children.get(feature.id)||[]).map((child)=>render(child,depth+1)));
			return h("div",{className:"bp-tree"},...(children.get("")||[]).map((feature)=>render(feature,0)));
		}

		// DSH Web's `MarkdownText` component requires `{text, streaming, labels,
		// fileMentions}` props. We do not have access to the page's locale
		// dictionary, so passing only `text` makes the renderer reach
		// `i.labels.code.copyLabel` with `i.labels` undefined, which throws
		// "Cannot read properties of undefined (reading 'code')" inside its
		// code block useMemo. We avoid the issue entirely by rendering the
		// raw text in a styled <pre> block; the Blueprint feature brief and
		// document viewers are read-oriented, so the loss of inline markdown
		// formatting is acceptable until we wire up a labels dictionary.
		function PlainText({ text }) {
			return h("pre", { className: "bp-plain-text" }, text || "");
		}
		function DocumentViewer({ cwd, sessionId, dshWorkspacePath, dshWorkspaceTitle, feature, file, onClose, setError }) {
			const [document,setDocument]=useState(null);
			useEffect(()=>{let alive=true;setDocument(null);callApi({action:"document",cwd,sessionId,dshWorkspacePath,dshWorkspaceTitle,featureId:feature.id,file}).then((value)=>{if(alive)setDocument(value);}).catch((error)=>setError(error.message));return()=>{alive=false;};},[cwd,sessionId,dshWorkspacePath,dshWorkspaceTitle,feature.id,file]);
			return h("section",{className:"bp-panel"},h("div",{className:"bp-head"},h("div",null,h("h2",null,"文档详情"),h("div",{className:"bp-path"},file)),h("button",{className:"bp-button",onClick:onClose},"返回 Feature")),document?h("div",{className:"bp-doc"},h(PlainText,{text:document.content})):h("div",{className:"bp-empty"},"正在读取文档…"));
		}

		function FeatureDetail({ cwd, sessionId, dshWorkspacePath, dshWorkspaceTitle, feature, features, components, applyDashboard, setNotice, setError, openDocument }) {
			const [language,setLanguage]=useState("zh");
			const [busy,setBusy]=useState(false);
			const [receipt,setReceipt]=useState(null);
			const parent=features.find((entry)=>entry.id===feature.parentId)||null;
			const children=features.filter((entry)=>entry.parentId===feature.id);
			const related=components.filter((entry)=>entry.supportedFeatures.includes(feature.id));
			const dependencies=[...new Set(related.flatMap((entry)=>entry.dependencies.map((dependency)=>`${dependency.relation}:${dependency.target}`)))];
			const codePaths=[...new Set([...feature.scope,...related.flatMap((entry)=>entry.ownedPaths)])];
			const tests=codePaths.filter((entry)=>entry.startsWith("tests/")||entry.includes("test"));
			const contracts=[...new Set(related.flatMap((entry)=>entry.contracts))];
			const brief=feature.artifacts?.brief?.[language];
			const approve=async()=>{if(!feature.workflow.spec||!window.confirm(`确认批准并继续精确哈希 ${feature.workflow.spec.hash}？`))return;setBusy(true);setError("");try{const result=await callApi({action:"approve-and-begin",cwd,sessionId,dshWorkspacePath,dshWorkspaceTitle,featureId:feature.id,expectedSpecHash:feature.workflow.spec.hash});applyDashboard(result.dashboard);setReceipt(result.receipt);const delivery=result.receipt?.chatDelivery?.status;setNotice(delivery==="unavailable"?"Spec 已批准并开始实现；当前 Chat 不在线，未投递续接消息。":delivery==="queued"?"Spec 已批准并开始实现；续接已排入当前 Chat。":"Spec 已批准并开始实现；已向当前 Chat 发送续接消息。");}catch(error){setError(error&&typeof error==="object"?error.message:String(error));}finally{setBusy(false);}};
			const workflowContext=feature.workflow.context;
			return h("section",{className:"bp-panel"},
				h("div",{className:"bp-head"},h("div",null,h("h2",null,feature.title),h("div",{className:"bp-path"},feature.id)),h("span",{className:`bp-badge ${feature.workflow.stage}`},feature.workflow.stage)),
				h("p",null,feature.summary||"尚未填写摘要。"),
				workflowContext?h("div",{className:"bp-section"},h("h3",null,"当前工作包"),h("p",null,`阶段：${workflowContext.currentStage}`),h("p",null,`允许动作：${workflowContext.allowedActions.join(", ")||"仅查看"}`),h("p",null,`下一动作：${workflowContext.nextRequiredAction||"已完成"}`)):null,
				h("div",{className:"bp-meta"},parent?h("span",{className:"bp-badge"},`父级 · ${parent.title}`):h("span",{className:"bp-badge"},"根 Feature"),h("span",{className:"bp-badge"},`子级 · ${children.length}`),h("span",{className:"bp-badge"},`文档 · ${feature.documents.length}`)),
				h("div",{className:"bp-section"},h("h3",null,"当前行为"),h("div",{className:"bp-actions"},h("button",{className:`bp-tab${language==="zh"?" active":""}`,onClick:()=>setLanguage("zh")},"中文"),h("button",{className:`bp-tab${language==="en"?" active":""}`,onClick:()=>setLanguage("en")},"English")),brief?.exists?h("div",{className:"bp-doc"},h(PlainText,{text:brief.content})):h("p",{className:"bp-muted"},"当前语言的 Feature brief 尚未登记。")),
				h("div",{className:"bp-section"},h("h3",null,"层级、依赖与实现"),h("table",{className:"bp-table"},h("tbody",null,
					h("tr",null,h("th",null,"父级 / 子级"),h("td",null,`${parent?.id||"—"} / ${children.map((entry)=>entry.id).join(", ")||"—"}`)),
					h("tr",null,h("th",null,"技术依赖"),h("td",null,dependencies.join(", ")||"—")),
					h("tr",null,h("th",null,"主要代码"),h("td",null,codePaths.join(", ")||"—")),
					h("tr",null,h("th",null,"接口 / 契约"),h("td",null,contracts.join(", ")||"—")),
					h("tr",null,h("th",null,"测试"),h("td",null,tests.join(", ")||"由活动 Spec 的 Verification 声明"))))),
				h("div",{className:"bp-section"},h("h3",null,"活动变更与历史"),feature.workflow.spec?h("div",null,h("div",{className:"bp-meta"},h("span",{className:"bp-badge"},feature.workflow.spec.status),h("span",{className:"bp-badge"},feature.workflow.internalStage)),h("p",{className:"bp-hash"},feature.workflow.spec.hash),h("button",{className:"bp-doc-button",onClick:()=>openDocument(feature.workflow.spec.file)},feature.workflow.spec.file)):h("p",{className:"bp-muted"},"当前没有 Feature-linked 变更。"),(feature.workflow.stage==="refining"||feature.workflow.stage==="ready")&&feature.workflow.spec?.changePackage&&feature.workflow.approval?.specHash!==feature.workflow.spec.changePackage.lifecycle.specHash?h("button",{className:"bp-button primary",disabled:busy,onClick:approve},busy?"正在批准并继续…":"批准并继续"):null,receipt?h("p",{className:"bp-muted"},`实现 cycle · ${receipt.cycleId||"—"}；Chat 续接 · ${receipt.chatDelivery?.status||"未知"}`):null),
				h("div",{className:"bp-section"},h("h3",null,"登记文档"),...feature.documents.map((document)=>h("button",{key:document.path,className:"bp-doc-button",disabled:!document.exists,onClick:()=>openDocument(document.path)},`${document.level} · ${document.path}${document.exists?"":"（缺失）"}`))),
				h("div",{className:"bp-section"},h("h3",null,"在当前 DSH Chat 中工作"),h("pre",{className:"bp-command"},commandHint(feature)),h("p",{className:"bp-muted"},"页面选择仅用于浏览，不会改变 Chat 目标或授予写权限。")));
		}

		function ProjectAudit({data}){return h("section",{className:"bp-panel"},h("h2",null,"项目检查"),h("div",{className:"bp-meta"},h("span",{className:"bp-badge"},`required · ${data.audit.required}`),h("span",{className:"bp-badge"},`recommended · ${data.audit.recommended}`),h("span",{className:"bp-badge"},`Features · ${data.catalog.summary.total}`),h("span",{className:"bp-badge"},`Components · ${data.architecture.summary.total}`)),data.audit.issues.length?h("ul",{className:"bp-list"},data.audit.issues.map((entry,index)=>h("li",{key:index},`[${entry.severity}] ${entry.file}: ${entry.message}`))):h("p",null,"当前没有 Blueprint 扫描问题。"));}

				function workspaceFromSnapshot(snapshot,row,sessionId){
			const workspaceId=row?.workspaceId||row?.workspace?.id;
			const workspaces=snapshot?.tables?.workspaces||snapshot?.workspaces||snapshot?.workspaces?.byId||{};
			const direct=row?.workspace?.path?row.workspace:null;
			const byId=workspaceId&&workspaces[workspaceId]?workspaces[workspaceId]:null;
			if(direct||byId)return direct||byId;
			for(const workspace of Object.values(workspaces||{})){if(Array.isArray(workspace?.sessionIds)&&workspace.sessionIds.includes(sessionId))return workspace;}
			return null;
		}
		function sessionContext(ctx,sessionId){
			try{
				const snapshot=ctx?.sessions?.list?.getSnapshot?.();
				const row=snapshot?.byId?.[sessionId]||snapshot?.tables?.sessions?.[sessionId]||{};
				const workspace=workspaceFromSnapshot(snapshot,row,sessionId);
				return{sessionId:typeof sessionId==="string"?sessionId:"",cwd:row?.cwd||row?.identity?.cwd||"",dshWorkspacePath:row?.dshWorkspacePath||row?.workspacePath||workspace?.path||"",dshWorkspaceTitle:row?.dshWorkspaceTitle||row?.workspaceTitle||workspace?.title||""};
			}catch(err){
				console.warn("[design-blueprint] sessionContext read failed:",err?.message||err);
				return{sessionId:typeof sessionId==="string"?sessionId:"",cwd:"",dshWorkspacePath:"",dshWorkspaceTitle:""};
			}
		}
		class BlueprintErrorBoundary extends React.Component {
			constructor(props) { super(props); this.state = { error: null }; }
			static getDerivedStateFromError(error) { return { error }; }
			componentDidCatch(error, info) {
				// Surface the message but do NOT re-throw: the DSH Web shell
				// uses slot-level error boundaries that mask the underlying UI;
				// our boundary keeps BlueprintView alive even when a sibling
				// slot entry (DSH chat, trajectory) throws "code" reads during
				// the same render pass.
				console.warn("[design-blueprint] local render error caught:", error?.message || error, "stack:", error?.stack?.split("\n").slice(0, 3).join(" | "));
			}
			render() {
				if (this.state.error) {
					return h("div", { className: "bp-root" }, h("style", null, css), h("div", { className: "bp-shell" },
						h("div", { className: "bp-alert" }, `Blueprint 渲染失败: ${this.state.error?.message || String(this.state.error)}`),
					));
				}
				return this.props.children;
			}
		}
		function BlueprintView({cwd,sessionId,dshWorkspacePath,dshWorkspaceTitle}){
			const [data,setData]=useState(null),[setup,setSetup]=useState(null),[selectedId,setSelectedId]=useState(null),[view,setView]=useState("map"),[query,setQuery]=useState(""),[stage,setStage]=useState("all"),[selectedDocument,setSelectedDocument]=useState(null),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false),[projectPath,setProjectPath]=useState("");const requestContext=()=>({cwd,sessionId,dshWorkspacePath,dshWorkspaceTitle});
			const load=async()=>{if(!cwd&&!sessionId&&!dshWorkspacePath){setError("当前 DSH Session 没有项目或 workspace 线索。");return;}setError("");try{const next=await callApi({action:"dashboard",...requestContext()});setData(next);setSetup(null);setSelectedId((current)=>next?.catalog?.features?.some?.((entry)=>entry?.id===current)?current:next?.catalog?.features?.[0]?.id||null);}catch(cause){const safeCause=cause&&typeof cause==="object"?cause:{message:String(cause)};if(safeCause.code==="BLUEPRINT_PROJECT_NOT_FOUND"){try{setSetup(await callApi({action:"discover",...requestContext()}));}catch(next){setError(next instanceof Error?next.message:String(next));}}else setError(safeCause.message||"读取 Blueprint 失败");}finally{/* swallow any post-setState error to keep DSH slot alive */}};
			useEffect(()=>{setData(null);setSetup(null);setSelectedId(null);setSelectedDocument(null);void load().catch((err)=>console.warn("[design-blueprint] load rejected:",err?.message||err));},[cwd,sessionId,dshWorkspacePath,dshWorkspaceTitle]);
			useEffect(()=>{const onVisibility=()=>{if(document.visibilityState==="visible")void load().catch((err)=>console.warn("[design-blueprint] visibility reload rejected:",err?.message||err));};document.addEventListener("visibilitychange",onVisibility);return()=>document.removeEventListener("visibilitychange",onVisibility);},[cwd,sessionId,dshWorkspacePath,dshWorkspaceTitle]);
			const initialize=async()=>{const target=setup?.candidate?.path||setup?.manualCandidate?.path;if(!target)return;setBusy(true);try{const result=await callApi({action:"initialize",...requestContext(),target,confirmCurrentWorkspace:!setup?.candidate});setData(result.dashboard);setSetup(null);setSelectedId(result.dashboard.catalog.features[0]?.id||null);}catch(cause){setError(cause&&typeof cause==="object"?cause.message:String(cause));}finally{setBusy(false);}};const bindProject=async()=>{const target=projectPath.trim();if(!target){setError("请输入 Blueprint 项目路径。");return;}setBusy(true);setError("");try{const next=await callApi({action:"bind",...requestContext(),target});setData(next);setSetup(null);setSelectedId(next.catalog.features[0]?.id||null);setNotice(`已设置兜底项目：${next.project.root}`);}catch(cause){setError(cause&&typeof cause==="object"?cause.message:String(cause));}finally{setBusy(false);}};
			if(!data)return h("div",{className:"bp-root"},h("style",null,css),h("div",{className:"bp-shell"},error?h("div",{className:"bp-alert"},error):null,setup?h("section",{className:"bp-panel"},h("h2",null,"选择 Blueprint 项目"),h("p",null,`当前 DSH workspace：${setup.workspace?.title||setup.workspace?.path||dshWorkspacePath||"未暴露"}`),h("p",null,`当前 Session 路径：${setup.cwd||cwd||"未暴露"}`),h("p",null,`可初始化目标：${setup.candidate?.path||setup.manualCandidate?.path||"未发现项目"}`),h("div",{className:"bp-actions"},h("button",{className:"bp-button primary",disabled:busy||!(setup.candidate||setup.manualCandidate),onClick:initialize},busy?"正在初始化…":"初始化当前项目")),h("div",{className:"bp-section"},h("h3",null,"手动兜底项目"),h("div",{className:"bp-actions"},h("input",{className:"bp-search",value:projectPath,placeholder:"输入包含 design-blueprint.json 的路径",onChange:(event)=>setProjectPath(event.target.value)}),h("button",{className:"bp-button primary",disabled:busy,onClick:bindProject},busy?"正在绑定…":"设为手动兜底")))):h("div",{className:"bp-empty"},"正在读取 Blueprint…")));
			const needle=query.trim().toLowerCase();
			const filtered=(()=>{const all=data.catalog.features;const byId=new Map(all.map((feature)=>[feature.id,feature]));const visible=new Set(all.filter((feature)=>(stage==="all"||feature.workflow.stage===stage)&&(!needle||`${feature.id} ${feature.title} ${feature.summary}`.toLowerCase().includes(needle))).map((feature)=>feature.id));for(const id of [...visible]){let parent=byId.get(id)?.parentId;while(parent){visible.add(parent);parent=byId.get(parent)?.parentId;}}return all.filter((feature)=>visible.has(feature.id));})();
			const selected=data.catalog.features.find((entry)=>entry.id===selectedId)||null;
			const sidebar=h("aside",{className:"bp-panel"},
				h("h2",null,"Feature 层级"),
				h("div",{className:"bp-actions",style:{marginBottom:"10px"}},
					h("input",{className:"bp-search",value:query,placeholder:"搜索 Feature",onChange:(event)=>setQuery(event.target.value)}),
					h("select",{className:"bp-select",value:stage,onChange:(event)=>setStage(event.target.value)},h("option",{value:"all"},"全部状态"),...PUBLIC_STAGES.map((value)=>h("option",{key:value,value},value)))),
				h(FeatureTree,{features:filtered,selectedId,onSelect:(id)=>{setSelectedId(id);setSelectedDocument(null);}}));
			const detail=selectedDocument&&selected
				?h(DocumentViewer,{cwd,sessionId,dshWorkspacePath,dshWorkspaceTitle,feature:selected,file:selectedDocument,onClose:()=>setSelectedDocument(null),setError})
				:selected?h(FeatureDetail,{cwd,sessionId,dshWorkspacePath,dshWorkspaceTitle,feature:selected,features:data.catalog.features,components:data.architecture.components,applyDashboard:(next)=>{setData(next);setSelectedId((current)=>next?.catalog?.features?.some?.((entry)=>entry?.id===current)?current:next?.catalog?.features?.[0]?.id||null);},setNotice,setError,openDocument:setSelectedDocument})
				:h("section",{className:"bp-panel bp-empty"},"选择一个 Feature。");
			const body=view==="audit"?h(ProjectAudit,{data}):h("div",{className:"bp-grid"},sidebar,detail);
			return h("div",{className:"bp-root"},
				h("style",null,css),
				h("div",{className:"bp-shell"},
					h("header",{className:"bp-head"},
						h("div",null,
							h("h1",{className:"bp-title"},"Blueprint",h("span",{className:"bp-version"},`v${CLIENT_VERSION}`)),
							h("div",{className:"bp-path"},
								data.project.workspace?h("div",null,`DSH workspace · ${data.project.workspace.title||data.project.workspace.path}`):null,
								h("div",null,`Session cwd · ${data.project.sessionCwd||"未暴露"}`),
								h("div",null,`Blueprint root · ${data.project.root}`),
								data.project.bound?h("span",{className:"bp-version"},"manual fallback"):null
							),
							h("button",{className:"bp-button",onClick:load},"刷新")
						)
					),
					error?h("div",{className:"bp-alert"},error):null,
					notice?h("div",{className:"bp-notice"},notice):null,
					h("nav",{className:"bp-tabs"},
						h("button",{className:`bp-tab${view==="map"?" active":""}`,onClick:()=>{setView("map");setSelectedDocument(null);}},"系统地图"),
						h("button",{className:`bp-tab${view==="audit"?" active":""}`,onClick:()=>{setView("audit");setSelectedDocument(null);}},"项目检查")
					),
					body
				)
			);
		}

		function createFeatureSource(ctx){const cache=new Map(),listeners=new Map();const notify=(sessionId)=>{for(const listener of listeners.get(sessionId)||[])listener();};const warm=async(session)=>{const context=sessionContext(ctx,session.sessionId);if(!context.cwd&&!context.sessionId&&!context.dshWorkspacePath)return;try{const dashboard=await callApi({action:"dashboard",...context});cache.set(session.sessionId,dashboard.catalog.features);notify(session.sessionId);}catch{cache.set(session.sessionId,[]);notify(session.sessionId);}};return{trigger:"@",name:"Feature",order:15,showGroupTitle:true,warm(session){void warm(session);},async candidates(session,{query,signal}){if(!cache.has(session.sessionId))await warm(session);if(signal.aborted)return[];const needle=String(query||"").toLowerCase();return(cache.get(session.sessionId)||[]).filter((feature)=>!needle||`${feature.id} ${feature.title} ${feature.summary}`.toLowerCase().includes(needle)).map((feature)=>({name:feature.title,description:`${feature.id} · ${feature.summary}`,value:feature.id}));},onPick({candidate}){return{insert:{source:FEATURE_SOURCE,ref:candidate.value,label:candidate.name,clipboardText:`@feature:${candidate.value}`}};},lexicon(session){return cache.get(session.sessionId)?.map((feature)=>`feature:${feature.id}`);},subscribeLexicon(session,listener){const rows=listeners.get(session.sessionId)||new Set();rows.add(listener);listeners.set(session.sessionId,rows);return()=>rows.delete(listener);},codec:{clipboardText:(ref)=>`@feature:${ref}`,async serialize(ref){return`@feature:${ref}`;}}};}

		const inject=["slots","sessions","inputTriggers"];
		function apply(ctx){
			ctx.inputTriggers.registerSource(createFeatureSource(ctx));
			ctx.slots.inject("conversation.view",()=>ctx.slots.register({name:"conversation.view",id:"blueprint",order:20,label:()=>"Blueprint",inject:(sessionId)=>{try{return sessionContext(ctx,sessionId);}catch(err){console.warn("[design-blueprint] sessionContext failed, using empty context:",err?.message||err);return{sessionId:typeof sessionId==="string"?sessionId:"",cwd:"",dshWorkspacePath:"",dshWorkspaceTitle:""};}}},(props)=>h(BlueprintErrorBoundary,null,h(BlueprintView,props))));
		}
		exports.apply=apply;exports.inject=inject;exports.callApi=callApi;exports.commandHint=commandHint;exports.createFeatureSource=createFeatureSource;exports.sessionContext=sessionContext;
		return module.exports;
	}
});

