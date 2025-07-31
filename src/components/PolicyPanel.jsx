import React from "react";
import { useGameStore } from "../store/gameSlice";
import policies from "../data/policies.json";

const PolicyPanel = () => {
    const { activePolicies, togglePolicy } = useGameStore();

    return (
        <div
            style={{
                margin: "1rem 0",
                padding: "1rem",
                border: "1px solid #ddd",
                borderRadius: "5px",
                backgroundColor: "#f0f0f0",
            }}
        >
            <h3>정책 결정</h3>
            {policies.map((policy) => {
                const active = activePolicies.includes(policy.id);
                return (
                    <label
                        key={policy.id}
                        style={{
                            display: "block",
                            marginBottom: "0.5rem",
                            cursor: "pointer",
                            color: active ? "green" : "black",
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={active}
                            onChange={() => togglePolicy(policy.id)}
                            style={{ marginRight: "0.5rem" }}
                        />
                        {policy.name} - <em>{policy.description}</em>
                    </label>
                );
            })}
        </div>
    );
};

export default PolicyPanel;
