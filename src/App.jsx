import React, { useEffect, useMemo, useRef, useState } from "react";
import { initializeApp } from "firebase/app";
import {
    getFirestore,
    doc,
    setDoc,
    getDoc,
    updateDoc,
    serverTimestamp,
    collection,
    addDoc,
    getDocs,
    query,
    orderBy,
    limit,
    startAfter,
} from "firebase/firestore";

// 1) Firebase 하드코딩 설정
const firebaseConfig = {
    apiKey: "AIzaSyBNJtmpRWzjobrY556bnHkwbZmpFJqgPX8",
    authDomain: "text-adventure-game-cb731.firebaseapp.com",
    projectId: "text-adventure-game-cb731",
    storageBucket: "text-adventure-game-cb731.appspot.com",
    messagingSenderId: "1092941614820",
    appId: "1:1092941614820:web:5545f36014b73c268026f1",
};

// 2) LLM 키 하드코딩
const mainApiKey = "AIzaSyDC11rqjU30OJnLjaBFOaazZV0klM5raU8";   // Gemini main
const backupApiKey = "AIzaSyAhscNjW8GmwKPuKzQ47blCY_bDanR-B84"; // Gemini backup
const groqApiKey = "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"; // Groq

// 3) Firebase init
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 4) 유틸
const PAGE_SIZE = 50;
const AUTO_SAVE_MS = 5 * 60 * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fetchWithTimeout(url, options = {}, timeout = 20000) {
    return Promise.race([
        fetch(url, options),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), timeout)),
    ]);
}

function stripCodeFences(s) {
    if (!s) return s;
    return s.replace(/^```(?:json)?/gi, "").replace(/```$/gi, "").trim();
}

function extractJSON(text) {
    if (!text) return null;
    const fenced = text.match(/```json([\s\S]*?)```/i);
    if (fenced && fenced[1]) return fenced[1].trim();
    const curly = text.match(/\{[\s\S]*\}$/m);
    if (curly && curly[0]) return curly[0];
    return text.trim();
}

function safeParseLLM(text) {
    try {
        const j = extractJSON(text);
        if (!j) throw new Error("No JSON found");
        const parsed = JSON.parse(stripCodeFences(j));
        if (!Array.isArray(parsed.choices)) parsed.choices = [];
        if (parsed.choices.length === 0) {
            const lines = text
                .split("\n")
                .map((l) => l.trim())
                .filter((l) => l);
            const guesses = lines
                .filter((l) => /^[-•\d]/.test(l))
                .map((l) => l.replace(/^[-•\d.)]\s*/, ""))
                .slice(0, 3);
            parsed.choices = guesses.length
                ? guesses
                : ["주위를 살핀다", "앞으로 전진한다", "잠시 숨을 고른다"];
        }
        if (!parsed.narration || typeof parsed.narration !== "string") {
            parsed.narration =
                "서늘한 바람이 스친다. 당신의 선택이 모험의 방향을 정할 것이다. 긴장을 늦추지 마라.";
        }
        if (!parsed.state || typeof parsed.state !== "object") {
            parsed.state = {};
        }
        return parsed;
    } catch (_) {
        return {
            narration:
                "먼 안개 너머에서 낮은 북소리가 울린다. 당신은 작은 등불을 움켜쥐고 다음 발걸음을 고른다.",
            choices: [
                "등불을 높이 들어 주변을 살핀다",
                "안개 속으로 천천히 걸어간다",
                "잠시 멈춰 귀를 기울인다",
            ],
            state: {},
        };
    }
}

// 경량 한 줄 요약기(로컬 처리, 비용 없음)
function oneLineSummary(history, maxLen = 60) {
    const last = [...history].reverse().find((h) => h.role === "assistant");
    if (!last) return "요약 없음";
    const txt = last.text.replace(/\s+/g, " ").trim();
    if (txt.length <= maxLen) return txt;
    // 핵심 키워드 단위로 자르기
    const cuts = ["그러나", "하지만", "결국", "곧", "그때", "그리고", "이어"];
    let best = txt.slice(0, maxLen);
    for (const c of cuts) {
        const i = txt.indexOf(c);
        if (i > 0 && i <= maxLen) {
            best = txt.slice(0, i + c.length);
            break;
        }
    }
    return best + "…";
}

// 5) 시스템 프롬프트들 - 3개로 분리
// 5-1) 메인 스토리 및 퀘스트 생성용 프롬프트
function composeMainStoryPrompt({ storyState, history, userAction }) {
    const recent = history.slice(-6).map((h) => {
        const role = h.role === "user" ? "플레이어" : "서술";
        return `- ${role}: ${h.text}`;
    });

    // 현재 진행 중인 퀘스트 정보 구성
    const currentQuest = storyState.currentQuest || storyState.availableQuest;
    const questContext = currentQuest ? `
<Current_Quest_Context>
진행 중인 퀘스트: ${currentQuest.title || "없음"}
퀘스트 목표: ${currentQuest.objective || "없음"}
퀘스트 진행도: ${currentQuest.progress || "시작 단계"}
퀘스트 관련 NPC: ${currentQuest.npc || "없음"}
퀘스트 배경: ${currentQuest.description || "없음"}
</Current_Quest_Context>` : `
<Current_Quest_Context>
진행 중인 퀘스트: 없음
</Current_Quest_Context>`;

    // 최근 완료된 퀘스트의 영향 분석
    const recentQuestImpact = storyState.recentQuestImpact ? `
<Recent_Quest_Impact>
최근 완료 퀘스트: ${storyState.recentQuestImpact.questTitle}
스토리에 미친 영향: ${storyState.recentQuestImpact.storyImpact}
변화된 관계: ${storyState.recentQuestImpact.relationshipChanges || "없음"}
획득한 명성/악명: ${storyState.recentQuestImpact.reputationChange || "없음"}
</Recent_Quest_Impact>` : "";

    const systemSpec = `
당신은 판타지 웹소설 스타일의 텍스트 어드벤처 게임의 GM(Game Master)이자, 전지적 독자 시점 웹소설 작가입니다.

<Player_Data>
직업: \${storyState.player?.job || "모험가"}
레벨: \${storyState.player?.level || 1}
능력치: 힘 \${storyState.player?.stats?.strength || 10}, 민첩 \${storyState.player?.stats?.dexterity || 10}, 지능 \${storyState.player?.stats?.intelligence || 10}, 매력 \${storyState.player?.stats?.charm || 10}
소지품: \${storyState.player?.inventory?.join(", ") || "없음"}
현재 HP: \${storyState.player?.hp || 100}/\${storyState.player?.maxHp || 100}, 마나: \${storyState.player?.mp || 50}/\${storyState.player?.maxMp || 50}
주요 특성/스킬: \${storyState.player?.skills?.join(", ") || "없음"}
완료한 퀘스트: \${storyState.player?.completedQuests?.join(", ") || "없음"}
</Player_Data>

<World_Context>
현재 위치: \${storyState.location || "알 수 없는 곳"}
시간: \${storyState.currentTime || "낮"}
날씨: \${storyState.weather || "맑음"}
주변 환경: \${storyState.environment || "아늑한 여관"}
주변 NPC: \${storyState.nearbyNPCs?.join(", ") || "없음"}
최근 주요 이벤트: \${storyState.lastEvent || "없음"}
</World_Context>

${questContext}

${recentQuestImpact}

<Character_Emotional_State>
현재 감정: 피로 (\${storyState.emotionalState?.fatigue || 3}/10), 호기심 (\${storyState.emotionalState?.curiosity || 7}/10), 경계심 (\${storyState.emotionalState?.wariness || 5}/10), 짜증 (\${storyState.emotionalState?.irritation || 2}/10)
</Character_Emotional_State>

지시사항:
1. 모든 서술은 '전지적 독자 시점 웹소설' 문체로 작성하세요. 시니컬하거나 유머러스한 내면 독백, 재치 있는 표현을 적극 활용하세요.
2. 현재 상황을 생생하게 묘사하고, 플레이어의 감정 상태를 반영한 내면의 독백을 포함하세요.
3. 진행 중인 퀘스트가 있다면 자연스럽게 스토리에 연결하고, 퀘스트 진행 상황을 반영하세요.
4. 최근 완료된 퀘스트의 영향이 있다면 그 결과가 현재 상황에 어떻게 반영되는지 보여주세요.
5. 플레이어가 선택할 수 있는 '내면의 생각' 형태의 선택지를 3~4개 제공하세요. 각 선택지는 따옴표로 묶어 표시하세요.
6. 선택지는 번호 없이 제시하고, 각 선택지는 플레이어 캐릭터의 성격과 현재 감정 상태를 반영해야 합니다.
7. 유쾌한 모험 판타지 분위기를 유지하되, 플레이어의 감정 상태에 따라 서술 톤을 조절하세요.
8. 응답은 항상 200단어 이내로 간결하게 유지하세요.

응답 형식은 반드시 다음 JSON 구조를 따르세요:
{
  "narration": "웹소설 스타일의 상황 서술",
  "choices": ["선택지1", "선택지2", "선택지3", "선택지4"],
  "state": {
    "location": "현재 위치",
    "flags": {},
    "notes": "상황 메모"
  }
}
`;

    const stateSnapshot = `
현재 상태:
- location: ${storyState.location || "여관"}
- flags: ${JSON.stringify(storyState.flags || {})}
- notes: ${storyState.notes ? JSON.stringify(storyState.notes) : "없음"}
`;

    const actionLine = userAction
        ? `플레이어 입력: "${userAction}" 를 반영해 장면을 갱신하라.`
        : `플레이어 자유 입력 없음. 최근 선택을 반영해 장면을 전개하라.`;

    const historyBlock = recent.length
        ? `최근 로그:\n${recent.join("\n")}\n`
        : `최근 로그: 없음\n`;

    return `
${systemSpec}

${stateSnapshot}

${historyBlock}
${actionLine}
`.trim();
}

// 5-2) 전투 시스템용 프롬프트 (수동전투/자동전투)
function composeCombatPrompt({ storyState, history, userAction, combatType }) {
    const recent = history.slice(-6).map((h) => {
        const role = h.role === "user" ? "플레이어" : "서술";
        return `- ${role}: ${h.text}`;
    });

    const systemSpec = combatType === 'manual' ? `
<전투_상황>
플레이어: \${storyState.player?.job || "모험가"} (Lv.\${storyState.player?.level || 1})
HP: \${storyState.player?.hp || 100}/\${storyState.player?.maxHp || 100}
적: \${storyState.combat?.enemyName || "알 수 없는 적"} (\${storyState.combat?.enemyLevel || "Lv.1"})
적 HP: \${storyState.combat?.enemyHp || 100}/\${storyState.combat?.enemyMaxHp || 100}
전투 특이사항: \${storyState.combat?.specialConditions || "없음"}
</전투_상황>

지시사항:
1. 수동 전투를 진행합니다.
2. 모든 서술은 '전지적 독자 시점 웹소설' 문체로 작성하세요.
3. 현재 전투 턴을 생생하게 묘사하고, 플레이어가 취할 수 있는 3~4개의 전략적 행동을 '내면의 생각' 형태로 제시하세요. 각 선택지는 따옴표로 묶어 표시하세요.
4. 전투 묘사에는 플레이어의 감정 상태와 전투 스타일을 반영하세요.
5. 과도하게 잔혹하거나 그로테스크한 묘사는 피하세요.

응답 형식은 반드시 다음 JSON 구조를 따르세요:
{
  "narration": "전투 상황 서술",
  "choices": ["전투 선택지1", "전투 선택지2", "전투 선택지3", "전투 선택지4"],
  "state": {
    "combat": {
      "enemyHp": 현재적HP,
      "playerHp": 현재플레이어HP,
      "turn": 턴수
    },
    "flags": {}
  }
}
` : `
<전투_상황>
플레이어: \${storyState.player?.job || "모험가"} (Lv.\${storyState.player?.level || 1})
HP: \${storyState.player?.hp || 100}/\${storyState.player?.maxHp || 100}
적: \${storyState.combat?.enemyName || "알 수 없는 적"} (\${storyState.combat?.enemyLevel || "Lv.1"})
적 HP: \${storyState.combat?.enemyHp || 100}/\${storyState.combat?.enemyMaxHp || 100}
전투 특이사항: \${storyState.combat?.specialConditions || "없음"}
</전투_상황>

지시사항:
1. 자동 전투를 진행합니다.
2. 모든 서술은 '전지적 독자 시점 웹소설' 문체로 작성하세요.
3. 전투 전체 과정을 간결하고 박진감 있게 서술하고, 주요 공격과 방어 행동에 내면 독백을 추가하세요. 전투 결과와 획득한 전리품을 요약해주세요.
4. 전투 묘사에는 플레이어의 감정 상태와 전투 스타일을 반영하세요.
5. 과도하게 잔혹하거나 그로테스크한 묘사는 피하세요.

응답 형식은 반드시 다음 JSON 구조를 따르세요:
{
  "narration": "자동 전투 전체 과정 서술",
  "choices": ["전투 후 행동1", "전투 후 행동2", "전투 후 행동3"],
  "state": {
    "combat": null,
    "player": {
      "hp": 전투후HP,
      "exp": 획득경험치,
      "inventory": ["획득아이템들"]
    },
    "flags": {
      "battleEnded": true
    }
  }
}
`;

    const stateSnapshot = `
현재 상태:
- location: ${storyState.location || "여관"}
- flags: ${JSON.stringify(storyState.flags || {})}
- notes: ${storyState.notes ? JSON.stringify(storyState.notes) : "없음"}
- combatType: ${combatType || "manual"}
`;

    const actionLine = userAction
        ? `플레이어 입력: "${userAction}" 를 반영해 전투를 진행하라.`
        : `전투 상황을 자동으로 진행하라.`;

    const historyBlock = recent.length
        ? `최근 로그:\n${recent.join("\n")}\n`
        : `최근 로그: 없음\n`;

    return `
${systemSpec}

${stateSnapshot}

${historyBlock}
${actionLine}
`.trim();
}

// 5-3) 아이템 사용용 프롬프트
function composeItemPrompt({ storyState, history, userAction, itemInfo }) {
    const recent = history.slice(-6).map((h) => {
        const role = h.role === "user" ? "플레이어" : "서술";
        return `- ${role}: ${h.text}`;
    });

    const systemSpec = `
<아이템_사용>
사용 아이템: \${itemInfo?.name || "알 수 없는 아이템"}
아이템 효과: \${itemInfo?.effect || "효과 불명"}
현재 상황: \${storyState.currentSituation || storyState.notes || "평범한 상황"}
플레이어 상태: HP \${storyState.player?.hp || 100}/\${storyState.player?.maxHp || 100}, 상태이상 \${storyState.player?.status || "없음"}
</아이템_사용>

지시사항:
1. 플레이어가 \${itemInfo?.name || "아이템"}을(를) 사용하는 장면을 웹소설 문체로 생생하게 묘사하세요.
2. 아이템 사용 효과와 플레이어의 반응을 내면 독백이 포함되도록 서술하세요.
3. 응답은 50단어 이내로 간결하게 유지하세요.

응답 형식은 반드시 다음 JSON 구조를 따르세요:
{
  "narration": "아이템 사용 장면 서술 (50단어 이내)",
  "choices": ["사용 후 행동1", "사용 후 행동2", "사용 후 행동3"],
  "state": {
    "player": {
      "hp": 변경된HP,
      "mp": 변경된MP,
      "status": "상태변화",
      "inventory": ["남은아이템들"]
    },
    "flags": {
      "itemUsed": true
    }
  }
}
`;

    const stateSnapshot = `
현재 상태:
- location: ${storyState.location || "여관"}
- flags: ${JSON.stringify(storyState.flags || {})}
- notes: ${storyState.notes ? JSON.stringify(storyState.notes) : "없음"}
- itemInfo: ${JSON.stringify(itemInfo || {})}
`;

    const actionLine = userAction
        ? `플레이어가 아이템을 사용: "${userAction}"`
        : `아이템 사용 상황을 처리하라.`;

    const historyBlock = recent.length
        ? `최근 로그:\n${recent.join("\n")}\n`
        : `최근 로그: 없음\n`;

    return `
${systemSpec}

${stateSnapshot}

${historyBlock}
${actionLine}
`.trim();
}

// 5-4) 퀘스트 생성용 프롬프트
function composeQuestPrompt({ storyState, history, userAction }) {
    const recent = history.slice(-6).map((h) => {
        const role = h.role === "user" ? "플레이어" : "서술";
        return `- ${role}: ${h.text}`;
    });

    // 메인 스토리 컨텍스트 구성
    const mainStoryContext = `
<Main_Story_Context>
현재 스토리 상황: ${storyState.notes || "평범한 상황"}
최근 주요 이벤트: ${storyState.lastEvent || "특별한 일 없음"}
현재 위치의 특성: ${storyState.environment || "아늑한 여관"}
플레이어 감정 상태: 피로 (${storyState.emotionalState?.fatigue || 3}/10), 호기심 (${storyState.emotionalState?.curiosity || 7}/10), 경계심 (${storyState.emotionalState?.wariness || 5}/10)
스토리 진행 단계: ${storyState.storyPhase || "초기 모험"}
</Main_Story_Context>`;

    // 기존 퀘스트 연관성 분석
    const questHistory = storyState.player?.completedQuests?.length > 0 ? `
<Quest_History_Analysis>
완료한 퀘스트들: ${storyState.player.completedQuests.join(", ")}
퀘스트 완료로 인한 변화: ${storyState.recentQuestImpact?.storyImpact || "아직 큰 변화 없음"}
획득한 명성/관계: ${storyState.recentQuestImpact?.reputationChange || "평범한 모험가"}
</Quest_History_Analysis>` : `
<Quest_History_Analysis>
완료한 퀘스트: 없음 (새로운 모험가)
</Quest_History_Analysis>`;

    const systemSpec = `
<Quest_Generation>
플레이어 레벨: \${storyState.player?.level || 1}
현재 위치: \${storyState.location || "알 수 없는 곳"}
주변 NPC: \${storyState.nearbyNPCs?.join(", ") || "없음"}
플레이어 능력치: 힘 \${storyState.player?.stats?.strength || 10}, 민첩 \${storyState.player?.stats?.dexterity || 10}, 지능 \${storyState.player?.stats?.intelligence || 10}, 매력 \${storyState.player?.stats?.charm || 10}
</Quest_Generation>

${mainStoryContext}

${questHistory}

지시사항:
1. 현재 메인 스토리 상황과 자연스럽게 연결되는 퀘스트를 생성하세요.
2. 플레이어의 감정 상태, 최근 이벤트, 현재 위치의 특성을 반영한 퀘스트를 만드세요.
3. 이전에 완료한 퀘스트들과의 연관성을 고려하여 스토리의 연속성을 유지하세요.
4. 퀘스트는 다음 요소를 포함해야 합니다:
   - 제목: 현재 스토리 상황을 반영한 흥미로운 퀘스트 제목
   - 설명: 메인 스토리와 연결된 퀘스트 배경과 목적
   - 목표: 명확하고 수치화된 완료 조건 (예: "오크 5마리 처치", "마법 수정 3개 수집")
   - 보상: 퀘스트 완료 시 얻을 수 있는 보상 (스토리 진행에 도움이 되는 것 포함)
   - 스토리 영향: 이 퀘스트 완료가 메인 스토리에 미칠 영향 예상
5. 퀘스트는 웹소설 문체로 NPC의 대화나 상황 묘사를 통해 자연스럽게 소개하세요.
6. 퀘스트는 플레이어 레벨과 현재 능력치에 적합한 난이도를 가져야 합니다.
7. 모든 퀘스트는 명확한 종료 조건을 가져야 합니다. 애매하거나 주관적인 완료 조건은 피하세요.
8. 유쾌한 모험 판타지 분위기를 유지하면서, 현재 스토리 톤에 맞는 분위기를 조성하세요.
9. 퀘스트 설명은 150단어 이내로 간결하게 유지하세요.

응답 형식은 반드시 다음 JSON 구조를 따르세요:
{
  "narration": "퀘스트 소개 장면 서술 (150단어 이내)",
  "choices": ["퀘스트 수락", "퀘스트 거절", "더 자세히 묻기"],
  "state": {
    "availableQuest": {
      "title": "퀘스트 제목",
      "description": "퀘스트 설명",
      "objective": "완료 조건",
      "reward": "보상 내용",
      "storyImpact": "이 퀘스트 완료가 메인 스토리에 미칠 영향",
      "npc": "퀘스트 관련 NPC",
      "progress": "시작 단계"
    },
    "flags": {
      "questOffered": true
    }
  }
}
`;

    const stateSnapshot = `
현재 상태:
- location: ${storyState.location || "여관"}
- flags: ${JSON.stringify(storyState.flags || {})}
- notes: ${storyState.notes ? JSON.stringify(storyState.notes) : "없음"}
`;

    const actionLine = userAction
        ? `플레이어 입력: "${userAction}" 를 반영해 퀘스트를 생성하라.`
        : `현재 상황에 맞는 퀘스트를 생성하라.`;

    const historyBlock = recent.length
        ? `최근 로그:\n${recent.join("\n")}\n`
        : `최근 로그: 없음\n`;

    return `
${systemSpec}

${stateSnapshot}

${historyBlock}
${actionLine}
`.trim();
}

// 6) LLM 호출들
async function callGemini(prompt, apiKey, model) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const t0 = performance.now();
    const res = await fetchWithTimeout(
        url,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.85,
                    topP: 0.9,
                    maxOutputTokens: 600,
                },
            }),
        },
        25000
    );
    const t1 = performance.now();
    if (!res.ok) {
        const t = await res.text().catch(() => "");
        const err = new Error(`Gemini error ${res.status}: ${t.slice(0, 200)}`);
        err.latencyMs = Math.round(t1 - t0);
        throw err;
    }
    const data = await res.json();
    const cand = data?.candidates?.[0];
    const parts = cand?.content?.parts || [];
    const text = parts.map((p) => p.text || "").join("\n").trim();
    if (!text) {
        const err = new Error("Gemini 응답 비어있음");
        err.latencyMs = Math.round(t1 - t0);
        throw err;
    }
    return {
        provider: "Gemini",
        model,
        raw: text,
        latencyMs: Math.round(t1 - t0),
        reason: "OK",
    };
}

async function callGroq(prompt) {
    const url = "https://api.groq.com/openai/v1/chat/completions";
    const t0 = performance.now();
    const res = await fetchWithTimeout(
        url,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${groqApiKey}`,
            },
            body: JSON.stringify({
                model: "llama3-70b-8192",
                temperature: 0.85,
                max_tokens: 600,
                messages: [
                    {
                        role: "system",
                        content:
                            "너는 텍스트 어드벤처 RPG의 게임 마스터다. 반드시 JSON만 반환한다.",
                    },
                    { role: "user", content: prompt },
                ],
            }),
        },
        30000
    );
    const t1 = performance.now();
    if (!res.ok) {
        const t = await res.text().catch(() => "");
        const err = new Error(`Groq error ${res.status}: ${t.slice(0, 200)}`);
        err.latencyMs = Math.round(t1 - t0);
        throw err;
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) {
        const err = new Error("Groq 응답 비어있음");
        err.latencyMs = Math.round(t1 - t0);
        throw err;
    }
    return {
        provider: "Groq",
        model: "llama3-70b-8192",
        raw: text,
        latencyMs: Math.round(t1 - t0),
        reason: "OK",
    };
}

function isRetryableError(err) {
    const m = String(err?.message || "").toLowerCase();
    return (
        m.includes("timeout") ||
        m.includes("429") ||
        m.includes("502") ||
        m.includes("503") ||
        m.includes("overloaded") ||
        m.includes("exhausted")
    );
}

async function tryWithBackoff(task, attempts = 2, baseDelay = 250) {
    let lastErr = null;
    for (let i = 0; i < attempts; i++) {
        try {
            return await task();
        } catch (e) {
            lastErr = e;
            if (i === attempts - 1 || !isRetryableError(e)) break;
            const delay = baseDelay * Math.pow(3, i); // 250ms → 750ms
            await sleep(delay);
        }
    }
    throw lastErr;
}

// 6-1) 메인 스토리 LLM 호출
async function callMainStoryLLM(prompt, setRouteStats) {
    // 1) Gemini main (1.5-pro, 2회 백오프 재시도)
    try {
        const r1 = await tryWithBackoff(
            () => callGemini(prompt, mainApiKey, "gemini-2.0-flash-lite"),
            2,
            250
        );
        setRouteStats((s) => ({
            ...s,
            geminiMain: s.geminiMain + 1,
            last: `${r1.provider}(Story)`,
            lastLatencyMs: r1.latencyMs,
            lastReason: r1.reason,
        }));
        return r1;
    } catch (e1) {
        // 2) Gemini backup (1.5-flash, 1회 재시도)
        try {
            const r2 = await tryWithBackoff(
                () => callGemini(prompt, backupApiKey, "gemini-2.5-flash"),
                1,
                300
            );
            setRouteStats((s) => ({
                ...s,
                geminiBackup: s.geminiBackup + 1,
                last: `${r2.provider}(Story)`,
                lastLatencyMs: r2.latencyMs,
                lastReason: r2.reason,
            }));
            return r2;
        } catch (e2) {
            // 3) 최종 Groq 폴백
            const r3 = await callGroq(prompt);
            setRouteStats((s) => ({
                ...s,
                groq: s.groq + 1,
                last: `${r3.provider}(Story)`,
                lastLatencyMs: r3.latencyMs,
                lastReason: r3.reason,
            }));
            return r3;
        }
    }
}

// 6-2) 전투 시스템 LLM 호출
async function callCombatLLM(prompt, setRouteStats) {
    // 1) Gemini main (1.5-pro, 2회 백오프 재시도)
    try {
        const r1 = await tryWithBackoff(
            () => callGemini(prompt, mainApiKey, "gemini-2.0-flash-lite"),
            2,
            250
        );
        setRouteStats((s) => ({
            ...s,
            geminiMain: s.geminiMain + 1,
            last: `${r1.provider}(Combat)`,
            lastLatencyMs: r1.latencyMs,
            lastReason: r1.reason,
        }));
        return r1;
    } catch (e1) {
        // 2) Gemini backup (1.5-flash, 1회 재시도)
        try {
            const r2 = await tryWithBackoff(
                () => callGemini(prompt, backupApiKey, "gemini-2.5-flash"),
                1,
                300
            );
            setRouteStats((s) => ({
                ...s,
                geminiBackup: s.geminiBackup + 1,
                last: `${r2.provider}(Combat)`,
                lastLatencyMs: r2.latencyMs,
                lastReason: r2.reason,
            }));
            return r2;
        } catch (e2) {
            // 3) 최종 Groq 폴백
            const r3 = await callGroq(prompt);
            setRouteStats((s) => ({
                ...s,
                groq: s.groq + 1,
                last: `${r3.provider}(Combat)`,
                lastLatencyMs: r3.latencyMs,
                lastReason: r3.reason,
            }));
            return r3;
        }
    }
}

// 6-3) 아이템 사용 LLM 호출
async function callItemLLM(prompt, setRouteStats) {
    // 1) Gemini main (1.5-pro, 2회 백오프 재시도)
    try {
        const r1 = await tryWithBackoff(
            () => callGemini(prompt, mainApiKey, "gemini-2.0-flash-lite"),
            2,
            250
        );
        setRouteStats((s) => ({
            ...s,
            geminiMain: s.geminiMain + 1,
            last: `${r1.provider}(Item)`,
            lastLatencyMs: r1.latencyMs,
            lastReason: r1.reason,
        }));
        return r1;
    } catch (e1) {
        // 2) Gemini backup (1.5-flash, 1회 재시도)
        try {
            const r2 = await tryWithBackoff(
                () => callGemini(prompt, backupApiKey, "gemini-2.5-flash"),
                1,
                300
            );
            setRouteStats((s) => ({
                ...s,
                geminiBackup: s.geminiBackup + 1,
                last: `${r2.provider}(Item)`,
                lastLatencyMs: r2.latencyMs,
                lastReason: r2.reason,
            }));
            return r2;
        } catch (e2) {
            // 3) 최종 Groq 폴백
            const r3 = await callGroq(prompt);
            setRouteStats((s) => ({
                ...s,
                groq: s.groq + 1,
                last: `${r3.provider}(Item)`,
                lastLatencyMs: r3.latencyMs,
                lastReason: r3.reason,
            }));
            return r3;
        }
    }
}

// 6-4) 퀘스트 생성 LLM 호출
async function callQuestLLM(prompt, setRouteStats) {
    // 1) Gemini main (1.5-pro, 2회 백오프 재시도)
    try {
        const r1 = await tryWithBackoff(
            () => callGemini(prompt, mainApiKey, "gemini-2.0-flash-lite"),
            2,
            250
        );
        setRouteStats((s) => ({
            ...s,
            geminiMain: s.geminiMain + 1,
            last: `${r1.provider}(Quest)`,
            lastLatencyMs: r1.latencyMs,
            lastReason: r1.reason,
        }));
        return r1;
    } catch (e1) {
        // 2) Gemini backup (1.5-flash, 1회 재시도)
        try {
            const r2 = await tryWithBackoff(
                () => callGemini(prompt, backupApiKey, "gemini-2.5-flash"),
                1,
                300
            );
            setRouteStats((s) => ({
                ...s,
                geminiBackup: s.geminiBackup + 1,
                last: `${r2.provider}(Quest)`,
                lastLatencyMs: r2.latencyMs,
                lastReason: r2.reason,
            }));
            return r2;
        } catch (e2) {
            // 3) 최종 Groq 폴백
            const r3 = await callGroq(prompt);
            setRouteStats((s) => ({
                ...s,
                groq: s.groq + 1,
                last: `${r3.provider}(Quest)`,
                lastLatencyMs: r3.latencyMs,
                lastReason: r3.reason,
            }));
            return r3;
        }
    }
}

// 7) 세션 유틸
function getOrCreateSessionId() {
    const existing = window.localStorage.getItem("sessionId");
    if (existing) return existing;
    const sid = `sess_${Date.now()}`;
    window.localStorage.setItem("sessionId", sid);
    return sid;
}

// 8) 메인 컴포넌트
export default function App() {
    const [sessionId, setSessionId] = useState(getOrCreateSessionId);
    const [history, setHistory] = useState([]); // {role:'user'|'assistant', text, model?, ts}
    const [choices, setChoices] = useState([]);
    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);
    const [routeStats, setRouteStats] = useState({
        geminiMain: 0,
        geminiBackup: 0,
        groq: 0,
        last: "-",
        lastLatencyMs: 0,
        lastReason: "-",
    });
    const [storyState, setStoryState] = useState({
        location: "여관",
        flags: { started: true },
        notes: "따뜻한 난로 불빛이 어른거리는 아늑한 여관, 모험의 시작점이다.",
    });
    const [hasMore, setHasMore] = useState(false);
    const lastDocDescRef = useRef(null);
    const logRef = useRef(null);
    const [showPrev, setShowPrev] = useState(false);
    const [cachedSummary, setCachedSummary] = useState("요약 없음");

    // 파생 값: 이전 장면
    const previousScene = useMemo(() => {
        const lastIdx = [...history].reverse().findIndex((h) => h.role === "assistant");
        if (lastIdx === -1) return "이전 장면 없음";
        // reverse index → 원본 index 계산
        const idxFromEnd = lastIdx;
        const idx = history.length - 1 - idxFromEnd;
        return history[idx]?.text || "이전 장면 없음";
    }, [history]);

    // Firestore 세션 초기화/복구 + 로그 페이지네이션
    useEffect(() => {
        const init = async () => {
            const ref = doc(db, "sessions", sessionId);
            const snap = await getDoc(ref);
            if (!snap.exists()) {
                await setDoc(ref, {
                    sessionId,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    routeStats,
                    storyState,
                    lastChoices: [],
                    summary: "",
                });
            } else {
                const data = snap.data();
                if (data?.routeStats) setRouteStats((s) => ({ ...s, ...data.routeStats }));
                if (data?.storyState) setStoryState((prev) => ({ ...prev, ...data.storyState }));
                if (Array.isArray(data?.lastChoices)) setChoices(data.lastChoices.slice(0, 4));
                if (typeof data?.summary === "string") setCachedSummary(data.summary || "요약 없음");
            }

            // 최근 로그부터 페이지네이션 로드 (desc → reverse로 표시)
            const logsCol = collection(db, "sessions", sessionId, "logs");
            const q1 = query(logsCol, orderBy("createdAt", "desc"), limit(PAGE_SIZE));
            const snap1 = await getDocs(q1);
            const docs = snap1.docs;
            const descItems = docs.map((d) => d.data());
            const ascItems = descItems.reverse();
            setHistory(ascItems);
            lastDocDescRef.current = docs[docs.length - 1] || null;
            setHasMore(docs.length === PAGE_SIZE);

            if (ascItems.length === 0) {
                await nextTurn();
            }
        };
        init().catch(() => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId]);

    async function loadMoreOlder() {
        const lastDoc = lastDocDescRef.current;
        if (!lastDoc) return;
        const logsCol = collection(db, "sessions", sessionId, "logs");
        const qMore = query(
            logsCol,
            orderBy("createdAt", "desc"),
            startAfter(lastDoc),
            limit(PAGE_SIZE)
        );
        const snapMore = await getDocs(qMore).catch(() => null);
        if (!snapMore) return;
        const docs = snapMore.docs;
        const olderAsc = docs.map((d) => d.data()).reverse();
        setHistory((prev) => [...olderAsc, ...prev]);
        lastDocDescRef.current = docs[docs.length - 1] || null;
        setHasMore(docs.length === PAGE_SIZE);
    }

    // 스크롤 아래로
    useEffect(() => {
        if (logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight;
        }
    }, [history, choices]);

    // 가시성/AUTO SAVE/언로드
    useEffect(() => {
        const onVis = () => {
            if (document.visibilityState !== "visible") {
                saveMeta().catch(() => {});
            }
        };
        document.addEventListener("visibilitychange", onVis);
        const onUnload = () => {
            navigator.sendBeacon?.(
                "/noop",
                new Blob(["x"], { type: "text/plain" })
            );
        };
        window.addEventListener("beforeunload", onUnload);
        const timer = setInterval(() => saveMeta({ auto: "interval" }).catch(() => {}), AUTO_SAVE_MS);
        return () => {
            document.removeEventListener("visibilitychange", onVis);
            window.removeEventListener("beforeunload", onUnload);
            clearInterval(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [routeStats, storyState, choices]);

    // 선택지 단축키 1/2/3/4
    useEffect(() => {
        const handler = (e) => {
            const tag = (e.target && e.target.tagName) || "";
            if (tag === "INPUT" || tag === "TEXTAREA" || (e.target && e.target.isContentEditable)) return;
            if (busy) return;
            if (e.key === "1") onChoose(0);
            else if (e.key === "2") onChoose(1);
            else if (e.key === "3") onChoose(2);
            else if (e.key === "4") onChoose(3);
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [busy, choices]);

    // 요약 캐시 업데이트
    useEffect(() => {
        const sum = oneLineSummary(history);
        setCachedSummary(sum);
        // 세션 요약 필드 경량 업데이트(부하 방지: 실패 무시)
        saveMeta({ summary: sum }).catch(() => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [history]);

    async function saveMeta(extra = {}) {
        const ref = doc(db, "sessions", sessionId);
        await updateDoc(ref, {
            updatedAt: serverTimestamp(),
            routeStats,
            storyState,
            lastChoices: choices || [],
            ...extra,
        }).catch(() => {});
    }

    async function addLogDoc(entry) {
        const col = collection(db, "sessions", sessionId, "logs");
        await addDoc(col, {
            ...entry,
            createdAt: serverTimestamp(),
        }).catch(() => {});
    }

    async function nextTurn({ userAction, llmType, combatType, itemInfo } = {}) {
        if (busy) return;
        setBusy(true);

        // LLM 타입 결정 로직
        let determinedLLMType = llmType;
        if (!determinedLLMType) {
            // 자동 감지 로직
            if (storyState.flags?.inCombat || userAction?.includes('전투') || userAction?.includes('공격') || userAction?.includes('방어')) {
                determinedLLMType = 'combat';
            } else if (storyState.flags?.usingItem || userAction?.includes('아이템') || userAction?.includes('사용') || itemInfo) {
                determinedLLMType = 'item';
            } else if (storyState.flags?.needQuest || userAction?.includes('퀘스트') || userAction?.includes('의뢰') || userAction?.includes('임무')) {
                determinedLLMType = 'quest';
            } else {
                determinedLLMType = 'story'; // 기본값
            }
        }

        // 적절한 프롬프트 생성
        let prompt;
        switch (determinedLLMType) {
            case 'combat':
                prompt = composeCombatPrompt({ storyState, history, userAction, combatType: combatType || 'manual' });
                break;
            case 'item':
                prompt = composeItemPrompt({ storyState, history, userAction, itemInfo });
                break;
            case 'quest':
                prompt = composeQuestPrompt({ storyState, history, userAction });
                break;
            case 'story':
            default:
                prompt = composeMainStoryPrompt({ storyState, history, userAction });
                break;
        }

        try {
            // 적절한 LLM 호출
            let routed;
            switch (determinedLLMType) {
                case 'combat':
                    routed = await callCombatLLM(prompt, setRouteStats);
                    break;
                case 'item':
                    routed = await callItemLLM(prompt, setRouteStats);
                    break;
                case 'quest':
                    routed = await callQuestLLM(prompt, setRouteStats);
                    break;
                case 'story':
                default:
                    routed = await callMainStoryLLM(prompt, setRouteStats);
                    break;
            }
            
            const parsed = safeParseLLM(routed.raw);

            // 상태/선택지 갱신(2~4개)
            const nextChoices = parsed.choices.slice(0, 4);
            setChoices(nextChoices);
            setStoryState((prev) => {
                const merged = {
                    ...prev,
                    ...parsed.state,
                    flags: { ...(prev.flags || {}), ...((parsed.state || {}).flags || {}) },
                };
                
                // 퀘스트 수락 처리: availableQuest를 currentQuest로 이동
                if (parsed.state?.flags?.questAccepted && parsed.state?.availableQuest) {
                    merged.currentQuest = {
                        ...parsed.state.availableQuest,
                        progress: "진행 중"
                    };
                    merged.availableQuest = null;
                    merged.lastEvent = `퀘스트 '${parsed.state.availableQuest.title}' 수락`;
                }
                
                // 퀘스트 거절 처리
                if (parsed.state?.flags?.questRejected) {
                    merged.availableQuest = null;
                    merged.lastEvent = "퀘스트를 거절했다";
                }
                
                return merged;
            });

            // 로그 추가
            const assistantEntry = {
                role: "assistant",
                text: parsed.narration,
                provider: routed.provider,
                model: routed.model,
                ts: Date.now(),
            };
            setHistory((prev) => [...prev, assistantEntry]);
            await addLogDoc(assistantEntry);

            // 자동 저장 트리거: 전투/퀘 완료 플래그 감지
            const f = (parsed.state || {}).flags || {};
            if (f.battleEnded || f.questCompleted) {
                // 퀘스트 완료 시 메인 스토리에 영향 반영
                if (f.questCompleted && storyState.currentQuest) {
                    const completedQuest = storyState.currentQuest;
                    setStoryState((prev) => ({
                        ...prev,
                        recentQuestImpact: {
                            questTitle: completedQuest.title,
                            storyImpact: completedQuest.storyImpact || "모험 경험이 쌓였다",
                            relationshipChanges: completedQuest.relationshipChanges || "없음",
                            reputationChange: completedQuest.reputationChange || "평범한 모험가"
                        },
                        lastEvent: `퀘스트 '${completedQuest.title}' 완료`,
                        player: {
                            ...prev.player,
                            completedQuests: [
                                ...(prev.player?.completedQuests || []),
                                completedQuest.title
                            ]
                        },
                        currentQuest: null // 현재 퀘스트 초기화
                    }));
                }
                await saveMeta({ trigger: f.battleEnded ? "battleEnded" : "questCompleted" });
            }

            // 메타 저장
            await saveMeta({
                lastProvider: routed.provider,
                lastModel: routed.model,
                lastChoices: nextChoices,
            });
        } catch (_) {
            const failMsg = "요청이 불안정해 장면 생성에 실패했어. 잠시 뒤 다시 시도해줘.";
            const assistantEntry = {
                role: "assistant",
                text: failMsg,
                provider: "N/A",
                model: "N/A",
                ts: Date.now(),
            };
            setHistory((prev) => [...prev, assistantEntry]);
            await addLogDoc(assistantEntry);
        } finally {
            setBusy(false);
        }
    }

    async function onChoose(idx) {
        const choice = choices[idx];
        if (!choice) return;
        const userEntry = { role: "user", text: `[선택] ${choice}`, ts: Date.now() };
        setHistory((prev) => [...prev, userEntry]);
        await addLogDoc(userEntry);
        await nextTurn({ userAction: choice });
    }

    async function onSubmit(e) {
        e.preventDefault();
        const val = input.trim();
        if (!val) return;
        setInput("");
        const userEntry = { role: "user", text: val, ts: Date.now() };
        setHistory((prev) => [...prev, userEntry]);
        await addLogDoc(userEntry);
        await nextTurn({ userAction: val });
    }

    function newSession() {
        window.localStorage.removeItem("sessionId");
        const sid = `sess_${Date.now()}`;
        window.localStorage.setItem("sessionId", sid);
        setSessionId(sid);
        setHistory([]);
        setChoices([]);
        setStoryState({
            location: "여관",
            flags: { started: true },
            notes: "따뜻한 난로 불빛이 어른거리는 아늑한 여관, 모험의 시작점이다.",
        });
    }

    // 스타일(네 베이스 기준선 유지)
    const styles = {
        app: {
            height: "100vh",
            display: "flex",
            flexDirection: "column",
            background: "#0b0f14",
            color: "#f1f5f9",
            fontFamily:
                '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans KR","Apple SD Gothic Neo",sans-serif',
        },
        header: {
            padding: "12px 16px",
            borderBottom: "1px solid #1f2937",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
        },
        badge: {
            fontSize: 12,
            background: "#1f2937",
            padding: "4px 8px",
            borderRadius: 6,
        },
        main: {
            flex: 1,
            display: "flex",
            minHeight: 0,
        },
        log: {
            flex: 1,
            padding: 16,
            overflowY: "auto",
            lineHeight: 1.6,
        },
        bubbleUser: {
            background: "#1f2937",
            borderRadius: 8,
            padding: "8px 12px",
            margin: "6px 0",
            alignSelf: "flex-end",
            maxWidth: 720,
        },
        bubbleAi: {
            background: "#111827",
            borderRadius: 8,
            padding: "10px 12px",
            margin: "8px 0",
            maxWidth: 800,
            whiteSpace: "pre-wrap",
        },
        footer: {
            borderTop: "1px solid #1f2937",
            padding: 12,
            display: "grid",
            gridTemplateColumns: "1fr 360px",
            gap: 12,
            alignItems: "start",
        },
        choicePanel: {
            background: "#0f172a",
            border: "1px solid #1f2937",
            borderRadius: 10,
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            position: "sticky",
            bottom: 12,
        },
        auxRow: {
            display: "flex",
            gap: 8,
            marginBottom: 4,
            flexWrap: "wrap",
        },
        auxBtn: {
            background: "#0b1220",
            border: "1px solid #233046",
            color: "#e5e7eb",
            padding: "6px 8px",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 12,
        },
        choiceBtn: {
            background: "#111827",
            border: "1px solid #374151",
            color: "#e5e7eb",
            padding: "10px 12px",
            borderRadius: 8,
            cursor: "pointer",
            textAlign: "left",
        },
        form: {
            display: "flex",
            gap: 8,
        },
        input: {
            flex: 1,
            background: "#0f172a",
            border: "1px solid #1f2937",
            color: "#e5e7eb",
            borderRadius: 8,
            padding: "12px 14px",
            outline: "none",
        },
        send: {
            background: busy ? "#334155" : "#22c55e",
            border: "none",
            color: "#0b0f14",
            padding: "0 16px",
            borderRadius: 8,
            cursor: busy ? "not-allowed" : "pointer",
            fontWeight: 700,
        },
        metaRow: {
            display: "flex",
            gap: 8,
            fontSize: 12,
            color: "#94a3b8",
            marginTop: 4,
            flexWrap: "wrap",
        },
        summaryBox: {
            fontSize: 12,
            color: "#9ca3af",
            background: "#0b1220",
            border: "1px solid #233046",
            padding: "8px",
            borderRadius: 6,
        },
        grow: {
            flexGrow: 1,
        },
        moreBtn: {
            background: "#0b1220",
            border: "1px solid #233046",
            color: "#cbd5e1",
            padding: "6px 10px",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 12,
            marginBottom: 8,
        },
    };

    return (
        <div style={styles.app}>
            <header style={styles.header}>
                <div style={{ fontWeight: 800 }}>TEXT LLM</div>
                <div style={styles.badge}>세션: {sessionId}</div>
                <div style={styles.badge}>
                    최근 라우팅: {routeStats.last} / M:{routeStats.geminiMain} · B:{routeStats.geminiBackup} · G:{routeStats.groq}
                </div>
                <div style={styles.badge}>
                    지연: {routeStats.lastLatencyMs || 0}ms / 사유: {routeStats.lastReason || "-"}
                </div>
                {busy ? <div style={styles.badge}>생성 중...</div> : null}
                <div style={styles.grow} />
                <button
                    onClick={newSession}
                    style={{
                        background: "#0ea5e9",
                        color: "#0b0f14",
                        border: "none",
                        padding: "8px 12px",
                        borderRadius: 8,
                        cursor: "pointer",
                        fontWeight: 700,
                    }}
                >
                    새 세션 시작
                </button>
            </header>

            <main style={styles.main}>
                <div style={{ padding: 16 }}>
                    {hasMore ? (
                        <button onClick={loadMoreOlder} style={styles.moreBtn} disabled={busy}>
                            이전 로그 더 보기
                        </button>
                    ) : (
                        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>모든 로그를 불러왔어요</div>
                    )}
                </div>
                <div style={styles.log} ref={logRef}>
                    {history.map((h, i) =>
                        h.role === "user" ? (
                            <div key={i} style={styles.bubbleUser}>{h.text}</div>
                        ) : (
                            <div key={i} style={styles.bubbleAi}>
                                {h.text}
                                <div style={styles.metaRow}>
                                    <span>by {h.provider}</span>
                                    {h.model ? <span>· {h.model}</span> : null}
                                </div>
                            </div>
                        )
                    )}
                </div>
            </main>

            <footer style={styles.footer}>
                <form onSubmit={onSubmit} style={styles.form}>
                    <input
                        style={styles.input}
                        placeholder="자유 행동을 입력해 모험을 이끌어봐 (예: '안개 속 노랫소리를 따라간다')"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        disabled={busy}
                    />
                    <button style={styles.send} disabled={busy}>전송</button>
                </form>

                <div style={styles.choicePanel}>
                    <div style={styles.auxRow}>
                        <button style={styles.auxBtn} onClick={() => setShowPrev((v) => !v)} disabled={busy}>
                            이전 장면 보기
                        </button>
                        <div style={styles.summaryBox}>한 줄 요약: {cachedSummary}</div>
                    </div>

                    {showPrev ? (
                        <div style={{ ...styles.summaryBox, marginBottom: 4 }}>{previousScene}</div>
                    ) : null}

                    <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>
                        선택지 (숫자 1/2/3/4 단축키 지원)
                    </div>
                    {choices && choices.length > 0 ? (
                        choices.map((c, idx) => (
                            <button key={idx} style={styles.choiceBtn} onClick={() => onChoose(idx)} disabled={busy}>
                                {idx + 1}. {c}
                            </button>
                        ))
                    ) : (
                        <div style={{ color: "#64748b", fontSize: 13 }}>
                            선택지가 준비되는 중이야. 잠시만...
                        </div>
                    )}
                </div>
            </footer>
        </div>
    );
}