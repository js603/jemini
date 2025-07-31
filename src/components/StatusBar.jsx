import React from "react";
import { useGameStore } from "../store/gameSlice";

const StatusBar = () => {
    const { turn, population, gold, food, army, trust, dissatisfaction } = useGameStore();

    return (
        <div
            style={{
                marginBottom: "1rem",
                padding: "0.5rem",
                border: "1px solid #ccc",
                borderRadius: "4px",
                backgroundColor: "#fafafa",
            }}
        >
            <strong>턴:</strong> {turn} | <strong>인구:</strong> {population} |{" "}
            <strong>금:</strong> {gold} | <strong>식량:</strong> {food} |{" "}
            <strong>군사:</strong> {army} | <strong>신뢰:</strong> {trust} |{" "}
            <strong>불만도:</strong> {dissatisfaction}
        </div>
    );
};

export default StatusBar;
