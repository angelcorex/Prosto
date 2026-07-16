/**
 * Geometric line background.
 * All lines span full edges or form fully closed shapes.
 * Proportions are based on a 16:10 (1440×900) viewport grid.
 */
export function GridBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute inset-0"
      >
        {/*
          Grid columns: 1440 / 6 = 240px steps → 240 480 720 960 1200
          Grid rows:     900 / 5 = 180px steps → 180 360 540 720
        */}

        {/* ── Subtle background grid ── */}
        <line x1="0" y1="180" x2="1440" y2="180" stroke="currentColor" strokeOpacity="0.035" strokeWidth="1"/>
        <line x1="0" y1="360" x2="1440" y2="360" stroke="currentColor" strokeOpacity="0.035" strokeWidth="1"/>
        <line x1="0" y1="540" x2="1440" y2="540" stroke="currentColor" strokeOpacity="0.035" strokeWidth="1"/>
        <line x1="0" y1="720" x2="1440" y2="720" stroke="currentColor" strokeOpacity="0.035" strokeWidth="1"/>

        <line x1="240"  y1="0" x2="240"  y2="900" stroke="currentColor" strokeOpacity="0.035" strokeWidth="1"/>
        <line x1="480"  y1="0" x2="480"  y2="900" stroke="currentColor" strokeOpacity="0.035" strokeWidth="1"/>
        <line x1="720"  y1="0" x2="720"  y2="900" stroke="currentColor" strokeOpacity="0.035" strokeWidth="1"/>
        <line x1="960"  y1="0" x2="960"  y2="900" stroke="currentColor" strokeOpacity="0.035" strokeWidth="1"/>
        <line x1="1200" y1="0" x2="1200" y2="900" stroke="currentColor" strokeOpacity="0.035" strokeWidth="1"/>

        {/*
          ── Full-viewport diagonals ──
          Each starts on one edge and ends on the opposite edge.
          Slope A: rise/run = 900/1440 = 0.625
          Slope B: rise/run = 900/720  = 1.25  (steeper)
        */}

        {/* Primary X — corner to corner */}
        <line x1="0" y1="0"   x2="1440" y2="900" stroke="currentColor" strokeOpacity="0.06" strokeWidth="1"/>
        <line x1="0" y1="900" x2="1440" y2="0"   stroke="currentColor" strokeOpacity="0.06" strokeWidth="1"/>

        {/*
          Parallel to NW→SE, shifted right by 480px:
          x1=480 y1=0  →  x2=1440 y2=562  (562 = 480 * 0.625 capped at 900)
          exit bottom: x1=0 y1=300 → x2=1440 y2=900  (300 = 480*0.625)
        */}
        <line x1="480" y1="0"   x2="1440" y2="600" stroke="currentColor" strokeOpacity="0.04" strokeWidth="1"/>
        <line x1="0"   y1="300" x2="960"  y2="900" stroke="currentColor" strokeOpacity="0.04" strokeWidth="1"/>

        {/*
          Parallel to SW→NE, shifted left by 480px:
          x1=0 y1=600 → x2=960 y2=0
          x1=480 y1=900 → x2=1440 y2=300
        */}
        <line x1="0"   y1="600" x2="960"  y2="0"   stroke="currentColor" strokeOpacity="0.04" strokeWidth="1"/>
        <line x1="480" y1="900" x2="1440" y2="300"  stroke="currentColor" strokeOpacity="0.04" strokeWidth="1"/>

        {/*
          ── Closed rectangles aligned to the grid ──
          Outer: 1 cell margin = 240×180 inset
          Inner: 2 cell margin = 480×360 inset
        */}
        <rect x="240"  y="180" width="960" height="540"
              fill="none" stroke="currentColor" strokeOpacity="0.05" strokeWidth="1"/>
        <rect x="480"  y="360" width="480" height="180"
              fill="none" stroke="currentColor" strokeOpacity="0.04" strokeWidth="1"/>

        {/*
          ── Closed diamonds — vertices on grid intersections ──
          Diamond A: centered top-left quadrant (grid cell 1×1)
            top(240,0) right(480,180) bottom(240,360) left(0,180)
          Diamond B: centered bottom-right quadrant
            top(1200,540) right(1440,720) bottom(1200,900) left(960,720)
        */}
        <polygon
          points="240,0 480,180 240,360 0,180"
          fill="none" stroke="currentColor" strokeOpacity="0.06" strokeWidth="1"
        />
        <polygon
          points="1200,540 1440,720 1200,900 960,720"
          fill="none" stroke="currentColor" strokeOpacity="0.06" strokeWidth="1"
        />
      </svg>
    </div>
  );
}
