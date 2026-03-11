import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createGravityGolfEngine } from "../game/engine.js";


export default function GravityGolf() {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);

  const [hud, setHud] = useState({
    levelIndex: 0,
    strokes: 0,
    canShoot: true,
    completed: false,
    usedBlackHole: false,
  });

  const [msg, setMsg] = useState(
    "Drag to aim, release to shoot. Enter the wormhole to finish. Black hole is a risky skip."
  );

  const [phase, setPhase] = useState("play"); // play | win

  const onHud = useCallback((h) => setHud(h), []);
  const onMessage = useCallback((m) => setMsg(m), []);
  const onWin = useCallback(() => setPhase("win"), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = createGravityGolfEngine(canvas, {
      onHud,
      onMessage,
      onWin,
    });

    engineRef.current = engine;
    engine.start();

    return () => engine.stop();
  }, [onHud, onMessage, onWin]);

  const resetShot = useCallback(() => engineRef.current?.resetShot(), []);
  const restartLevel = useCallback(() => {
    setPhase("play");
    engineRef.current?.restartLevel();
  }, []);

  const nextLevel = useCallback(() => {
    setPhase("play");
    engineRef.current?.nextLevel();
  }, []);



const title = useMemo(() => {
  return hud.levelName ? `${hud.levelIndex + 1}. ${hud.levelName}` : `Level ${hud.levelIndex + 1}`;
}, [hud.levelIndex, hud.levelName]);

  return (
    <div className="wrap">
      <div className="stage">
        <canvas ref={canvasRef} />
      </div>

      <div className="hud">
        <div className="hudCard">
          <div className="hudTitle">GRAVITY GOLF</div>
          <div className="hudRow">
            <span className="pill">Level: {title}</span>
            <span className="pill">Strokes: {hud.strokes}</span>
            <span className="pill">Shoot: {hud.canShoot ? "Ready" : "Moving"}</span>
            <span className="pill">Black hole: {hud.usedBlackHole ? "Used" : "Unused"}</span>
          </div>
          <div className="msg">{msg}</div>
        </div>
      </div>

      <div className="controls">
        <div className="controlsCard">
          <div className="btnRow">
            <button className="btn" onClick={resetShot}>
              RESET SHOT
            </button>
            <button className="btn" onClick={restartLevel}>
              RESTART LEVEL
            </button>
            <button className="btn" onClick={nextLevel} disabled={!hud.completed && phase !== "win"}>
              NEXT LEVEL
            </button>
          </div>
          <div className="small">
            Wormhole finishes.
            <br />
            Black hole skips one level if you hit the event horizon.
          </div>
        </div>
      </div>

      {phase === "win" ? (
        <div className="overlay">
          <div className="panel">
            <h1 className="bigTitle">WORMHOLE LOCKED</h1>
            <p className="sub">
              Level complete in <b>{hud.strokes}</b> strokes.
              <br />
              Hit Next Level to continue, or Restart to try for a cleaner run.
            </p>
            <div className="btnRow">
              <button className="btn" onClick={nextLevel}>NEXT LEVEL</button>
              <button className="btn" onClick={restartLevel}>RESTART</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}