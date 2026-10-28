/* the "50%" badge, a sibling of the price badge: the same neon frame, chip, purple edge and pill.
   "50%" is the Heebo Black outline as a path, not text */
const P50 = "M99 -706 189 -1456H1053V-1166H483L452 -913Q475 -925 530.5 -943.5Q586 -962 653 -962Q799 -962 899.5 -905.0Q1000 -848 1052.5 -738.0Q1105 -628 1105 -470Q1105 -348 1049.5 -235.5Q994 -123 880.5 -51.5Q767 20 592 20Q493 20 399.5 -11.0Q306 -42 231.5 -100.0Q157 -158 114.0 -239.5Q71 -321 73 -421H435Q438 -354 480.0 -312.0Q522 -270 589 -270Q652 -270 685.5 -303.0Q719 -336 731.5 -388.5Q744 -441 744 -499Q744 -565 724.5 -611.5Q705 -658 662.5 -682.5Q620 -707 550 -707Q480 -707 441.0 -682.0Q402 -657 386 -636Z M2262 -591Q2262 -384 2196.5 -248.5Q2131 -113 2015.5 -46.5Q1900 20 1750 20Q1599 20 1482.5 -46.5Q1366 -113 1300.5 -248.5Q1235 -384 1235 -591V-864Q1235 -1071 1300.0 -1206.5Q1365 -1342 1481.0 -1409.0Q1597 -1476 1748 -1476Q1898 -1476 2014.0 -1409.0Q2130 -1342 2196.0 -1206.5Q2262 -1071 2262 -864ZM1901 -911Q1901 -1016 1882.0 -1075.5Q1863 -1135 1829.0 -1160.0Q1795 -1185 1748 -1185Q1701 -1185 1666.5 -1160.0Q1632 -1135 1613.5 -1075.5Q1595 -1016 1595 -911V-545Q1595 -438 1614.0 -378.0Q1633 -318 1667.5 -294.0Q1702 -270 1750 -270Q1796 -270 1830.0 -294.0Q1864 -318 1882.5 -378.0Q1901 -438 1901 -545Z M2789 -107 2623 -191 3334 -1329 3500 -1245ZM3410 20Q3300 20 3226.5 -21.0Q3153 -62 3116.0 -130.0Q3079 -198 3079 -280V-357Q3079 -439 3116.0 -507.0Q3153 -575 3226.0 -616.0Q3299 -657 3408 -657Q3520 -657 3593.0 -616.0Q3666 -575 3701.5 -507.0Q3737 -439 3737 -357V-280Q3737 -198 3701.5 -130.0Q3666 -62 3593.5 -21.0Q3521 20 3410 20ZM3410 -180Q3454 -180 3474.5 -194.0Q3495 -208 3501.0 -230.5Q3507 -253 3507 -280V-357Q3507 -396 3482.5 -426.5Q3458 -457 3408 -457Q3358 -457 3333.5 -426.5Q3309 -396 3309 -357V-280Q3309 -253 3323.0 -230.5Q3337 -208 3360.0 -194.0Q3383 -180 3410 -180ZM2722 -800Q2612 -800 2539.0 -841.0Q2466 -882 2429.5 -950.0Q2393 -1018 2393 -1099V-1176Q2393 -1259 2429.5 -1327.0Q2466 -1395 2538.5 -1436.0Q2611 -1477 2720 -1477Q2832 -1477 2905.0 -1436.0Q2978 -1395 3013.5 -1327.0Q3049 -1259 3049 -1176V-1099Q3049 -1018 3013.5 -950.0Q2978 -882 2905.5 -841.0Q2833 -800 2722 -800ZM2722 -1000Q2756 -1000 2777.0 -1014.0Q2798 -1028 2808.5 -1050.5Q2819 -1073 2819 -1099V-1176Q2819 -1203 2808.5 -1226.0Q2798 -1249 2776.0 -1263.0Q2754 -1277 2720 -1277Q2688 -1277 2666.0 -1263.0Q2644 -1249 2633.0 -1226.0Q2622 -1203 2622 -1176V-1099Q2622 -1073 2633.0 -1050.5Q2644 -1028 2666.5 -1014.0Q2689 -1000 2722 -1000Z";

export default function Badge50() {
  return (
    <svg className="lp-b50" viewBox="0 0 300 260" role="img" aria-label="50% הנחה בחודש הראשון">
      <defs>
        <path id="n50" d={P50} transform="translate(40 92) scale(0.06) translate(-73 1477)" />
        <linearGradient id="b5-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a1170" />
          <stop offset="1" stopColor="#14052a" />
        </linearGradient>
        <linearGradient id="b5-pill" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8a3cff" />
          <stop offset="1" stopColor="#5a1e94" />
        </linearGradient>
        <linearGradient id="b5-face" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".6" stopColor="#f1eaff" />
          <stop offset="1" stopColor="#cdb8ff" />
        </linearGradient>
        <linearGradient id="b5-edge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6a2bd6" />
          <stop offset="1" stopColor="#2a0b52" />
        </linearGradient>
        <filter id="b5-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      <rect x="22" y="44" width="256" height="188" rx="34" fill="none" stroke="#b06bff" strokeWidth="9" filter="url(#b5-glow)" opacity=".9" />
      <rect x="22" y="44" width="256" height="188" rx="34" fill="url(#b5-bg)" stroke="#c99bff" strokeWidth="3.5" />

      <rect x="96" y="16" width="108" height="50" rx="15" fill="url(#b5-pill)" stroke="#d9b8ff" strokeWidth="2.5" transform="rotate(4 150 41)" />
      <text x="150" y="53" textAnchor="middle" fontFamily="Heebo, sans-serif" fontWeight="900" fontSize="30" fill="#fff" transform="rotate(4 150 41)">הנחה</text>

      <g fill="url(#b5-edge)">
        <use href="#n50" transform="translate(4.50 7.50)" />
        <use href="#n50" transform="translate(4.05 6.75)" />
        <use href="#n50" transform="translate(3.60 6.00)" />
        <use href="#n50" transform="translate(3.15 5.25)" />
        <use href="#n50" transform="translate(2.70 4.50)" />
        <use href="#n50" transform="translate(2.25 3.75)" />
        <use href="#n50" transform="translate(1.80 3.00)" />
        <use href="#n50" transform="translate(1.35 2.25)" />
        <use href="#n50" transform="translate(0.90 1.50)" />
        <use href="#n50" transform="translate(0.45 0.75)" />
      </g>
      <use href="#n50" fill="url(#b5-face)" stroke="#fff" strokeWidth="0.8" />

      <rect x="44" y="190" width="212" height="48" rx="18" fill="url(#b5-pill)" stroke="#d9b8ff" strokeWidth="2.5" transform="rotate(3 150 214)" />
      <text x="150" y="223" textAnchor="middle" direction="rtl" fontFamily="Heebo, sans-serif" fontWeight="800" fontSize="22" fill="#fff" transform="rotate(3 150 214)">על החודש הראשון</text>
    </svg>
  );
}
