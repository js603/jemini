import React, { useEffect, useMemo, useRef, useState } from "react";

/* ========== Firebase 초기화(옵션) ========== */
const firebaseConfig = {
    apiKey: "AIzaSyBNJtmpRWzjobrY556bnHkwbZmpFJqgPX8",
    authDomain: "text-adventure-game-cb731.firebaseapp.com",
    projectId: "text-adventure-game-cb731",
    storageBucket: "text-adventure-game-cb731.appspot.com",
    messagingSenderId: "1092941614820",
    appId: "1:1092941614820:web:5545f36014b73c268026f1"
};
(async () => {
    try {
        const { initializeApp, getApps } = await import("firebase/app");
        if (!getApps().length) initializeApp(firebaseConfig);
    } catch (_) { /* firebase 미설치 시 무시 */ }
})();

/* ========== LLM 키/모델(하드코딩) ========== */
// Gemini
const GEMINI_MAIN_KEY = "AIzaSyDC11rqjU30OJnLjaBFOaazZV0klM5raU8";      // main
const GEMINI_BACKUP_KEY = "AIzaSyAhscNjW8GmwKPuKzQ47blCY_bDanR-B84";    // backup
const GEMINI_MAIN_MODEL = "gemini-2.0-flash-lite";
const GEMINI_BACKUP_MODEL = "gemini-2.5-flash-lite";
// Groq
const GROQ_KEY = "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";
const GROQ_MODEL = "llama3-70b-8192";

/* ========== RNG (시드 고정) ========== */
function xmur3(str) { let h = 1779033703 ^ str.length; for (let i=0;i<str.length;i++){h=Math.imul(h^str.charCodeAt(i),3432918353); h=(h<<13)|(h>>>19);} return function(){h=Math.imul(h^(h>>>16),2246822507); h=Math.imul(h^(h>>>13),3266489909); return (h^=h>>>16)>>>0;};}
function mulberry32(a){ return function(){ let t=(a+=0x6d2b79f5); t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; }; }
function rngFromSeed(seed){ const h=xmur3(seed||String(Date.now()))(); return mulberry32(h); }

/* ========== 로컬 저장/프리셋 ========== */
const LS_CFG="camp_game_config_v1"; const LS_RUN="camp_game_run_v1";
const load=(k,fallback=null)=>{ try{const v=localStorage.getItem(k); return v?JSON.parse(v):fallback;}catch{return fallback;} };
const save=(k,v)=>localStorage.setItem(k, JSON.stringify(v));
function encodePreset(cfg){ try{ return btoa(unescape(encodeURIComponent(JSON.stringify(cfg)))); }catch{return "";} }
function decodePreset(code){ try{ return JSON.parse(decodeURIComponent(escape(atob(code)))); }catch{return null;} }

/* ========== 모바일 스타일 주입 ========== */
function AppStyles() {
    return (
        <style>{`
      .app { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 16px; padding: 16px; }
      .section { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
      .log { height: 260px; overflow: auto; padding-right: 6px; }
      .btn { padding: 10px 14px; border-radius: 10px; font-size: 14px; }
      .btn-ghost { padding: 10px 14px; border-radius: 10px; font-size: 14px; }
      .choices > div { transition: background 200ms; }

      @media (max-width: 860px) {
        .app { grid-template-columns: 1fr; gap: 12px; padding: 12px; }
        .section { padding: 10px; }
        .log { height: 180px; }
        .sticky-cta { position: sticky; bottom: 8px; z-index: 10; }
        .btn, .btn-ghost { width: 100%; padding: 14px 16px; font-size: 16px; }
        .choices > div { padding: 10px !important; }
      }
    `}</style>
    );
}

/* ========== 안전 복제 헬퍼 ========== */
function sclone(obj){
    if (typeof globalThis!=="undefined" && typeof globalThis.structuredClone==="function") return globalThis.structuredClone(obj);
    return JSON.parse(JSON.stringify(obj));
}

/* ========== 기본 프리셋 ========== */
const defaultConfig = {
    mode: "standard",
    season: "ruin",                // ruin | ice_age | sandstorm | plague
    difficulty: "standard",        // casual | standard | hard
    tempo: "normal",               // short | normal | long
    narrative: { tone: "omniscient_hint", foreshadow: "medium" }, // observer | omniscient_hint | dry_log
    costProfile: "balanced",       // frugal | balanced | rich
    campTraits: ["engineering", "community"],
    starter: "toolkit",            // food | toolkit | medkit | fuel | extra_hand
    advanced: { seed: "", ironman: false, eventCooldown: "normal", banTags: [], llm: true },
    createdAt: Date.now()
};

/* ========== 초기 캠프 생성 ========== */
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
function mkSurvivor(name,role,traits,rng){ return { id:`${name}_${Math.floor(rng()*1e6)}`, name, role, traits, hp:100, mood:60 }; }
function makeInitialCamp(cfg,rng){
    const base = {
        day:1,
        weather: cfg.season==="ice_age"?"강풍":cfg.season==="sandstorm"?"먼지바람":cfg.season==="plague"?"침침함":"흐림",
        resources:{ food:16, water:10, fuel:2, parts:3 },
        morale:55, durability:70,
        survivors:[ mkSurvivor("윤하","정찰",["신중함"],rng), mkSurvivor("도현","기술",["기계덕후"],rng), mkSurvivor("세인","의무",["낙천적"],rng) ],
        foreshadows:[], recentEventIds:[], recentCats:[], tempMods:{ scout:0, repair:0, craft:0, rest:0 }
    };
    if (cfg.difficulty==="casual"){ base.resources.food+=6; base.resources.water+=6; base.morale+=5; }
    else if (cfg.difficulty==="hard"){ base.resources.food-=4; base.resources.water-=4; base.morale-=5; base.durability-=5; }
    switch(cfg.starter){
        case "food": base.resources.food+=10; break;
        case "toolkit": base.resources.parts+=4; base.durability+=5; break;
        case "medkit": base.survivors.push(mkSurvivor("가빈","보조",["응급처치"],rng)); break;
        case "fuel": base.resources.fuel+=4; break;
        case "extra_hand": base.survivors.push(mkSurvivor("루카","보조",["근성"],rng)); break;
    }
    if (cfg.campTraits.includes("engineering")) base.durability+=3;
    if (cfg.campTraits.includes("community")) base.morale+=3;
    base.morale=clamp(base.morale,0,100); base.durability=clamp(base.durability,0,100);
    return base;
}

/* ========== 템플릿 10종 ========== */
const TEMPLATES = [
    { id:"inter_conflict_01", cat:"internal", pickWeight:1, gen:(ctx)=>({
            id:"inter_conflict_01", title:"몰래 감춘 상자",
            narration:"창고 구석에서 낡은 상자가 나왔다. 모두의 시선이 같은 방향으로 굳어졌다.",
            foreshadow:"의심",
            options:[
                { key:"A", label:"즉시 개봉해 모두에게 배분", risk:"사기↑/불신↑", hint:"질서 유지", calc:{ morale:+2, trust:-2 } },
                { key:"B", label:"용의자를 특정해 조사", risk:"사기↓/정보↑", hint:"균열 위험", calc:{ morale:-2, info:+1 } }
            ]
        })},
    { id:"weather_hazard_02", cat:"weather", pickWeight:1, gen:(ctx)=>({
            id:"weather_hazard_02", title:"강풍에 흔들리는 안테나",
            narration:"천막 위 안테나가 기울었다. 지금 손대면 밤이 길어진다.",
            foreshadow:"금속음",
            options:[
                { key:"A", label:"지금 보수 시도", risk:"부상↑/정보↑", hint:"기술 보너스", calc:{ parts:-1, info:+1 } },
                { key:"B", label:"아침까지 기다린다", risk:"기회↓/안전↑", hint:"보수적", calc:{ chance:-5 } }
            ]
        })},
    { id:"supply_short_03", cat:"supply", pickWeight:1, gen:(ctx)=>({
            id:"supply_short_03", title:"희미한 통조림 냄새",
            narration:"바람결에 금속과 기름 냄새가 섞여 들어왔다. 근처 어딘가 저장고가 있다.",
            foreshadow:"약한 빛",
            options:[
                { key:"A", label:"정찰 두 명을 보내본다", risk:"피로↑/식량↑", hint:"정찰 보너스", calc:{ food:+4, fatigue:+8 } },
                { key:"B", label:"위치만 표시하고 다음 날 시도", risk:"기회↓", hint:"안전", calc:{ chance:-3 } }
            ]
        })},
    { id:"outsider_04", cat:"outsider", pickWeight:1, gen:(ctx)=>({
            id:"outsider_04", title:"천막 밖의 발자국",
            narration:"새벽녘 눈발 위로 얕은 발자국이 이어졌다. 누군가 근처에 있다.",
            foreshadow:"낮은 휘파람",
            options:[
                { key:"A", label:"불빛을 줄이고 잠시 숨는다", risk:"정보↓/안전↑", hint:"보수적", calc:{ morale:-1 } },
                { key:"B", label:"신호를 보내 접촉 시도", risk:"부상↑/동맹↑", hint:"대담", calc:{ morale:+1 } }
            ]
        })},
    { id:"med_incident_05", cat:"medical", pickWeight:1, gen:(ctx)=>({
            id:"med_incident_05", title:"가벼운 감염 의심",
            narration:"기침과 열이 번졌다. 대수롭지 않게 넘기기엔 타이밍이 나쁘다.",
            foreshadow:"희미한 열기",
            options:[
                { key:"A", label:"격리 후 상태 관찰", risk:"사기↓/안전↑", hint:"확산 차단", calc:{ morale:-2 } },
                { key:"B", label:"의료 키트로 즉시 처치", risk:"자원↓/회복↑", hint:"의무 보너스", calc:{ parts:-1 } }
            ]
        })},
    { id:"internal_speech_06", cat:"internal", pickWeight:1, gen:(ctx)=>({
            id:"internal_speech_06", title:"짧은 격려 연설",
            narration:"모닥불 주위가 조용해졌다. 누군가 입을 열 타이밍이다.",
            foreshadow:"따뜻한 숨",
            options:[
                { key:"A", label:"규율과 절차를 강조", risk:"사기±/효율↑", hint:"규율", calc:{ morale:+1 } },
                { key:"B", label:"공동체와 신뢰를 강조", risk:"사기↑/갈등↓", hint:"연대", calc:{ morale:+2 } }
            ]
        })},
    { id:"weather_coldfront_07", cat:"weather", pickWeight:1, gen:(ctx)=>({
            id:"weather_coldfront_07", title:"갑작스러운 한기",
            narration:"바람이 방향을 바꿨다. 천막 이음새가 떨었다.",
            foreshadow:"서늘한 금기",
            options:[
                { key:"A", label:"천막 보강", risk:"자원↓/안전↑", hint:"수리 보너스", calc:{ parts:-1 } },
                { key:"B", label:"난방 유지 위해 연료 사용", risk:"연료↓/사기↑", hint:"편안함", calc:{} }
            ]
        })},
    { id:"gear_malfunc_08", cat:"weather", pickWeight:1, gen:(ctx)=>({
            id:"gear_malfunc_08", title:"발전기의 심한 떨림",
            narration:"규칙적이던 소음이 불규칙하게 갈라졌다.",
            foreshadow:"끊긴 박동",
            options:[
                { key:"A", label:"야간 분해 점검", risk:"부상↑/내구↑", hint:"기술 보너스", calc:{ parts:-1 } },
                { key:"B", label:"하루만 전력 제한", risk:"정보↓/안전↑", hint:"저위험", calc:{ chance:-3 } }
            ]
        })},
    { id:"trade_rumor_09", cat:"outsider", pickWeight:1, gen:(ctx)=>({
            id:"trade_rumor_09", title:"남쪽의 거래 소문",
            narration:"낡은 전파 속에서 물물교환 얘기가 흘러들었다.",
            foreshadow:"간헐적 잡음",
            options:[
                { key:"A", label:"좌표를 기록해둔다", risk:"기회↓", hint:"신중", calc:{} },
                { key:"B", label:"내일 바로 길을 튼다", risk:"부상↑/자원↑", hint:"공세적", calc:{} }
            ]
        })},
    { id:"beast_sign_10", cat:"outsider", pickWeight:1, gen:(ctx)=>({
            id:"beast_sign_10", title:"짐승의 흔적",
            narration:"울타리 아래로 진흙이 파였다. 발톱 자국이 겹쳐 있다.",
            foreshadow:"낮은 포효",
            options:[
                { key:"A", label:"덫을 설치한다", risk:"부상↓/정보↑", hint:"제작 보너스", calc:{ parts:-1 } },
                { key:"B", label:"불을 더 피워 쫓아낸다", risk:"연료↓/안전↑", hint:"소극적", calc:{} }
            ]
        })}
];

/* ========== 규칙 엔진(낮 보정 포함) ========== */
function hasTrait(camp,trait){ return camp.survivors.some(s=>s.traits.includes(trait)); }
function hasRole(camp,role){ return camp.survivors.some(s=>s.role===role); }
function computeResolution(camp,cfg,event,pickedKey,rng){
    const opt = event.options.find(o=>o.key===pickedKey);
    const base=0.55; const diffAdj = cfg.difficulty==="casual"?+0.1:cfg.difficulty==="hard"?-0.1:0;
    let traitAdj=0;
    if (event.id==="weather_hazard_02" && hasTrait(camp,"기계덕후")) traitAdj+=0.08;
    if (event.id==="supply_short_03" && hasRole(camp,"정찰")) traitAdj+=0.06;
    let dayAdj=0; const mods=camp.tempMods||{scout:0,repair:0,craft:0,rest:0};
    const cat=(TEMPLATES.find(t=>t.id===event.id)?.cat)||null;
    if (cat==="supply") dayAdj+=Math.min(0.03*mods.scout,0.09);
    if (cat==="weather") dayAdj+=Math.min(0.02*(mods.repair+mods.craft),0.08);
    if (cat==="internal") dayAdj+=Math.min(0.02*mods.rest,0.06);
    if (cat==="outsider" && mods.craft>0) dayAdj+=0.02;
    if (cat==="medical" && hasRole(camp,"의무")) dayAdj+=0.05;
    const chanceAdj=(opt.calc?.chance||0)/100;
    const successChance=clamp(base+diffAdj+traitAdj+dayAdj+chanceAdj,0.05,0.92);
    const success = Math.random()<successChance;

    let delta={ food:0, water:0, fuel:0, parts:0, morale:0, durability:0, injuries:0 };
    if (event.id==="inter_conflict_01"){ delta.morale += success?+2:-3; if (pickedKey==="B" && !success) delta.injuries+=1; }
    else if (event.id==="weather_hazard_02"){ delta.parts += pickedKey==="A"?-1:0; delta.durability += success?+5:(pickedKey==="A"?-5:-2); if (pickedKey==="A" && !success) delta.injuries+=1; }
    else if (event.id==="supply_short_03"){ delta.food += success?+4:+1; delta.morale += success?+1:0; if (pickedKey==="A" && !success) delta.injuries+=1; }
    else if (event.id==="outsider_04"){ delta.morale += pickedKey==="B"?(success?+3:-2):0; if (pickedKey==="B" && !success) delta.injuries+=1; }
    else if (event.id==="med_incident_05"){ delta.morale += pickedKey==="A"?-1:(success?+1:-2); }
    else if (event.id==="internal_speech_06"){ delta.morale += pickedKey==="A"?+1:+2; }
    else if (event.id==="weather_coldfront_07"){ if (pickedKey==="A"){ delta.parts-=1; delta.durability+=success?+4:-2; } if (pickedKey==="B"){ delta.fuel-=1; delta.morale+=+1; } }
    else if (event.id==="gear_malfunc_08"){ if (pickedKey==="A"){ delta.parts-=1; delta.durability+=success?+5:-4; if (!success) delta.injuries+=1; } if (pickedKey==="B"){ delta.durability+=-1; } }
    else if (event.id==="trade_rumor_09"){ if (pickedKey==="B"){ delta.morale += success?+1:-1; } }
    else if (event.id==="beast_sign_10"){ if (pickedKey==="A"){ delta.parts-=1; delta.morale += success?+1:0; } if (pickedKey==="B"){ delta.fuel-=1; } }

    if (!success) delta.morale -= 1;
    if (opt.calc?.fatigue) delta.morale -= Math.round(opt.calc.fatigue/8);

    const next=sclone(camp);
    next.resources.food=Math.max(0,(camp.resources.food+delta.food));
    next.resources.water=Math.max(0,(camp.resources.water+delta.water));
    next.resources.fuel=Math.max(0,(camp.resources.fuel+delta.fuel));
    next.resources.parts=Math.max(0,(camp.resources.parts+delta.parts));
    next.morale=clamp(camp.morale+delta.morale,0,100);
    next.durability=clamp(camp.durability+delta.durability,0,100);

    const injuredNames=[];
    for(let i=0;i<(delta.injuries||0);i++){
        const idx=Math.floor(Math.random()*next.survivors.length);
        next.survivors[idx].hp=Math.max(1, next.survivors[idx].hp - (20 + Math.floor(Math.random()*15)));
        injuredNames.push(next.survivors[idx].name);
    }
    return { success, successChance, delta, nextCamp:next, injuredNames };
}

/* ========== 낮 처리(수동 배치) ========== */
function processDay(camp,cfg,rng,assignments=null){
    let summary=[]; let delta={ food:0, water:0, fuel:0, parts:0, morale:0, durability:0, heal:0 };
    const eat=Math.ceil(camp.survivors.length/2), drink=Math.ceil(camp.survivors.length/2);
    camp.resources.food=Math.max(0, camp.resources.food - eat);
    camp.resources.water=Math.max(0, camp.resources.water - drink);
    camp.durability=clamp(camp.durability-1,0,100);
    summary.push(`식량 ${-eat}, 물 ${-drink}`);

    camp.tempMods={ scout:0, repair:0, craft:0, rest:0 };
    const useManual = assignments && Object.keys(assignments).length>0;
    if (!useManual){
        if (cfg.campTraits.includes("engineering") && camp.resources.parts>0 && rng()<0.6){
            camp.resources.parts-=1; delta.parts-=1; camp.durability=clamp(camp.durability+4,0,100); delta.durability+=4;
            summary.push("수리 +4(부품 -1)"); camp.tempMods.repair+=1;
        }
        if (cfg.campTraits.includes("stealth") && rng()<0.4){
            const w=1+Math.floor(rng()*2); camp.resources.water+=w; delta.water+=w; summary.push(`정찰 획득: 물 +${w}`); camp.tempMods.scout+=1;
        }
        if (cfg.campTraits.includes("medic")){
            const targets=camp.survivors.filter(s=>s.hp<100);
            if (targets.length && rng()<0.7){ const t=targets[Math.floor(rng()*targets.length)]; const heal=6+Math.floor(rng()*7); t.hp=clamp(t.hp+heal,1,100); delta.heal+=heal; summary.push(`치료: ${t.name} +${heal}HP`); }
        }
    } else {
        const count={ scout:0,repair:0,craft:0,rest:0 };
        camp.survivors.forEach(s=>{
            const task=assignments[s.id]; if(!task) return; count[task]=(count[task]||0)+1;
            if (task==="scout"){ if (Math.random()<0.55){ const g=1+Math.floor(Math.random()*2); camp.resources.water+=g; delta.water+=g; } if (Math.random()<0.35){ camp.resources.food+=1; delta.food+=1; } camp.tempMods.scout+=1; }
            if (task==="repair"){ if (camp.resources.parts>0){ camp.resources.parts-=1; delta.parts-=1; camp.durability=clamp(camp.durability+3,0,100); delta.durability+=3; } camp.tempMods.repair+=1; }
            if (task==="craft"){ if (camp.resources.parts>0){ camp.resources.parts-=1; delta.parts-=1; } camp.tempMods.craft+=1; }
            if (task==="rest"){ const heal=5+Math.floor(Math.random()*6); s.hp=clamp(s.hp+heal,1,100); delta.heal+=heal; camp.tempMods.rest+=1; }
        });
        summary.push(`배치: 정찰 ${count.scout} · 수리 ${count.repair} · 제작 ${count.craft} · 휴식 ${count.rest}`);
        if (camp.tempMods.rest>=2){ camp.morale=clamp(camp.morale+1,0,100); delta.morale+=1; }
    }
    return { delta, line: summary.join(", ") };
}

/* ========== LLM 파서/정규화(한국어/JSON 통일) ========== */
const LLM_TIMEOUT_MS=8000;
async function withTimeout(promise, ms){
    let id; const timeout = new Promise((_,rej)=> id=setTimeout(()=>rej(new Error("timeout")), ms));
    try{ return await Promise.race([promise, timeout]); } finally{ clearTimeout(id); }
}
function extractJSON(text) {
    if (!text) return null;
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const raw0 = fence ? fence[1] : text;
    try { return JSON.parse(raw0); } catch { /* empty */ }
    const i = raw0.indexOf("{"); const j = raw0.lastIndexOf("}");
    if (i >= 0 && j > i) {
        const slice = raw0.slice(i, j + 1);
        try { return JSON.parse(slice); } catch { /* empty */ }
    }
    try { return JSON.parse(raw0.replace(/'/g, "\"")); } catch { /* empty */ }
    return null;
}
function normalizeEventsShape(obj) {
    const arr = Array.isArray(obj) ? obj : (Array.isArray(obj?.events) ? obj.events : Array.isArray(obj?.event) ? obj.event : null);
    if (!arr) return null;
    const toKey = (i) => "ABCD".charAt(i) || String.fromCharCode(65 + i);
    const out = arr.map((e, idx) => {
        let options = [];
        const rawOpt = e.options || e.option || e.choices || e.choice;
        if (Array.isArray(rawOpt)) {
            options = rawOpt.map((v, i) => (typeof v === "string"
                ? { key: toKey(i), label: v }
                : { key: (v.key || toKey(i)).toString().replace(/\.$/, ""), label: v.label || v.text || "" }));
        } else if (rawOpt && typeof rawOpt === "object") {
            const keys = Object.keys(rawOpt);
            options = keys.map((k) => ({ key: k.toString().replace(/\.$/, ""), label: String(rawOpt[k]) }));
        } else {
            options = [{ key: "A", label: "시도한다" }, { key: "B", label: "미룬다" }];
        }
        return {
            id: String(e.id || `ev_${Date.now()}_${idx}`),
            title: String(e.title || e.name || "무제 이벤트"),
            narration: String(e.narration || e.desc || e.description || ""),
            foreshadow: String(e.foreshadow || e.tag || "약한 빛"),
            options
        };
    });
    return { events: out };
}
function normalizeResolveShape(obj) {
    const s = obj?.summary || obj?.text || obj?.result?.summary || obj?.result?.text;
    if (!s) return null;
    return { summary: String(s) };
}

/* ========== LLM 어댑터(브라우저에서 직접 호출) ========== */
function promptEvents(ctx, cfg, want) {
    return [
        "역할: 생존 캠프 밤 사건 작가.",
        "스타일: 건조하고 간결한 3인칭 관찰자.",
        "언어: 반드시 한국어.",
        "출력 형식: 설명 없이 JSON만 반환.",
        `제약: 문장 2개, 150자 내. 길이=${cfg.costProfile}.`,
        `컨텍스트: 시즌=${cfg.season}, 자원=${JSON.stringify(ctx.resources)}, 사기=${ctx.morale}, 날씨=${ctx.weather}, 특성=${JSON.stringify(ctx.survivors.flatMap(s=>s.traits).slice(0,2))}.`,
        `복선 강도=${cfg.narrative.foreshadow}, 금칙 태그=${(cfg.advanced.banTags||[]).join(",")||"없음"}.`,
        `출력 스키마 예시: { "events":[ { "id":"...", "title":"...", "narration":"...", "foreshadow":"...", "options":[{"key":"A","label":"..."},{"key":"B","label":"..."}] } ] }`,
        `개수: ${want}`
    ].join("\n");
}
function promptResolve(event, pickedKey, res, cfg) {
    return [
        "역할: 생존 캠프 사건 결과 요약가.",
        "스타일: 건조한 관찰자 톤.",
        "언어: 반드시 한국어.",
        "출력 형식: 설명 없이 JSON만 반환.",
        "제약: 2문장 이내, 150자 내. 과장 금지.",
        `입력: {id:${event.id}, title:${event.title}, 선택:${pickedKey}, 성공:${res.success}, 확률:${Math.round((res.successChance||0)*100)}%, 변화:${JSON.stringify(res.delta||{})}, 부상:${(res.injuredNames||[]).join(",")||"없음"}, 톤:${cfg.narrative.tone}, 복선:${cfg.narrative.foreshadow}}`,
        `출력 스키마: { "summary": "문장" }`
    ].join("\n");
}

async function llmEventsDirect(ctx,cfg){
    const want = (cfg.tempo === "long") ? 3 : (cfg.costProfile==="rich" ? 3 : 2);
    const prompt = promptEvents(ctx, cfg, want);

    // Gemini main → backup
    const geminiModels = [
        { key: GEMINI_MAIN_KEY, model: GEMINI_MAIN_MODEL },
        { key: GEMINI_BACKUP_KEY, model: GEMINI_BACKUP_MODEL }
    ].filter(m => !!m.key);

    for (const { key, model } of geminiModels){
        try{
            const endpoint=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
            const r = await withTimeout(fetch(endpoint,{ method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ contents:[{ parts:[{ text: prompt }] }] }) }), LLM_TIMEOUT_MS);
            const data=await r.json();
            const text=data?.candidates?.[0]?.content?.parts?.[0]?.text||"";
            const parsed=extractJSON(text);
            const normalized=parsed && normalizeEventsShape(parsed);
            if (normalized?.events?.length) { return normalized.events; }
        }catch(e){ /* try next */ }
    }

    // Groq 폴백
    if (GROQ_KEY){
        try{
            const body={
                model: GROQ_MODEL,
                messages:[
                    { role:"system", content:"역할: 생존 캠프 밤 사건 작가. 언어는 한국어. 출력은 JSON만. 설명 금지." },
                    { role:"user", content: prompt }
                ],
                temperature:0.7, max_tokens:300
            };
            const r=await withTimeout(fetch("https://api.groq.com/openai/v1/chat/completions",{ method:"POST", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${GROQ_KEY}` }, body:JSON.stringify(body) }), LLM_TIMEOUT_MS);
            const data=await r.json(); const text=data?.choices?.[0]?.message?.content||"";
            const parsed=extractJSON(text); const normalized=parsed && normalizeEventsShape(parsed);
            if (normalized?.events?.length) { return normalized.events; }
        }catch(e){ /* ignore */ }
    }
    throw new Error("llm_direct_failed");
}

async function llmResolveDirect({ event, pickedKey, res, cfg }){
    const prompt = promptResolve(event, pickedKey, res, cfg);

    // Gemini main → backup
    const geminiModels = [
        { key: GEMINI_MAIN_KEY, model: GEMINI_MAIN_MODEL },
        { key: GEMINI_BACKUP_KEY, model: GEMINI_BACKUP_MODEL }
    ].filter(m => !!m.key);

    for (const { key, model } of geminiModels){
        try{
            const endpoint=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
            const r=await withTimeout(fetch(endpoint,{ method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ contents:[{ parts:[{ text: prompt }] }] }) }), LLM_TIMEOUT_MS);
            const data=await r.json(); const text=data?.candidates?.[0]?.content?.parts?.[0]?.text||"";
            const parsed=extractJSON(text); const normalized=parsed && normalizeResolveShape(parsed);
            if (normalized?.summary) { return normalized.summary; }
        }catch(e){ /* try next */ }
    }

    // Groq 폴백
    if (GROQ_KEY){
        try{
            const body={ model:GROQ_MODEL, messages:[ {role:"system", content:"역할: 생존 캠프 사건 결과 요약가. 한국어. JSON만. 설명 금지."}, {role:"user", content: prompt} ], temperature:0.4, max_tokens:160 };
            const r=await withTimeout(fetch("https://api.groq.com/openai/v1/chat/completions",{ method:"POST", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${GROQ_KEY}` }, body:JSON.stringify(body) }), LLM_TIMEOUT_MS);
            const data=await r.json(); const text=data?.choices?.[0]?.message?.content||"";
            const parsed=extractJSON(text); const normalized=parsed && normalizeResolveShape(parsed);
            if (normalized?.summary) { return normalized.summary; }
        }catch(e){ /* ignore */ }
    }
    throw new Error("llm_direct_failed");
}

/* ========== 후보/결과 생성 래퍼(LLM/템플릿) ========== */
function makeHintLine(tag){
    const hints={ "의심":"누군가 말하지 않은 것이 있다.","금속음":"밤바람에 금속이 울렸다.","약한 빛":"어둠 사이로 희미한 불빛이 깜빡였다.","낮은 휘파람":"호흡은 일정했고, 발걸음은 더 가벼워졌다.","희미한 열기":"작은 열기만 남아 밤을 버텼다.","끊긴 박동":"소리는 잠깐 멈췄다가 다시 뛰었다." };
    return hints[tag] || "기록은 아직 끝나지 않았다.";
}
const clip=(s,n)=>(s.length>n? s.slice(0,n-1)+"…": s);
function extraFlavor(season){ if(season==="ice_age")return "찬 기류가 말의 끝을 얼렸다."; if(season==="sandstorm")return "먼지가 혀끝에 달라붙었다."; if(season==="plague")return "뿌연 냄새가 숨을 얕게 만들었다."; return "바람은 방향을 바꾸지 않았다."; }

function postProcessEvents(events,cfg,ctx){
    const banned=new Set((cfg.advanced.banTags||[]).map(String));
    const filtered=events.filter(ev=>!banned.has(ev.foreshadow));
    const final=filtered.length?filtered:events;
    final.forEach(ev=>{
        if (cfg.narrative.tone==="omniscient_hint" && cfg.narrative.foreshadow!=="low") ev.narration=`${ev.narration} ${makeHintLine(ev.foreshadow||"약한 빛")}`;
        if (cfg.costProfile==="frugal") ev.narration=clip(ev.narration,120);
        else if (cfg.costProfile==="rich") ev.narration=`${ev.narration} ${extraFlavor(cfg.season)}`;
    });
    return final;
}
function templateEvents(ctx,rng,cfg){
    const want = (cfg.tempo === "long") ? 3 : (cfg.costProfile==="rich" ? 3 : 2);
    const cooldown={low:1,normal:2,high:3}[cfg.advanced.eventCooldown]??2;
    const recentSet=new Set((ctx.recentEventIds||[]).slice(-cooldown));
    const recentCats=ctx.recentCats||[];
    const pool=TEMPLATES
        .filter(t=>!recentSet.has(t.id))
        .map(t=>{ let w=t.pickWeight + rng()*0.5; if (recentCats.includes(t.cat)) w-=0.3; return {t,w}; })
        .sort((a,b)=>b.w-a.w);
    const chosen=pool.slice(0,want).map(x=>x.t.gen(ctx));
    return postProcessEvents(chosen,cfg,ctx);
}
async function generateEventCandidates(ctx,rng,cfg){
    if (cfg?.advanced?.llm){
        try{ const events=await llmEventsDirect(ctx,cfg); return postProcessEvents(events,cfg,ctx); }
        catch(e){ console.warn("LLM 후보 실패 → 템플릿 폴백", e); }
    }
    return templateEvents(ctx,rng,cfg);
}
function localSummary(event,pickedKey,res,cfg){
    const change=[]; const d=res.delta||{};
    if (d.food) change.push(`식량 ${d.food>0?"+":""}${d.food}`);
    if (d.water) change.push(`물 ${d.water>0?"+":""}${d.water}`);
    if (d.parts) change.push(`부품 ${d.parts>0?"+":""}${d.parts}`);
    if (d.fuel) change.push(`연료 ${d.fuel>0?"+":""}${d.fuel}`);
    if (d.durability) change.push(`내구도 ${d.durability>0?"+":""}${d.durability}`);
    if (d.morale) change.push(`사기 ${d.morale>0?"+":""}${d.morale}`);
    const inj=(res.injuredNames||[]).length?`부상: ${(res.injuredNames||[]).join(", ")}`:"";
    const tail=change.length?`(${change.join(", ")})`:"";
    let line=`${res.success?"성공":"실패"}. ${inj} ${tail}`.trim();
    if (cfg.narrative.tone==="omniscient_hint" && cfg.narrative.foreshadow==="high") line+=` ${makeHintLine("약한 빛")}`;
    return line;
}
async function narrateResolution(event,pickedKey,res,cfg){
    if (cfg?.advanced?.llm){
        try{ return await llmResolveDirect({ event, pickedKey, res, cfg }); }
        catch(e){ console.warn("LLM 결과 실패 → 로컬 요약 폴백", e); }
    }
    return localSummary(event,pickedKey,res,cfg);
}

/* ========== 임팩트/목표 시스템 ========== */
function initGoals(cfg) {
    return {
        main: { id: "keep_water_20", title: "물 20 이상 유지", done: false, progress: 0 },
        subs: [
            { id: "no_injury_2d", title: "연속 2일 부상자 0명", streak: 0, done: false },
            { id: "durability_80", title: "내구도 80 달성", done: false }
        ]
    };
}
function updateGoalsOnDawn(run) {
    const g = run.meta.goals;
    const c = run.camp;
    g.main.progress = Math.min(100, Math.round((c.resources.water / 20) * 100));
    g.main.done = c.resources.water >= 20;
    const last = run.dayLog.filter(l => l.event).at(-1);
    const injured = (last?.injured || []).length;
    if (injured === 0) g.subs[0].streak = (g.subs[0].streak || 0) + 1; else g.subs[0].streak = 0;
    if (g.subs[0].streak >= 2) g.subs[0].done = true;
    g.subs[1].done = c.durability >= 80;
}
function computeImpactFromLast(run) {
    const last = run.dayLog.filter(l => l.event).at(-1);
    const d = last?.delta || {};
    const hint = (d.water < 0 && run.camp.resources.water < 6)
        ? "물 보충이 시급합니다. 정찰/거래 이벤트를 노려보세요."
        : (d.durability < 0 && run.camp.durability < 60)
            ? "수리/제작으로 내구도를 보강하세요."
            : (d.morale < 0)
                ? "사기 회복용 내부 이벤트를 고려하세요."
                : "안정적입니다. 내일은 공급 확대를 노려봅시다.";
    return { day: run.camp.day, diff: d, hint };
}

/* ========== 텔레메트리(콘솔) ========== */
function track(ev,p){ console.log("[telemetry]", ev, p); }

/* ========== 앱 루트 ========== */
export default function App(){
    const [config,setConfig]=useState(load(LS_CFG)||null);
    const [started,setStarted]=useState(!!load(LS_RUN));
    const startRun=(cfg)=>{
        const seed=(cfg.advanced.seed?.trim()||makeSeed(cfg)).toUpperCase();
        const rng=rngFromSeed(seed);
        const camp=makeInitialCamp({ ...cfg, advanced:{ ...cfg.advanced, seed } }, rng);
        const run={ cfg:{ ...cfg, advanced:{ ...cfg.advanced, seed } }, rngSeed:seed, camp, phase:"day", dayLog:[], currentEvents:[], picked:null, resolution:null,
            meta: { goals: initGoals(cfg), impact: null } };
        save(LS_CFG, run.cfg); save(LS_RUN, run); setConfig(run.cfg); setStarted(true);
        track("start_run", { seed, cfg:{ ...cfg, advanced:undefined } });
    };
    if (!started || !load(LS_RUN)) return (<>
        <AppStyles />
        <InitialSetup initial={load(LS_CFG)||defaultConfig} onStart={startRun} />
    </>);
    return (<>
        <AppStyles />
        <Game onExit={()=>setStarted(false)} />
    </>);
}

/* ========== 게임 화면 ========== */
function Game({ onExit }){
    const [run,setRun]=useState(load(LS_RUN));
    const rng=useMemo(()=>rngFromSeed(run.rngSeed),[run.rngSeed]);
    const [assignments,setAssignments]=useState({});
    const canChoose = run.phase==="night" && !run.picked && (run.currentEvents?.length>0);

    useEffect(()=>{
        const h=(e)=>{
            if (["INPUT","TEXTAREA","SELECT"].includes(e.target.tagName)) return;
            if (e.code==="Space"){ e.preventDefault(); nextPhase(); }
            if (canChoose && ["Digit1","Digit2","Digit3"].includes(e.code)){
                const idx=Number(e.code.slice(-1))-1;
                const ev=run.currentEvents[idx];
                if (ev){ const key=e.shiftKey?"B":"A"; pickOption(ev,key); }
            }
        };
        window.addEventListener("keydown", h);
        return ()=>window.removeEventListener("keydown", h);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [run, canChoose]);

    const nextPhase=()=>{ setRun(prev=>{
        const cur=sclone(prev);
        if (cur.phase==="day"){
            const dayRes=processDay(cur.camp, cur.cfg, rng, assignments);
            cur.dayLog.push({ day:cur.camp.day, kind:"day", summary:`낮 정리: ${dayRes.line}` });
            if (assignments && Object.keys(assignments).length){ cur.dayLog.push({ day:cur.camp.day, kind:"day_note", summary:"배치 확정" }); }
            setAssignments({}); cur.phase="dusk";
        } else if (cur.phase==="dusk"){
            const ctx={ ...cur.camp, season:cur.cfg.season };
            cur.currentEvents=[]; cur.phase="night";
            (async ()=>{
                const events=await generateEventCandidates(ctx, rng, cur.cfg);
                setRun(prev2=>{
                    const copy=sclone(prev2);
                    if (copy.camp.day===cur.camp.day && copy.phase==="night" && !copy.picked){ copy.currentEvents=events; save(LS_RUN, copy); return copy; }
                    return prev2;
                });
            })();
        } else if (cur.phase==="night"){
            if (!cur.picked) return cur;
            cur.phase="dawn";
        } else if (cur.phase==="dawn"){
            // 목표/임팩트 업데이트
            cur.meta = cur.meta || { goals: initGoals(cur.cfg), impact: null };
            cur.meta.impact = computeImpactFromLast(cur);
            updateGoalsOnDawn(cur);

            // 최근 이벤트/카테고리 기억 및 초기화
            const last=cur.dayLog.filter(l=>l.event).at(-1);
            const eid=last?.event?.id; const ecat=last?.eventCat;
            if (eid) cur.camp.recentEventIds=[...(cur.camp.recentEventIds||[]), eid].slice(-3);
            if (ecat) cur.camp.recentCats=[...(cur.camp.recentCats||[]), ecat].slice(-2);
            cur.camp.tempMods={ scout:0, repair:0, craft:0, rest:0 };

            cur.camp.day+=1;
            cur.phase="day"; cur.currentEvents=[]; cur.picked=null; cur.resolution=null;
        }
        save(LS_RUN, cur); return cur;
    }); };

    const pickOption=async(event,key)=>{
        setRun(prev=>{
            const cur=sclone(prev);
            const res=computeResolution(cur.camp, cur.cfg, event, key, rng);
            cur.dayLog=[...cur.dayLog, { day:cur.camp.day, event, eventCat:TEMPLATES.find(t=>t.id===event.id)?.cat||null, picked:key, success:res.success, successChance:res.successChance, delta:res.delta, injured:res.injuredNames, summary:"결과 생성 중..." }];
            cur.camp=res.nextCamp; cur.picked={ eventId:event.id, key }; cur.resolution={ summary:"결과 생성 중...", success:res.success };
            save(LS_RUN, cur); return cur;
        });
        const latest=load(LS_RUN); const idx=latest.dayLog.length-1;
        const lastEntry=latest.dayLog[idx];
        const summary=await narrateResolution(event, key, { success:lastEntry.success, successChance:lastEntry.successChance, delta:lastEntry.delta, injuredNames:lastEntry.injured }, latest.cfg);
        setRun(prev=>{ const cur=sclone(prev); if (cur.dayLog[idx]) cur.dayLog[idx].summary=summary; if (cur.resolution) cur.resolution.summary=summary; save(LS_RUN, cur); return cur; });
    };

    const resetRun=()=>{ if (run.cfg.advanced.ironman){ alert("철인 모드: 런 중 리셋 불가입니다."); return; } if (!window.confirm("정말 런을 초기화할까요?")) return; localStorage.removeItem(LS_RUN); onExit(); };
    const backToSetup=()=>{ if (run.cfg.advanced.ironman){ alert("철인 모드: 런 중 설정 화면으로 돌아갈 수 없습니다."); return; } onExit(); };

    return (
        <div className="app" style={{ display:"grid", gridTemplateColumns:"1.2fr 0.8fr", gap:16, padding:16, fontFamily:"system-ui, sans-serif" }}>
            <div>
                <Header run={run} onExit={backToSetup} onReset={resetRun} />

                <Section title="새벽 요약">
                    <DawnImpact impact={run.meta?.impact} />
                </Section>

                <Section title="기록">
                    <LogView dayLog={run.dayLog} />
                </Section>

                {run.phase==="day" && (
                    <Section title="낮 배치">
                        <DayAssignments camp={run.camp} assignments={assignments} onChange={setAssignments} locked={false} />
                        <small style={{ display:"block", opacity:0.8, marginTop:6 }}>
                            권장: {
                            run.camp.resources.water < 8 ? "정찰" :
                                run.camp.durability < 60 ? "수리/제작" :
                                    run.camp.morale < 50 ? "휴식" : "정찰"
                        } 위주
                        </small>
                        <div style={{ marginTop:8, display:"flex", gap:8 }}>
                            <button onClick={nextPhase} className="btn sticky-cta" style={btn()}>배치 확정 후 황혼으로</button>
                            <small style={{ opacity:0.7 }}>Tip: 확정 안 해도 스페이스로 진행돼요.</small>
                        </div>
                    </Section>
                )}

                <Section title="밤 사건">
                    {run.phase==="night" && (
                        <>
                            {!run.currentEvents.length && !run.picked && <p>사건을 준비 중...</p>}
                            {run.currentEvents.length>0 && !run.picked && <EventChoices events={run.currentEvents} onPick={pickOption} />}
                            {run.picked && run.resolution && <ResolutionView resolution={run.resolution} />}
                        </>
                    )}
                    {run.phase!=="night" && <p style={{ opacity:0.8 }}>다음 단계로 진행해요.</p>}
                </Section>
            </div>

            <aside style={{ display:"grid", gap:12 }}>
                <Section title="목표·진행">
                    <GoalsPanel goals={run.meta?.goals || initGoals(run.cfg)} />
                </Section>
                <Section title="캠프 상태"><CampStatus camp={run.camp} /></Section>
                <Section title="조작">
                    <button onClick={nextPhase} className="btn sticky-cta" style={btn()}>
                        {run.phase==="day" && "황혼으로(스페이스)"}
                        {run.phase==="dusk" && "밤으로(스페이스)"}
                        {run.phase==="night" && (run.picked? "새벽으로(스페이스)" : "선택이 필요합니다(1/2/3)")}
                        {run.phase==="dawn" && "다음 날(스페이스)"}
                    </button>
                    <small style={{ opacity:0.7, display:"block", marginTop:6 }}>페이즈: {run.phase} · 시드: {run.rngSeed}</small>
                    <ToneQuickEdit cfg={run.cfg} />
                </Section>
            </aside>
        </div>
    );
}

/* ========== 하위 컴포넌트 ========== */
function Header({ run, onExit, onReset }){
    return (
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:8 }}>
            <h2 style={{ margin:0 }}>생존 캠프 연대기</h2>
            <div style={{ display:"flex", gap:8 }}>
                <button onClick={onExit} className="btn-ghost" style={btnGhost()} disabled={run.cfg.advanced.ironman} title={run.cfg.advanced.ironman?"철인 모드에서는 제한됩니다":""}>설정으로</button>
                <button onClick={onReset} className="btn-ghost" style={btnGhost()} disabled={run.cfg.advanced.ironman} title={run.cfg.advanced.ironman?"철인 모드에서는 제한됩니다":""}>런 초기화</button>
            </div>
        </div>
    );
}
function Section({ title, children }){ return <div className="section" style={{ border:"1px solid #e5e7eb", borderRadius:8, padding:12 }}><div style={{ fontWeight:600, marginBottom:8 }}>{title}</div>{children}</div>; }
function LogView({ dayLog }){
    const ref=useRef(null);
    useEffect(()=>{ if (ref.current) ref.current.scrollTop=ref.current.scrollHeight; }, [dayLog]);
    return (
        <div ref={ref} className="log" style={{ height:260, overflow:"auto", paddingRight:6 }}>
            {dayLog.length===0 && <p style={{ opacity:0.7 }}>아직 기록이 없습니다.</p>}
            {dayLog.map((l,i)=>(
                <div key={i} style={{ marginBottom:8 }}>
                    {l.kind==="day"? (
                        <>
                            <div style={{ fontWeight:600 }}>Day {l.day} · 낮 보고</div>
                            <div>{l.summary}</div>
                        </>
                    ): l.event ? (
                        <>
                            <div style={{ fontWeight:600 }}>Day {l.day} · {l.event.title}</div>
                            <div style={{ opacity:0.85 }}>{l.event.narration}</div>
                            <div style={{ marginTop:4 }}><span style={{ fontSize:12, opacity:0.75 }}>선택: {l.picked} · {Math.round(l.successChance*100)}% → {l.success?"성공":"실패"}</span></div>
                            <div style={{ marginTop:2 }}>{l.summary}</div>
                        </>
                    ) : (
                        <>
                            <div style={{ fontWeight:600 }}>Day {l.day} · 메모</div>
                            <div>{l.summary}</div>
                        </>
                    )}
                    <hr style={{ border:0, borderTop:"1px solid #eee", marginTop:8 }} />
                </div>
            ))}
        </div>
    );
}
function EventChoices({ events, onPick }){
    return (
        <div className="choices" style={{ display:"grid", gap:12 }}>
            {events.map((ev,idx)=>(
                <div key={ev.id} style={{ border:"1px solid #ddd", borderRadius:8, padding:12 }}>
                    <div style={{ fontWeight:600, marginBottom:4 }}>{idx+1}. {ev.title}</div>
                    <TypeLine text={ev.narration} />
                    <div style={{ display:"flex", gap:8, marginTop:8, flexWrap:"wrap" }}>
                        {ev.options.map(opt=>(
                            <button key={opt.key} onClick={()=>onPick(ev,opt.key)} className="btn" style={btn()}>
                                {opt.key}. {opt.label}
                            </button>
                        ))}
                    </div>
                    <div style={{ opacity:0.7, fontSize:12, marginTop:4 }}>
                        위험: {ev.options.map(o=>`${o.key}:${o.risk}`).join(" · ")}
                    </div>
                </div>
            ))}
        </div>
    );
}
function ResolutionView({ resolution }){ return <div style={{ padding:12, border:"1px dashed #bbb", borderRadius:8 }}><div style={{ fontWeight:600, marginBottom:4 }}>결과</div><TypeLine text={resolution.summary} /></div>; }
function CampStatus({ camp }){
    const R=camp.resources; const pill=(v)=>({ padding:"2px 8px", borderRadius:999, border:"1px solid #ddd", background: v<5?"#fff0f0": v<10?"#fff8e5":"#f3f4f6" });
    return (
        <div style={{ display:"grid", gap:8 }}>
            <div>Day {camp.day} · 날씨: {camp.weather}</div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                <span style={pill(R.food)}>식량 {R.food}</span>
                <span style={pill(R.water)}>물 {R.water}</span>
                <span style={pill(R.fuel)}>연료 {R.fuel}</span>
                <span style={pill(R.parts)}>부품 {R.parts}</span>
            </div>
            <div>사기 {camp.morale} · 내구도 {camp.durability}</div>
            <div>생존자({camp.survivors.length})
                <ul style={{ margin:"6px 0 0 16px" }}>
                    {camp.survivors.map(s=>(
                        <li key={s.id} style={{ opacity: s.hp<40?0.85:1 }}>{s.name} · {s.role} · HP {s.hp} · {s.traits.join(", ")}</li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
function DayAssignments({ camp, assignments, onChange, locked }){
    const tasks = [
        { value: "", label: "-" },
        { value: "scout", label: "정찰" },
        { value: "repair", label: "수리" },
        { value: "craft", label: "제작" },
        { value: "rest", label: "휴식" }
    ];
    const setTask = (id, val) => {
        const next = { ...(assignments || {}) };
        if (!val) delete next[id]; else next[id] = val;
        if (onChange) onChange(next);
    };
    if (!camp) return null;
    return (
        <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {camp.survivors.map(s => (
                    <div key={s.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: "8px 10px" }}>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>{s.name} · {s.role}</div>
                        <select
                            value={(assignments && assignments[s.id]) || ""}
                            onChange={e => setTask(s.id, e.target.value)}
                            disabled={locked}
                        >
                            {tasks.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                    </div>
                ))}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button onClick={() => onChange && onChange({})} className="btn-ghost" style={btnGhost()} disabled={locked}>모두 해제</button>
                <small style={{ opacity: 0.7 }}>작업: 정찰=물/식량 수집, 수리=내구 회복(부품 소모), 제작=소규모 보정, 휴식=HP 회복</small>
            </div>
        </div>
    );
}
function ToneQuickEdit({ cfg }){
    const [cur,setCur]=useState(cfg); useEffect(()=>setCur(cfg),[cfg]);
    const updateTone=(key,val)=>{ const run=load(LS_RUN); if (!run) return; const next=sclone(run); next.cfg.narrative[key]=val; save(LS_RUN,next); window.location.reload(); };
    return (
        <div style={{ display:"grid", gap:6 }}>
            <label style={{ fontSize:12, opacity:0.8 }}>톤/복선(런 중 일부 변경 가능)</label>
            <select value={cur.narrative.tone} onChange={e=>updateTone("tone", e.target.value)}>
                <option value="observer">담담한 관찰자</option>
                <option value="omniscient_hint">전지적 독자 감성</option>
                <option value="dry_log">드라이 로그</option>
            </select>
            <select value={cur.narrative.foreshadow} onChange={e=>updateTone("foreshadow", e.target.value)}>
                <option value="low">복선 낮음</option>
                <option value="medium">복선 보통</option>
                <option value="high">복선 높음</option>
            </select>
        </div>
    );
}
function TypeLine({ text }){
    const [shown,setShown]=useState(""); const once=useRef(false);
    useEffect(()=>{ if (once.current){ setShown(text); return; } once.current=true; let i=0; const n=Math.min(text.length,140); const iv=Math.max(8, Math.floor(900/n)); const h=setInterval(()=>{ i++; setShown(text.slice(0,i)); if (i>=text.length) clearInterval(h); }, iv); return ()=>clearInterval(h); }, [text]);
    return <p style={{ margin:0 }}>{shown}</p>;
}
function GoalsPanel({ goals }) {
    if (!goals) return null;
    const Bar = ({ v }) => (
        <div style={{ background:"#eee", height:8, borderRadius:6 }}>
            <div style={{ width:`${v}%`, background:"#111", height:8, borderRadius:6 }} />
        </div>
    );
    return (
        <div style={{ display:"grid", gap:8 }}>
            <div style={{ fontWeight:600 }}>메인 목표</div>
            <div>{goals.main.title} {goals.main.done ? "· 완료" : ""}</div>
            <Bar v={goals.main.progress || (goals.main.done ? 100 : 0)} />
            <div style={{ fontWeight:600, marginTop:6 }}>부목표</div>
            {goals.subs.map(s => (
                <div key={s.id} style={{ display:"grid", gap:4 }}>
                    <div>{s.title} {s.done ? "· 완료" : s.streak ? `· 연속 ${s.streak}일` : ""}</div>
                </div>
            ))}
        </div>
    );
}
function DawnImpact({ impact }) {
    if (!impact) return null;
    const d = impact.diff || {};
    const chips = Object.entries(d).filter(([,v])=>v).map(([k,v]) => `${k} ${v>0?"+":""}${v}`);
    return (
        <div style={{ border:"1px dashed #bbb", borderRadius:8, padding:10 }}>
            <div style={{ fontWeight:600, marginBottom:4 }}>새벽 요약</div>
            <div>{chips.length ? chips.join(", ") : "변화 없음"}</div>
            <div style={{ opacity:0.8, marginTop:4 }}>{impact.hint}</div>
        </div>
    );
}

/* ========== 초기 설정 화면 ========== */
function InitialSetup({ initial, onStart }){
    const [cfg,setCfg]=useState(initial);
    const [shareCode,setShareCode]=useState("");

    const preview=useMemo(()=>{
        const diff={casual:0.15, standard:0, hard:-0.15}[cfg.difficulty]||0;
        const traits=(cfg.campTraits?.length||0)*0.05;
        const tempo={short:0.03, normal:0, long:-0.02}[cfg.tempo]||0;
        const avgSuccess=Math.round((0.55+diff+traits+tempo)*100);
        return { avgSuccess, earlyDays: avgSuccess>=60?"완만": avgSuccess>=50?"보통":"험난", cost:{ frugal:"낮음", balanced:"보통", rich:"높음" }[cfg.costProfile] };
    }, [cfg]);

    const set=(path,value)=>{
        setCfg(prev=>{
            const next=sclone(prev);
            const parts=path.split("."); let cur=next;
            for (let i=0;i<parts.length-1;i++) cur=cur[parts[i]];
            cur[parts.at(-1)]=value;
            return next;
        });
    };
    const start=()=>onStart({ ...cfg, createdAt: Date.now() });
    const copyShare=()=>{ const code=encodePreset(cfg); navigator.clipboard?.writeText(code); alert("공유 코드가 복사되었습니다."); };
    const importShare=()=>{ const obj=decodePreset(shareCode.trim()); if (!obj){ alert("코드 형식이 올바르지 않습니다."); return; } setCfg(obj); };

    return (
        <div style={{ maxWidth:980, margin:"0 auto", padding:16, display:"grid", gap:12, fontFamily:"system-ui, sans-serif" }}>
            <h2 style={{ margin:"4px 0 12px" }}>새 런 설정</h2>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                <button onClick={()=>setCfg(defaultConfig)} className="btn" style={btn()}>빠르게 시작(권장)</button>
                <button onClick={()=>set("difficulty","casual")} className="btn-ghost" style={btnGhost()}>캐주얼</button>
                <button onClick={()=>set("difficulty","hard")} className="btn-ghost" style={btnGhost()}>하드</button>
                <button onClick={()=>set("season","ice_age")} className="btn-ghost" style={btnGhost()}>빙하기 시즌</button>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <Field label="게임 모드">
                    <select value={cfg.mode} onChange={e=>set("mode", e.target.value)}>
                        <option value="standard">표준 캠프</option>
                        <option value="hardcore">하드코어(세이브 제한)</option>
                        <option value="sandbox">샌드박스</option>
                    </select>
                </Field>

                <Field label="세계관·시즌">
                    <select value={cfg.season} onChange={e=>set("season", e.target.value)}>
                        <option value="ruin">근미래 폐허</option>
                        <option value="ice_age">빙하기</option>
                        <option value="sandstorm">사막화</option>
                        <option value="plague">전염병</option>
                    </select>
                </Field>

                <Field label="난이도">
                    <select value={cfg.difficulty} onChange={e=>set("difficulty", e.target.value)}>
                        <option value="casual">캐주얼</option>
                        <option value="standard">표준</option>
                        <option value="hard">하드</option>
                    </select>
                </Field>

                <Field label="진행 템포">
                    <select value={cfg.tempo} onChange={e=>set("tempo", e.target.value)}>
                        <option value="short">짧게</option>
                        <option value="normal">보통</option>
                        <option value="long">길게</option>
                    </select>
                </Field>

                <Field label="사건 톤">
                    <select value={cfg.narrative.tone} onChange={e=>set("narrative.tone", e.target.value)}>
                        <option value="observer">담담한 관찰자</option>
                        <option value="omniscient_hint">전지적 독자 감성</option>
                        <option value="dry_log">드라이 로그</option>
                    </select>
                </Field>

                <Field label="복선 강도">
                    <select value={cfg.narrative.foreshadow} onChange={e=>set("narrative.foreshadow", e.target.value)}>
                        <option value="low">낮음</option>
                        <option value="medium">보통</option>
                        <option value="high">높음</option>
                    </select>
                </Field>

                <Field label="비용·퍼포먼스">
                    <select value={cfg.costProfile} onChange={e=>set("costProfile", e.target.value)}>
                        <option value="frugal">절약</option>
                        <option value="balanced">균형</option>
                        <option value="rich">풍성</option>
                    </select>
                </Field>

                <Field label="시작 보너스">
                    <select value={cfg.starter} onChange={e=>set("starter", e.target.value)}>
                        <option value="food">식량 꾸러미</option>
                        <option value="toolkit">공구 세트</option>
                        <option value="medkit">의료 키트</option>
                        <option value="fuel">연료 드럼</option>
                        <option value="extra_hand">추가 인원 1명</option>
                    </select>
                </Field>

                <Field label="캠프 특성(최대 2개)">
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                        {["discipline","engineering","community","stealth","medic"].map(tag=>{
                            const picked=cfg.campTraits.includes(tag);
                            return (
                                <button key={tag} onClick={()=>{
                                    const set2=new Set(cfg.campTraits);
                                    if (picked) set2.delete(tag); else if (set2.size<2) set2.add(tag);
                                    setCfg({ ...cfg, campTraits:Array.from(set2) });
                                }} className="btn-ghost" style={{ ...btnGhost(), padding:"4px 8px" }}>
                                    {tag}
                                </button>
                            );
                        })}
                    </div>
                </Field>
            </div>

            <details>
                <summary style={{ cursor:"pointer" }}>고급 설정</summary>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginTop:8 }}>
                    <Field label="시드"><input value={cfg.advanced.seed} onChange={e=>set("advanced.seed", e.target.value)} placeholder="공유/재현용 코드" /></Field>
                    <Field label="철인 모드"><input type="checkbox" checked={cfg.advanced.ironman} onChange={e=>set("advanced.ironman", e.target.checked)} /></Field>
                    <Field label="이벤트 중복 쿨다운">
                        <select value={cfg.advanced.eventCooldown} onChange={e=>set("advanced.eventCooldown", e.target.value)}>
                            <option value="low">낮음</option><option value="normal">보통</option><option value="high">높음</option>
                        </select>
                    </Field>
                    <Field label="금칙 태그(쉼표로 구분)">
                        <input value={(cfg.advanced.banTags||[]).join(",")} onChange={e=>set("advanced.banTags", e.target.value.split(",").map(s=>s.trim()).filter(Boolean))} placeholder="예: 의심, 약한 빛" />
                    </Field>
                    <Field label="LLM 사용">
                        <label style={{ display:"flex", alignItems:"center", gap:8 }}>
                            <input type="checkbox" checked={!!cfg.advanced.llm} onChange={e=>set("advanced.llm", e.target.checked)} />
                            <span style={{ opacity:0.8, fontSize:12 }}>브라우저에서 Gemini/Groq API 직접 호출</span>
                        </label>
                    </Field>
                </div>
            </details>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div style={{ padding:12, border:"1px solid #eee", borderRadius:8 }}>
                    <b>초반 체감:</b> {preview.earlyDays} · 평균 성공률: {preview.avgSuccess}% · 비용: {preview.cost}
                </div>
                <div style={{ padding:12, border:"1px solid #eee", borderRadius:8, display:"grid", gap:8 }}>
                    <b>프리셋 공유</b>
                    <div style={{ display:"flex", gap:8 }}>
                        <button onClick={copyShare} className="btn-ghost" style={btnGhost()}>공유 코드 복사</button>
                        <input value={shareCode} onChange={e=>setShareCode(e.target.value)} placeholder="코드 붙여넣기" />
                        <button onClick={importShare} className="btn-ghost" style={btnGhost()}>불러오기</button>
                    </div>
                </div>
            </div>

            <div style={{ display:"flex", gap:8, marginTop:4 }}>
                <button onClick={start} className="btn" style={btn()}>시작하기</button>
                <button onClick={()=>{ save(LS_CFG, cfg); alert("프리셋 저장 완료"); }} className="btn-ghost" style={btnGhost()}>프리셋 저장</button>
                <button onClick={()=>{ const saved=load(LS_CFG); if (saved) setCfg(saved); }} className="btn-ghost" style={btnGhost()}>프리셋 불러오기</button>
            </div>
        </div>
    );
}
function Field({ label, children }){ return (<div><div style={{ fontSize:12, opacity:0.8, marginBottom:4 }}>{label}</div>{children}</div>); }

/* ========== 스타일/유틸 ========== */
function btn(){ return { padding:"8px 12px", borderRadius:8, border:"1px solid #111", background:"#111", color:"#fff", cursor:"pointer" }; }
function btnGhost(){ return { padding:"8px 12px", borderRadius:8, border:"1px solid #999", background:"#fff", color:"#111", cursor:"pointer" }; }
function makeSeed(cfg){ return `${cfg.season}-${cfg.difficulty}-${Math.floor(Math.random()*1e6)}`.toUpperCase(); }