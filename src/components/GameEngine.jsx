import React, { useEffect } from "react";
import { useGameStore } from "../store/gameSlice";
import { checkVictory } from "../services/victoryChecker";
import EventView from "./EventView";

const GameEngine = () => {
    const { turn, setGameOver, setResult } = useGameStore();

    useEffect(() => {
        const state = useGameStore.getState();
        const outcome = checkVictory(state);
        if (outcome) {
            setGameOver(true);
            setResult(outcome);
        }
    }, [turn]);

    return <EventView />;
};

export default GameEngine;
