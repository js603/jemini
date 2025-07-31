import React from "react";
import { useGameStore } from "../store/gameSlice";
import events from "../data/eventsTree.json";

const EventView = () => {
    const { currentEventId, goToNextEvent } = useGameStore();
    const event = events.find((e) => e.id === currentEventId);

    if (!event) return <div>이벤트를 찾을 수 없습니다.</div>;

    return (
        <section
            style={{
                marginTop: "1rem",
                padding: "1rem",
                border: "1px solid #bbb",
                borderRadius: "5px",
                backgroundColor: "#f9f9f9",
            }}
        >
            <h2>{event.title}</h2>
            <p>{event.description}</p>
            <div>
                {event.options.map((option, idx) => (
                    <button
                        key={idx}
                        onClick={() => goToNextEvent(option.text)}
                        style={{
                            marginRight: "0.5rem",
                            marginTop: "0.5rem",
                            padding: "0.4rem 0.8rem",
                            borderRadius: "4px",
                            cursor: "pointer",
                        }}
                    >
                        {option.text}
                    </button>
                ))}
            </div>
        </section>
    );
};

export default EventView;
