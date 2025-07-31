// 로컬스토리지 유틸 - JSON stringify/parse 간편 래퍼

export function saveToLocalStorage(key, data) {
    try {
        const json = JSON.stringify(data);
        localStorage.setItem(key, json);
    } catch (e) {
        console.error("로컬스토리지 저장 실패:", e);
    }
}

export function loadFromLocalStorage(key, defaultValue = null) {
    try {
        const json = localStorage.getItem(key);
        if (!json) return defaultValue;
        return JSON.parse(json);
    } catch (e) {
        console.error("로컬스토리지 불러오기 실패:", e);
        return defaultValue;
    }
}

export function clearLocalStorage(key) {
    try {
        localStorage.removeItem(key);
    } catch (e) {
        console.error("로컬스토리지 삭제 실패:", e);
    }
}
