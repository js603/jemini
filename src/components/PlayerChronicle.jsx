import React, { useState } from 'react';

function PlayerChronicle({ chronicle }) {
    return (
        <div className="player-chronicle">
            <h3>플레이어 연대기</h3>
            <div style={{whiteSpace:'pre-line', background:'#f8f9fa', padding:'12px', borderRadius:'8px', marginBottom:'12px'}}>
                {chronicle}
            </div>
        </div>
    );
}

export default PlayerChronicle;
