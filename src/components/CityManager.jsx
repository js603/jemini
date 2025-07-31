import React from "react";
import { useGameStore } from "../store/gameSlice";

const CityManager = () => {
    const { cities } = useGameStore();

    return (
        <div
            style={{
                margin: "1rem 0",
                padding: "1rem",
                border: "1px solid #ccc",
                borderRadius: "6px",
                backgroundColor: "#fff",
            }}
        >
            <h3>도시 관리</h3>
            {cities.map((city) => (
                <div
                    key={city.id}
                    style={{
                        marginBottom: "0.8rem",
                        padding: "0.5rem",
                        border: "1px solid #aaa",
                        borderRadius: "4px",
                        backgroundColor: "#fafafa",
                    }}
                >
                    <strong>{city.name}</strong> | 인구: {city.population} | 식량 생산:{" "}
                    {city.foodProduction} | 군사 주둔: {city.armyStationed}
                </div>
            ))}
        </div>
    );
};

export default CityManager;
