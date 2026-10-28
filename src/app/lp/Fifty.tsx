/* "50%" as an illustration: a gold sale tag with drawn (not typed) numerals, a 3D edge and sparkles */
export default function Fifty() {
  return (
    <svg className="lp-fifty" viewBox="0 0 420 340" role="img" aria-label="50% הנחה">
      <defs>
        <linearGradient id="f-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff2c4" />
          <stop offset=".35" stopColor="#e9cd84" />
          <stop offset=".7" stopColor="#c9a961" />
          <stop offset="1" stopColor="#9c7a3a" />
        </linearGradient>
        <linearGradient id="f-edge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8a6a2e" />
          <stop offset="1" stopColor="#5e4519" />
        </linearGradient>
        <linearGradient id="f-ink" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5A1E94" />
          <stop offset="1" stopColor="#1F0B33" />
        </linearGradient>
        <radialGradient id="f-glow" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#f5e8b0" stopOpacity=".55" />
          <stop offset="1" stopColor="#f5e8b0" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="210" cy="175" r="165" fill="url(#f-glow)" />

      <g transform="rotate(-9 210 175)">
        {/* string to the tag hole */}
        <path d="M100 181 C 64 160, 22 120, 30 76 C 36 46, 70 34, 92 52" fill="none" stroke="#f5e8b0" strokeWidth="3" strokeLinecap="round" opacity=".85" />
        {/* 3D edge, then the tag face */}
        <path d="M118 62 H352 a24 24 0 0 1 24 24 V272 a24 24 0 0 1 -24 24 H118 L52 194 a22 22 0 0 1 0 -26 Z" fill="url(#f-edge)" transform="translate(8 10)" />
        <path d="M118 62 H352 a24 24 0 0 1 24 24 V272 a24 24 0 0 1 -24 24 H118 L52 194 a22 22 0 0 1 0 -26 Z" fill="url(#f-gold)" stroke="#fff4cf" strokeWidth="2" />
        <path d="M128 76 H346 a14 14 0 0 1 14 14 V268 a14 14 0 0 1 -14 14 H128" fill="none" stroke="#9c7a3a" strokeWidth="2" strokeDasharray="6 7" opacity=".55" />
        <circle cx="100" cy="181" r="12" fill="#1F0B33" stroke="#fff4cf" strokeWidth="3" />

        {/* drawn numerals: a shadow pass for depth, then the face */}
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          <g stroke="#5e4519" strokeWidth="26" transform="translate(5 6)" opacity=".55">
            <path d="M202 108 H150 L143 166 C 155 156, 173 153, 188 157 C 213 165, 218 200, 200 220 C 183 239, 154 237, 138 221" />
            <ellipse cx="268" cy="170" rx="26" ry="56" />
            <circle cx="334" cy="120" r="10" />
            <circle cx="356" cy="220" r="10" />
            <path d="M360 108 L330 232" />
          </g>
          <g stroke="url(#f-ink)" strokeWidth="26">
            <path d="M202 108 H150 L143 166 C 155 156, 173 153, 188 157 C 213 165, 218 200, 200 220 C 183 239, 154 237, 138 221" />
            <ellipse cx="268" cy="170" rx="26" ry="56" />
          </g>
          <g stroke="url(#f-ink)" strokeWidth="11">
            <circle cx="334" cy="120" r="10" />
            <circle cx="356" cy="220" r="10" />
          </g>
          <path d="M360 108 L330 232" stroke="url(#f-ink)" strokeWidth="12" />
          {/* highlights on the strokes */}
          <g stroke="#9d6ce7" strokeWidth="5" opacity=".7">
            <path d="M196 108 H156" />
            <path d="M246 140 C 250 124, 257 117, 264 115" />
          </g>
        </g>
      </g>

      {/* sparkles */}
      <g fill="#fff4cf">
        <path className="lp-spark" d="M372 40 l6 16 16 6 -16 6 -6 16 -6 -16 -16 -6 16 -6z" />
        <path className="lp-spark d2" d="M40 268 l4 11 11 4 -11 4 -4 11 -4 -11 -11 -4 11 -4z" />
        <path className="lp-spark d3" d="M392 250 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z" />
        <circle cx="30" cy="120" r="3" opacity=".8" />
        <circle cx="398" cy="150" r="2.5" opacity=".7" />
      </g>
    </svg>
  );
}
