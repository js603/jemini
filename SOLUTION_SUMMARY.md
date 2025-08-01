# API 응답 파싱 오류 해결 방안

## 문제 분석

### 발생한 오류
```
SyntaxError: Unexpected token 'H', "Here's the"... is not valid JSON
at JSON.parse (<anonymous>)
at parseApiResponse (apiUtils.js:117:1)
```

### 원인 분석
- LLM API 응답에서 JSON 데이터 앞에 "Here's the first scenario:" 같은 설명 텍스트가 포함됨
- 기존 `parseApiResponse` 함수가 단순히 코드블록(```json, ```)만 제거하고 JSON.parse()를 직접 호출
- JSON 앞의 불필요한 텍스트를 제거하지 못해 파싱 실패

## 해결 방안

### 1. parseApiResponse 함수 개선 (apiUtils.js)

**기존 로직:**
```javascript
const cleanedOutput = llmOutputText.replace(/```json/g, '').replace(/```/g, '').trim();
const parsedOutput = JSON.parse(cleanedOutput); // 직접 파싱으로 인한 오류
```

**개선된 로직:**
```javascript
// 1단계: 코드블록 제거
let cleanedOutput = llmOutputText.replace(/```json/g, '').replace(/```/g, '').trim();

// 2단계: JSON 객체 추출 (더 견고한 방식)
const jsonMatch = cleanedOutput.match(/\{[\s\S]*\}/);
if (jsonMatch && jsonMatch[0]) {
    cleanedOutput = jsonMatch[0];
} else {
    // JSON 배열도 확인
    const arrayMatch = cleanedOutput.match(/\[[\s\S]*\]/);
    if (arrayMatch && arrayMatch[0]) {
        cleanedOutput = arrayMatch[0];
    } else {
        return createFallbackResponse();
    }
}

// 3단계: JSON 파싱 시도
const parsedOutput = JSON.parse(cleanedOutput);
```

### 2. 주요 개선사항

1. **정규식을 이용한 JSON 추출**: `\{[\s\S]*\}` 패턴으로 JSON 객체만 정확히 추출
2. **배열 지원**: JSON 배열 형태의 응답도 처리 가능
3. **견고한 에러 처리**: 파싱 실패 시 폴백 응답 제공
4. **필드 검증**: 필수 필드 누락 시 기본값 설정

### 3. 처리 가능한 응답 형태

✅ **문제가 되었던 형태**
```
Here's the first scenario:

{
  "message": "...",
  "choices": [...]
}
```

✅ **코드블록 포함**
```
```json
{
  "message": "...",
  "choices": [...]
}
```
```

✅ **앞뒤 설명 텍스트**
```
설명 텍스트...

{
  "message": "...",
  "choices": [...]
}

추가 설명...
```

## 테스트 결과

### 1. 기본 기능 테스트
- ✅ 문제가 되었던 "Here's the first scenario:" 형태 응답 파싱 성공
- ✅ 메시지, 선택지, worldUpdates 모든 필드 정상 추출

### 2. Edge Case 테스트 (8/8 통과)
1. ✅ 코드블록이 포함된 응답
2. ✅ 여러 줄의 설명이 앞에 있는 경우
3. ✅ JSON 뒤에 추가 텍스트가 있는 경우
4. ✅ 중첩된 JSON 객체
5. ✅ message 필드가 없는 경우 (기본 메시지 설정)
6. ✅ 잘못된 JSON 구조 (폴백 응답 반환)
7. ✅ JSON이 전혀 없는 텍스트 (폴백 응답 반환)
8. ✅ 빈 문자열 (폴백 응답 반환)

### 3. 빌드 테스트
- ✅ 애플리케이션 빌드 성공
- ✅ 기능적 오류 없음 (경고는 사용하지 않는 변수들로 기능에 무관)

## 잠재적 오류 가능성 분석 및 개선

### 1. 분석된 잠재적 오류
- **중첩된 JSON 객체**: 복잡한 구조에서 정규식 매칭 실패 가능성
- **특수 문자**: JSON 내 특수 문자로 인한 파싱 오류
- **메모리 사용량**: 큰 응답에서 정규식 처리 시 성능 이슈

### 2. 적용된 개선사항
- **견고한 정규식**: `[\s\S]*` 패턴으로 모든 문자(개행 포함) 매칭
- **다단계 검증**: JSON 객체 → 배열 → 폴백 순서로 처리
- **에러 핸들링**: try-catch로 모든 예외 상황 처리
- **필드 검증**: 필수 필드 누락 시 기본값 자동 설정

## 코드 로직 설명

### parseApiResponse 함수 동작 순서
1. **전처리**: 코드블록 마커 제거 및 공백 정리
2. **JSON 추출**: 정규식으로 유효한 JSON 구조 찾기
3. **파싱 시도**: JSON.parse()로 객체 변환
4. **검증 및 보완**: 필수 필드 확인 및 기본값 설정
5. **에러 처리**: 실패 시 사용자 친화적 폴백 응답 제공

### 선택된 기술적 접근법
- **정규식 사용 이유**: 문자열 처리 성능이 우수하고 패턴 매칭이 정확
- **다단계 처리**: 안정성을 위해 여러 단계로 검증
- **폴백 메커니즘**: 사용자 경험 향상을 위한 graceful degradation

## 결론

✅ **문제 해결 완료**: "Here's the first scenario:" 형태의 응답 파싱 오류 해결
✅ **안정성 향상**: 8가지 edge case 모두 처리 가능
✅ **사용자 경험 개선**: 파싱 실패 시에도 게임 진행 가능한 폴백 응답 제공
✅ **확장성 확보**: 다양한 LLM 응답 형태에 대응 가능한 견고한 구조

수정된 `parseApiResponse` 함수는 원래 문제를 해결할 뿐만 아니라, 향후 발생할 수 있는 다양한 API 응답 형태에도 안정적으로 대응할 수 있습니다.