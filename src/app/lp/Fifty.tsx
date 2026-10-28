/* "50%" as a 3D gold illustration: the Heebo Black outlines of "50%" (paths, not text), extruded in layers,
   a polished gold face with a highlight, a soft floor shadow and sparkles. Gold on the page's purple. */
const D = "M99 -706 189 -1456H1053V-1166H483L452 -913Q475 -925 530.5 -943.5Q586 -962 653 -962Q799 -962 899.5 -905.0Q1000 -848 1052.5 -738.0Q1105 -628 1105 -470Q1105 -348 1049.5 -235.5Q994 -123 880.5 -51.5Q767 20 592 20Q493 20 399.5 -11.0Q306 -42 231.5 -100.0Q157 -158 114.0 -239.5Q71 -321 73 -421H435Q438 -354 480.0 -312.0Q522 -270 589 -270Q652 -270 685.5 -303.0Q719 -336 731.5 -388.5Q744 -441 744 -499Q744 -565 724.5 -611.5Q705 -658 662.5 -682.5Q620 -707 550 -707Q480 -707 441.0 -682.0Q402 -657 386 -636Z M2262 -591Q2262 -384 2196.5 -248.5Q2131 -113 2015.5 -46.5Q1900 20 1750 20Q1599 20 1482.5 -46.5Q1366 -113 1300.5 -248.5Q1235 -384 1235 -591V-864Q1235 -1071 1300.0 -1206.5Q1365 -1342 1481.0 -1409.0Q1597 -1476 1748 -1476Q1898 -1476 2014.0 -1409.0Q2130 -1342 2196.0 -1206.5Q2262 -1071 2262 -864ZM1901 -911Q1901 -1016 1882.0 -1075.5Q1863 -1135 1829.0 -1160.0Q1795 -1185 1748 -1185Q1701 -1185 1666.5 -1160.0Q1632 -1135 1613.5 -1075.5Q1595 -1016 1595 -911V-545Q1595 -438 1614.0 -378.0Q1633 -318 1667.5 -294.0Q1702 -270 1750 -270Q1796 -270 1830.0 -294.0Q1864 -318 1882.5 -378.0Q1901 -438 1901 -545Z M2789 -107 2623 -191 3334 -1329 3500 -1245ZM3410 20Q3300 20 3226.5 -21.0Q3153 -62 3116.0 -130.0Q3079 -198 3079 -280V-357Q3079 -439 3116.0 -507.0Q3153 -575 3226.0 -616.0Q3299 -657 3408 -657Q3520 -657 3593.0 -616.0Q3666 -575 3701.5 -507.0Q3737 -439 3737 -357V-280Q3737 -198 3701.5 -130.0Q3666 -62 3593.5 -21.0Q3521 20 3410 20ZM3410 -180Q3454 -180 3474.5 -194.0Q3495 -208 3501.0 -230.5Q3507 -253 3507 -280V-357Q3507 -396 3482.5 -426.5Q3458 -457 3408 -457Q3358 -457 3333.5 -426.5Q3309 -396 3309 -357V-280Q3309 -253 3323.0 -230.5Q3337 -208 3360.0 -194.0Q3383 -180 3410 -180ZM2722 -800Q2612 -800 2539.0 -841.0Q2466 -882 2429.5 -950.0Q2393 -1018 2393 -1099V-1176Q2393 -1259 2429.5 -1327.0Q2466 -1395 2538.5 -1436.0Q2611 -1477 2720 -1477Q2832 -1477 2905.0 -1436.0Q2978 -1395 3013.5 -1327.0Q3049 -1259 3049 -1176V-1099Q3049 -1018 3013.5 -950.0Q2978 -882 2905.5 -841.0Q2833 -800 2722 -800ZM2722 -1000Q2756 -1000 2777.0 -1014.0Q2798 -1028 2808.5 -1050.5Q2819 -1073 2819 -1099V-1176Q2819 -1203 2808.5 -1226.0Q2798 -1249 2776.0 -1263.0Q2754 -1277 2720 -1277Q2688 -1277 2666.0 -1263.0Q2644 -1249 2633.0 -1226.0Q2622 -1203 2622 -1176V-1099Q2622 -1073 2633.0 -1050.5Q2644 -1028 2666.5 -1014.0Q2689 -1000 2722 -1000Z";

export default function Fifty() {
  return (
    <svg className="lp-fifty" viewBox="0 0 400 240" role="img" aria-label="50% הנחה">
      <defs>
        <path id="g50" d={D} transform="translate(22 40) scale(0.0965) translate(-73 1477)" />
        <linearGradient id="gf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff3c9" />
          <stop offset=".28" stopColor="#f3d98f" />
          <stop offset=".5" stopColor="#d9b25e" />
          <stop offset=".62" stopColor="#b8893b" />
          <stop offset=".8" stopColor="#e2bf6e" />
          <stop offset="1" stopColor="#f7e3a6" />
        </linearGradient>
        <linearGradient id="gs" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8a6424" />
          <stop offset="1" stopColor="#4f3610" />
        </linearGradient>
        <linearGradient id="gh" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".75" />
          <stop offset=".45" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="gfloor" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#000" stopOpacity=".45" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="gglow" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#f5e8b0" stopOpacity=".45" />
          <stop offset="1" stopColor="#f5e8b0" stopOpacity="0" />
        </radialGradient>
        <clipPath id="gclip"><use href="#g50" /></clipPath>
      </defs>

      <ellipse cx="200" cy="120" rx="200" ry="115" fill="url(#gglow)" />
      <ellipse cx="205" cy="212" rx="170" ry="14" fill="url(#gfloor)" />

      {/* extrusion: the same outline stacked down and to the right, darkest at the back */}
      <g fill="url(#gs)">
        <use href="#g50" transform="translate(8.80 14.40)" />
        <use href="#g50" transform="translate(8.25 13.50)" />
        <use href="#g50" transform="translate(7.70 12.60)" />
        <use href="#g50" transform="translate(7.15 11.70)" />
        <use href="#g50" transform="translate(6.60 10.80)" />
        <use href="#g50" transform="translate(6.05 9.90)" />
        <use href="#g50" transform="translate(5.50 9.00)" />
        <use href="#g50" transform="translate(4.95 8.10)" />
        <use href="#g50" transform="translate(4.40 7.20)" />
        <use href="#g50" transform="translate(3.85 6.30)" />
        <use href="#g50" transform="translate(3.30 5.40)" />
        <use href="#g50" transform="translate(2.75 4.50)" />
        <use href="#g50" transform="translate(2.20 3.60)" />
        <use href="#g50" transform="translate(1.65 2.70)" />
        <use href="#g50" transform="translate(1.10 1.80)" />
        <use href="#g50" transform="translate(0.55 0.90)" />
      </g>
      {/* face */}
      <use href="#g50" fill="url(#gf)" stroke="#fff4cf" strokeWidth="1.2" />
      {/* polished highlight on the top half of the face */}
      <rect x="0" y="0" width="400" height="240" fill="url(#gh)" clipPath="url(#gclip)" />

      <g fill="#fff4cf">
        <path className="lp-spark" d="M362 18 l6 15 15 6 -15 6 -6 15 -6 -15 -15 -6 15 -6z" />
        <path className="lp-spark d2" d="M28 176 l4 11 11 4 -11 4 -4 11 -4 -11 -11 -4 11 -4z" />
        <path className="lp-spark d3" d="M150 26 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z" />
      </g>
    </svg>
  );
}
