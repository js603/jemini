import React, { useEffect, useState } from "react";
import { useGameStore } from "../store/gameSlice";

const AdvisorPanel = () => {
    const [advisor, setAdvisor] = useState(null);
    const { turn, advisors } = useGameStore();

    useEffect(() => {
        // 턴별로 무작위 조언자 변경
        const idx = turn % advisors.length;
        setAdvisor(advisors[idx]);
    }, [turn, advisors]);

    if (!advisor) return null;

    return (
        <div
            style={{
                margin: "1rem 0",
                padding: "0.75rem",
                border: "1px dashed #666",
                backgroundColor: "#fff8dc",
            }}
        >
            <strong>{advisor.name}:</strong> {advisor.comment} <br />
            <em>성향: {advisor.personality}</em>
        </div>
    );
};

export default AdvisorPanel;
