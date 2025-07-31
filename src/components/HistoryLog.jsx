import React from "react";
import { useGameStore } from "../store/gameSlice";

const HistoryLog = () => {
    const { history } = useGameStore();

    return (
        <section
            style={{
                marginTop: "2rem",
                padding: "1rem",
                borderTop: "1px solid #ddd",
            }}
        >
            <h3>플레이 히스토리</h3>
            <ul style={{ maxHeight: "200px", overflowY: "auto", paddingLeft: "1.2rem" }}>
                {history.length === 0 && <li>기록이 없습니다.</li>}
                {history.map((entry, i) => (
                    <li key={i} style={{ marginBottom: "0.5rem" }}>
                        <strong>{entry.event}</strong> → 선택: &#34;{entry.choice}&#34; (효과:{" "}
                        {Object.entries(entry.effects)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(", ")})
                    </li>
                ))}
            </ul>
        </section>
    );
};

export default HistoryLog;
