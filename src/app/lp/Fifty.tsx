/* "50%" as an illustration: a gold starburst seal with a purple center and drawn (not typed) numerals */
const burst = (n: number, ro: number, ri: number, cx = 200, cy = 200) =>
  Array.from({ length: n * 2 }, (_, i) => {
    const r = i % 2 ? ri : ro, a = (Math.PI * i) / n - Math.PI / 2;
    return (cx + r * Math.cos(a)).toFixed(1) + "," + (cy + r * Math.sin(a)).toFixed(1);
  }).join(" ");

export default function Fifty() {
  return (
    <svg className="lp-fifty" viewBox="0 0 400 400" role="img" aria-label="50% הנחה">
      <defs>
        <linearGradient id="s-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff2c4" />
          <stop offset=".4" stopColor="#e9cd84" />
          <stop offset=".75" stopColor="#c9a961" />
          <stop offset="1" stopColor="#9c7a3a" />
        </linearGradient>
        <linearGradient id="s-num" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6d6" />
          <stop offset=".55" stopColor="#f0d58e" />
          <stop offset="1" stopColor="#c9a961" />
        </linearGradient>
        <radialGradient id="s-core" cx=".5" cy=".38" r=".7">
          <stop offset="0" stopColor="#7a35c4" />
          <stop offset=".6" stopColor="#4a1a80" />
          <stop offset="1" stopColor="#24093f" />
        </radialGradient>
        <radialGradient id="s-glow" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#f5e8b0" stopOpacity=".5" />
          <stop offset="1" stopColor="#f5e8b0" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="200" cy="200" r="198" fill="url(#s-glow)" />
      {/* slow turning rays behind the seal */}
      <g className="lp-rays" opacity=".35">
        <polygon points={burst(16, 196, 150)} fill="#f5e8b0" />
      </g>
      {/* the seal: a shadow edge, the gold burst, a ring, the purple core */}
      <polygon points={burst(24, 168, 148, 205, 210)} fill="#5e4519" opacity=".6" />
      <polygon points={burst(24, 168, 148)} fill="url(#s-gold)" stroke="#fff4cf" strokeWidth="2" />
      <circle cx="200" cy="200" r="134" fill="none" stroke="#9c7a3a" strokeWidth="2" strokeDasharray="4 7" />
      <circle cx="200" cy="200" r="122" fill="url(#s-core)" stroke="#fff4cf" strokeWidth="3" />
      <path d="M110 140 A 110 110 0 0 1 270 110" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" opacity=".18" />

      {/* drawn numerals: a dark offset for depth, then the gold face */}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round" transform="translate(-8 -6)">
        <g stroke="#12041f" strokeWidth="24" transform="translate(4 6)" opacity=".7">
          <path d="M178 140 H132 L126 190 C 136 182, 152 179, 165 183 C 187 190, 191 221, 175 239 C 160 256, 134 254, 120 240" />
          <ellipse cx="226" cy="197" rx="22" ry="50" />
          <circle cx="282" cy="152" r="9" />
          <circle cx="302" cy="242" r="9" />
          <path d="M306 140 L278 254" />
        </g>
        <g stroke="url(#s-num)" strokeWidth="24">
          <path d="M178 140 H132 L126 190 C 136 182, 152 179, 165 183 C 187 190, 191 221, 175 239 C 160 256, 134 254, 120 240" />
          <ellipse cx="226" cy="197" rx="22" ry="50" />
        </g>
        <g stroke="url(#s-num)" strokeWidth="10">
          <circle cx="282" cy="152" r="9" />
          <circle cx="302" cy="242" r="9" />
        </g>
        <path d="M306 140 L278 254" stroke="url(#s-num)" strokeWidth="11" />
        <g stroke="#fff" strokeWidth="4" opacity=".75">
          <path d="M172 140 H138" />
          <path d="M208 170 C 211 156, 217 150, 223 148" />
        </g>
      </g>

      {/* sparkles */}
      <g fill="#fff4cf">
        <path className="lp-spark" d="M346 46 l7 18 18 7 -18 7 -7 18 -7 -18 -18 -7 18 -7z" />
        <path className="lp-spark d2" d="M46 318 l5 13 13 5 -13 5 -5 13 -5 -13 -13 -5 13 -5z" />
        <path className="lp-spark d3" d="M364 300 l4 9 9 4 -9 4 -4 9 -4 -9 -9 -4 9 -4z" />
        <circle cx="40" cy="96" r="3.5" opacity=".8" />
      </g>
    </svg>
  );
}
