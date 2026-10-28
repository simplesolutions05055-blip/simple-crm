/* the price badge "רק 300 ₪ לחודש הראשון !": purple neon frame, "300" and "₪" drawn from the Heebo Black
   outlines (paths, not text) with a purple 3D edge, the two labels as short SVG text */
const P300 = "M564 -883Q621 -883 658.0 -902.5Q695 -922 713.0 -959.5Q731 -997 731 -1050Q731 -1084 714.5 -1115.5Q698 -1147 663.0 -1167.0Q628 -1187 574 -1187Q539 -1187 504.5 -1174.5Q470 -1162 447.5 -1138.5Q425 -1115 425 -1082H65Q65 -1208 134.5 -1296.0Q204 -1384 317.5 -1430.5Q431 -1477 562 -1477Q719 -1477 838.5 -1429.5Q958 -1382 1025.0 -1289.0Q1092 -1196 1092 -1059Q1092 -981 1056.5 -914.5Q1021 -848 958 -799Q921 -770 876 -748Q933 -727 978 -695Q1043 -648 1078.5 -577.0Q1114 -506 1114 -411Q1114 -274 1041.0 -177.5Q968 -81 843.0 -30.5Q718 20 561 20Q470 20 378.0 -4.5Q286 -29 210.5 -80.0Q135 -131 89.0 -212.5Q43 -294 43 -408H405Q405 -371 428.5 -339.5Q452 -308 490.0 -289.0Q528 -270 573 -270Q659 -270 706.5 -316.0Q754 -362 754 -420Q754 -488 731.5 -528.5Q709 -569 666.5 -586.5Q624 -604 564 -604H396V-883Z M2272 -591Q2272 -384 2206.5 -248.5Q2141 -113 2025.5 -46.5Q1910 20 1760 20Q1609 20 1492.5 -46.5Q1376 -113 1310.5 -248.5Q1245 -384 1245 -591V-864Q1245 -1071 1310.0 -1206.5Q1375 -1342 1491.0 -1409.0Q1607 -1476 1758 -1476Q1908 -1476 2024.0 -1409.0Q2140 -1342 2206.0 -1206.5Q2272 -1071 2272 -864ZM1911 -911Q1911 -1016 1892.0 -1075.5Q1873 -1135 1839.0 -1160.0Q1805 -1185 1758 -1185Q1711 -1185 1676.5 -1160.0Q1642 -1135 1623.5 -1075.5Q1605 -1016 1605 -911V-545Q1605 -438 1624.0 -378.0Q1643 -318 1677.5 -294.0Q1712 -270 1760 -270Q1806 -270 1840.0 -294.0Q1874 -318 1892.5 -378.0Q1911 -438 1911 -545Z M3434 -591Q3434 -384 3368.5 -248.5Q3303 -113 3187.5 -46.5Q3072 20 2922 20Q2771 20 2654.5 -46.5Q2538 -113 2472.5 -248.5Q2407 -384 2407 -591V-864Q2407 -1071 2472.0 -1206.5Q2537 -1342 2653.0 -1409.0Q2769 -1476 2920 -1476Q3070 -1476 3186.0 -1409.0Q3302 -1342 3368.0 -1206.5Q3434 -1071 3434 -864ZM3073 -911Q3073 -1016 3054.0 -1075.5Q3035 -1135 3001.0 -1160.0Q2967 -1185 2920 -1185Q2873 -1185 2838.5 -1160.0Q2804 -1135 2785.5 -1075.5Q2767 -1016 2767 -911V-545Q2767 -438 2786.0 -378.0Q2805 -318 2839.5 -294.0Q2874 -270 2922 -270Q2968 -270 3002.0 -294.0Q3036 -318 3054.5 -378.0Q3073 -438 3073 -545Z";
const PSH = "M603 0V-736H949V-303L1207 -302Q1341 -301 1435.0 -370.0Q1529 -439 1529 -576V-1212H1875V-585Q1877 -400 1798.5 -269.0Q1720 -138 1568.0 -69.0Q1416 0 1197 0ZM124 0V-1212H1396V-785Q1396 -755 1390.0 -707.5Q1384 -660 1371.5 -610.0Q1359 -560 1340 -521L1040 -473L1022 -487Q1034 -549 1042.0 -622.5Q1050 -696 1050 -747V-910H471V0Z";

export default function PriceBadge() {
  return (
    <svg className="lp-price" viewBox="0 0 460 300" role="img" aria-label="רק 300 ₪ לחודש הראשון">
      <defs>
        <path id="n300" d={P300} transform="translate(178 86) scale(0.07) translate(-43 1477)" />
        <linearGradient id="pb-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a1170" />
          <stop offset="1" stopColor="#14052a" />
        </linearGradient>
        <linearGradient id="pb-pill" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8a3cff" />
          <stop offset="1" stopColor="#5a1e94" />
        </linearGradient>
        <linearGradient id="pb-face" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".6" stopColor="#f1eaff" />
          <stop offset="1" stopColor="#cdb8ff" />
        </linearGradient>
        <linearGradient id="pb-edge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6a2bd6" />
          <stop offset="1" stopColor="#2a0b52" />
        </linearGradient>
        <filter id="pb-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>

      {/* neon frame: a blurred copy under a sharp line */}
      <rect x="28" y="48" width="404" height="226" rx="38" fill="none" stroke="#b06bff" strokeWidth="10" filter="url(#pb-glow)" opacity=".9" />
      <rect x="28" y="48" width="404" height="226" rx="38" fill="url(#pb-bg)" stroke="#c99bff" strokeWidth="3.5" />

      {/* "רק" chip */}
      <rect x="180" y="18" width="100" height="54" rx="16" fill="url(#pb-pill)" stroke="#d9b8ff" strokeWidth="2.5" transform="rotate(-4 230 45)" />
      <text x="230" y="58" textAnchor="middle" fontFamily="'Heebo LP', Heebo, sans-serif" fontWeight="900" fontSize="34" fill="#fff" transform="rotate(-4 230 45)">רק</text>

      {/* ₪ box */}
      <rect x="92" y="122" width="70" height="62" rx="14" fill="url(#pb-pill)" stroke="#d9b8ff" strokeWidth="2" />
      <path d={PSH} fill="#fff" transform="translate(101 172) scale(0.03) translate(-124 0)" />

      {/* 300 with a purple 3D edge */}
      <g fill="url(#pb-edge)">
          <use href="#n300" transform="translate(6.0 9.6)" />
          <use href="#n300" transform="translate(5.5 8.8)" />
          <use href="#n300" transform="translate(5.0 8.0)" />
          <use href="#n300" transform="translate(4.5 7.2)" />
          <use href="#n300" transform="translate(4.0 6.4)" />
          <use href="#n300" transform="translate(3.5 5.6)" />
          <use href="#n300" transform="translate(3.0 4.8)" />
          <use href="#n300" transform="translate(2.5 4.0)" />
          <use href="#n300" transform="translate(2.0 3.2)" />
          <use href="#n300" transform="translate(1.5 2.4)" />
          <use href="#n300" transform="translate(1.0 1.6)" />
          <use href="#n300" transform="translate(0.5 0.8)" />
      </g>
      <use href="#n300" fill="url(#pb-face)" stroke="#ffffff" strokeWidth="0.8" />

      {/* "לחודש הראשון !" pill */}
      <rect x="66" y="206" width="328" height="56" rx="20" fill="url(#pb-pill)" stroke="#d9b8ff" strokeWidth="2.5" transform="rotate(-3 230 234)" />
      <text x="230" y="245" textAnchor="middle" direction="rtl" fontFamily="'Heebo LP', Heebo, sans-serif" fontWeight="800" fontSize="32" fill="#fff" transform="rotate(-3 230 234)">לחודש הראשון !</text>

      <g fill="#fff">
        <path className="lp-spark" d="M420 40 l5 13 13 5 -13 5 -5 13 -5 -13 -13 -5 13 -5z" />
        <path className="lp-spark d2" d="M40 250 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4z" />
      </g>
    </svg>
  );
}
