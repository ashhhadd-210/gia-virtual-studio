// avatarData.js — 20 fashion-forward animated SVG avatars
// Each avatar is a self-contained SVG string.
// Usage: import { FEMALE_AVATARS, MALE_AVATARS } from './avatarData';

const makeSVG = (content, bg) =>
    `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="${bg}"/>${content}<style>@keyframes blink{0%,90%,100%{transform:scaleY(1)}95%{transform:scaleY(0.1)}}@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.7}}@keyframes shimmer{0%{stop-color:#fff;stop-opacity:0.3}50%{stop-color:#fff;stop-opacity:0.6}100%{stop-color:#fff;stop-opacity:0.3}}</style></svg>`)}`;
  
  export const FEMALE_AVATARS = [
    {
      id: 'f1',
      name: 'Aurora',
      gender: 'female',
      svg: makeSVG(
        `<defs><radialGradient id="bg1" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#ff6eb4"/><stop offset="100%" stop-color="#c0006a"/></radialGradient></defs>
        <circle cx="50" cy="50" r="50" fill="url(#bg1)"/>
        <g style="animation:float 3s ease-in-out infinite">
          <ellipse cx="50" cy="38" rx="16" ry="18" fill="#ffe0c8"/>
          <ellipse cx="50" cy="28" rx="18" ry="14" fill="#b5006b"/>
          <path d="M34 30 Q50 15 66 30" fill="#8b0045" opacity="0.9"/>
          <path d="M36 32 Q50 45 64 32" fill="none" stroke="#8b0045" stroke-width="1.5"/>
          <ellipse cx="44" cy="37" rx="3" ry="3.5" fill="#ffe0c8" style="animation:blink 3s infinite;transform-origin:44px 37px"/>
          <ellipse cx="56" cy="37" rx="3" ry="3.5" fill="#ffe0c8" style="animation:blink 3s infinite;transform-origin:56px 37px"/>
          <circle cx="44" cy="37" r="1.5" fill="#2d1a0e"/>
          <circle cx="56" cy="37" r="1.5" fill="#2d1a0e"/>
          <path d="M46 42 Q50 45 54 42" fill="none" stroke="#d4706a" stroke-width="1.5" stroke-linecap="round"/>
          <ellipse cx="44" cy="40.5" rx="2" ry="1" fill="#ffb5b5" opacity="0.6"/>
          <ellipse cx="56" cy="40.5" rx="2" ry="1" fill="#ffb5b5" opacity="0.6"/>
        </g>
        <ellipse cx="50" cy="72" rx="18" ry="12" fill="#e8007a" opacity="0.9"/>
        <path d="M38 62 Q50 58 62 62 L65 80 Q50 85 35 80Z" fill="#ff4fa0"/>`,
        '#c0006a'
      ),
    },
    {
      id: 'f2',
      name: 'Celeste',
      gender: 'female',
      svg: makeSVG(
        `<defs><linearGradient id="bg2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#5b2d8a"/><stop offset="100%" stop-color="#2d0a5c"/></linearGradient></defs>
        <circle cx="50" cy="50" r="50" fill="url(#bg2)"/>
        <g style="animation:float 4s ease-in-out infinite">
          <ellipse cx="50" cy="38" rx="15" ry="18" fill="#f5d5b0"/>
          <path d="M33 28 Q50 12 67 28 Q62 22 50 20 Q38 22 33 28Z" fill="#2a1a5e"/>
          <path d="M35 32 L33 22 Q50 16 67 22 L65 32" fill="#3d2880" opacity="0.8"/>
          <ellipse cx="43" cy="37" rx="3.2" ry="3.8" fill="#f5d5b0" style="animation:blink 4s infinite;transform-origin:43px 37px"/>
          <ellipse cx="57" cy="37" rx="3.2" ry="3.8" fill="#f5d5b0" style="animation:blink 4s infinite;transform-origin:57px 37px"/>
          <circle cx="43" cy="37" r="1.8" fill="#1a0a3e"/>
          <circle cx="57" cy="37" r="1.8" fill="#1a0a3e"/>
          <circle cx="43.7" cy="36.3" r="0.6" fill="white"/>
          <circle cx="57.7" cy="36.3" r="0.6" fill="white"/>
          <path d="M44 43 Q50 47 56 43" fill="none" stroke="#c07080" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M40 34 Q43 32 46 34" fill="none" stroke="#3d2880" stroke-width="1.2" stroke-linecap="round"/>
          <path d="M54 34 Q57 32 60 34" fill="none" stroke="#3d2880" stroke-width="1.2" stroke-linecap="round"/>
          <circle cx="50" cy="48" r="1.5" fill="#f5d5b0"/>
          <ellipse cx="42" cy="41" rx="2.5" ry="1.2" fill="#f0a0a0" opacity="0.5"/>
          <ellipse cx="58" cy="41" rx="2.5" ry="1.2" fill="#f0a0a0" opacity="0.5"/>
        </g>
        <path d="M32 60 Q50 55 68 60 L72 85 Q50 90 28 85Z" fill="#4a1a7a"/>
        <ellipse cx="50" cy="60" rx="20" ry="6" fill="#6b2fa0"/>
        <circle cx="42" cy="48" r="4" fill="#f5d5b0"/>
        <circle cx="58" cy="48" r="4" fill="#f5d5b0"/>`,
        '#2d0a5c'
      ),
    },
    {
      id: 'f3',
      name: 'Isla',
      gender: 'female',
      svg: makeSVG(
        `<defs><linearGradient id="bg3" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#00b4a0"/><stop offset="100%" stop-color="#005a50"/></linearGradient></defs>
        <circle cx="50" cy="50" r="50" fill="url(#bg3)"/>
        <g style="animation:float 3.5s ease-in-out infinite">
          <ellipse cx="50" cy="38" rx="14" ry="17" fill="#ffe8d6"/>
          <ellipse cx="50" cy="26" rx="16" ry="10" fill="#006b5c"/>
          <ellipse cx="36" cy="30" rx="5" ry="12" fill="#005a4d" transform="rotate(-15,36,30)"/>
          <ellipse cx="64" cy="30" rx="5" ry="12" fill="#005a4d" transform="rotate(15,64,30)"/>
          <ellipse cx="43.5" cy="37" rx="3" ry="3.5" fill="#ffe8d6" style="animation:blink 3.5s infinite;transform-origin:43.5px 37px"/>
          <ellipse cx="56.5" cy="37" rx="3" ry="3.5" fill="#ffe8d6" style="animation:blink 3.5s infinite;transform-origin:56.5px 37px"/>
          <circle cx="43.5" cy="37" r="1.6" fill="#1a3a38"/>
          <circle cx="56.5" cy="37" r="1.6" fill="#1a3a38"/>
          <path d="M46 43 Q50 46 54 43" fill="none" stroke="#a06060" stroke-width="1.3" stroke-linecap="round"/>
          <ellipse cx="43" cy="41" rx="2" ry="1" fill="#ffb0b0" opacity="0.5"/>
          <ellipse cx="57" cy="41" rx="2" ry="1" fill="#ffb0b0" opacity="0.5"/>
          <circle cx="50" cy="47" r="1.3" fill="#ffe8d6"/>
        </g>
        <path d="M34 60 Q50 56 66 60 L68 85 Q50 90 32 85Z" fill="#00776a"/>
        <rect x="44" y="56" width="12" height="3" rx="1.5" fill="#00a090" style="animation:pulse 2s infinite"/>`,
        '#005a50'
      ),
    },
    {
      id: 'f4',
      name: 'Zara',
      gender: 'female',
      svg: makeSVG(
        `<defs><linearGradient id="bg4" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#e8a020"/><stop offset="100%" stop-color="#b05000"/></linearGradient></defs>
        <circle cx="50" cy="50" r="50" fill="url(#bg4)"/>
        <g style="animation:float 2.8s ease-in-out infinite">
          <ellipse cx="50" cy="38" rx="15" ry="17" fill="#3a1a08"/>
          <path d="M33 28 Q50 10 67 28 Q60 18 50 16 Q40 18 33 28Z" fill="#8b4000"/>
          <path d="M33 28 Q30 20 34 14 Q42 10 50 16 Q40 18 33 28Z" fill="#7a3500"/>
          <path d="M67 28 Q70 20 66 14 Q58 10 50 16 Q60 18 67 28Z" fill="#7a3500"/>
          <ellipse cx="43.5" cy="37" rx="3.2" ry="3.8" fill="#3a1a08" style="animation:blink 2.8s infinite;transform-origin:43.5px 37px"/>
          <ellipse cx="56.5" cy="37" rx="3.2" ry="3.8" fill="#3a1a08" style="animation:blink 2.8s infinite;transform-origin:56.5px 37px"/>
          <ellipse cx="43.5" cy="37" rx="2" ry="2" fill="#7a4010"/>
          <ellipse cx="56.5" cy="37" rx="2" ry="2" fill="#7a4010"/>
          <circle cx="44.2" cy="36.3" r="0.7" fill="white"/>
          <circle cx="57.2" cy="36.3" r="0.7" fill="white"/>
          <path d="M45 43 Q50 47 55 43" fill="none" stroke="#e07060" stroke-width="1.5" stroke-linecap="round"/>
          <ellipse cx="43" cy="41" rx="2.5" ry="1" fill="#e08060" opacity="0.5"/>
          <ellipse cx="57" cy="41" rx="2.5" ry="1" fill="#e08060" opacity="0.5"/>
        </g>
        <path d="M32 62 Q50 57 68 62 L70 85 Q50 92 30 85Z" fill="#c06000"/>
        <circle cx="42" cy="49" r="4.5" fill="#3a1a08"/>
        <circle cx="58" cy="49" r="4.5" fill="#3a1a08"/>`,
        '#b05000'
      ),
    },
    {
      id: 'f5',
      name: 'Luna',
      gender: 'female',
      svg: makeSVG(
        `<defs><linearGradient id="bg5" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#1a1a3e"/><stop offset="100%" stop-color="#0a0a20"/></linearGradient></defs>
        <circle cx="50" cy="50" r="50" fill="url(#bg5)"/>
        <g style="animation:float 5s ease-in-out infinite">
          <ellipse cx="50" cy="38" rx="14" ry="17" fill="#e8d5c0"/>
          <path d="M34 26 Q50 8 66 26" fill="none" stroke="#c0a080" stroke-width="8" stroke-linecap="round"/>
          <path d="M36 30 Q50 22 64 30" fill="none" stroke="#a08060" stroke-width="5" stroke-linecap="round" opacity="0.6"/>
          <ellipse cx="43.5" cy="37" rx="3" ry="3.5" fill="#e8d5c0" style="animation:blink 5s infinite;transform-origin:43.5px 37px"/>
          <ellipse cx="56.5" cy="37" rx="3" ry="3.5" fill="#e8d5c0" style="animation:blink 5s infinite;transform-origin:56.5px 37px"/>
          <ellipse cx="43.5" cy="37" rx="1.8" ry="2" fill="#0a0a30"/>
          <ellipse cx="56.5" cy="37" rx="1.8" ry="2" fill="#0a0a30"/>
          <circle cx="44.2" cy="36.5" r="0.7" fill="white"/>
          <circle cx="57.2" cy="36.5" r="0.7" fill="white"/>
          <path d="M46 43 Q50 46 54 43" fill="none" stroke="#b07090" stroke-width="1.3" stroke-linecap="round"/>
          <path d="M41 35 Q43.5 33 46 35" fill="none" stroke="#0a0a30" stroke-width="1" stroke-linecap="round"/>
          <path d="M54 35 Q56.5 33 59 35" fill="none" stroke="#0a0a30" stroke-width="1" stroke-linecap="round"/>
          <circle cx="50" cy="28" r="3" fill="#ffd700" opacity="0.9" style="animation:pulse 2s infinite"/>
          <circle cx="50" cy="28" r="1.5" fill="white"/>
        </g>
        <path d="M33 62 Q50 56 67 62 L69 85 Q50 92 31 85Z" fill="#1e1e50"/>
        <circle cx="30" cy="20" r="3" fill="white" opacity="0.6" style="animation:pulse 3s infinite"/>
        <circle cx="75" cy="35" r="2" fill="white" opacity="0.5" style="animation:pulse 4s 1s infinite"/>
        <circle cx="20" cy="60" r="1.5" fill="white" opacity="0.4" style="animation:pulse 2.5s 0.5s infinite"/>`,
        '#0a0a20'
      ),
    },
    {
      id: 'f6',
      name: 'Mia',
      gender: 'female',
      svg: makeSVG(
        `<defs><linearGradient id="bg6" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#e83060"/><stop offset="100%" stop-color="#ff8060"/></linearGradient></defs>
        <circle cx="50" cy="50" r="50" fill="url(#bg6)"/>
        <g style="animation:float 3.2s ease-in-out infinite">
          <ellipse cx="50" cy="38" rx="15" ry="18" fill="#ffe0d0"/>
          <path d="M35 28 Q50 18 65 28 Q65 20 58 16 Q50 13 42 16 Q35 20 35 28Z" fill="#d4180a"/>
          <path d="M35 28 Q33 24 36 20 Q42 16 50 16" fill="none" stroke="#ff4040" stroke-width="3" stroke-linecap="round"/>
          <path d="M65 28 Q67 24 64 20 Q58 16 50 16" fill="none" stroke="#ff4040" stroke-width="3" stroke-linecap="round"/>
          <ellipse cx="43.5" cy="37" rx="3.2" ry="3.8" fill="#ffe0d0" style="animation:blink 3.2s infinite;transform-origin:43.5px 37px"/>
          <ellipse cx="56.5" cy="37" rx="3.2" ry="3.8" fill="#ffe0d0" style="animation:blink 3.2s infinite;transform-origin:56.5px 37px"/>
          <ellipse cx="43.5" cy="37" rx="2" ry="2" fill="#2a0808"/>
          <ellipse cx="56.5" cy="37" rx="2" ry="2" fill="#2a0808"/>
          <circle cx="44.3" cy="36.3" r="0.7" fill="white"/>
          <circle cx="57.3" cy="36.3" r="0.7" fill="white"/>
          <path d="M45 43 Q50 47 55 43" fill="#e8505a" stroke="#e8505a" stroke-width="1.5" stroke-linecap="round"/>
          <ellipse cx="43" cy="41.5" rx="2.5" ry="1.2" fill="#ff8080" opacity="0.6"/>
          <ellipse cx="57" cy="41.5" rx="2.5" ry="1.2" fill="#ff8080" opacity="0.6"/>
          <circle cx="50" cy="47.5" r="1.5" fill="#ffe0d0"/>
        </g>
        <path d="M32 60 Q50 55 68 60 L70 85 Q50 92 30 85Z" fill="#e01040"/>`,
        '#e83060'
      ),
    },
    {
      id: 'f7',
      name: 'Priya',
      gender: 'female',
      svg: makeSVG(
        `<defs><linearGradient id="bg7" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#4040c0"/><stop offset="100%" stop-color="#8020c0"/></linearGradient></defs>
        <circle cx="50" cy="50" r="50" fill="url(#bg7)"/>
        <g style="animation:float 4.2s ease-in-out infinite">
          <ellipse cx="50" cy="38" rx="14" ry="17" fill="#f0c8a0"/>
          <path d="M34 28 Q50 12 66 28" fill="#1a0050" stroke="#1a0050" stroke-width="4"/>
          <path d="M34 28 Q32 22 38 18 Q44 14 50 14" fill="none" stroke="#3010a0" stroke-width="6" stroke-linecap="round"/>
          <path d="M66 28 Q68 22 62 18 Q56 14 50 14" fill="none" stroke="#3010a0" stroke-width="6" stroke-linecap="round"/>
          <path d="M34 30 L30 38" stroke="#3010a0" stroke-width="4" stroke-linecap="round"/>
          <path d="M66 30 L70 38" stroke="#3010a0" stroke-width="4" stroke-linecap="round"/>
          <ellipse cx="43.5" cy="37" rx="3" ry="3.5" fill="#f0c8a0" style="animation:blink 4.2s infinite;transform-origin:43.5px 37px"/>
          <ellipse cx="56.5" cy="37" rx="3" ry="3.5" fill="#f0c8a0" style="animation:blink 4.2s infinite;transform-origin:56.5px 37px"/>
          <ellipse cx="43.5" cy="37" rx="1.8" ry="2" fill="#1a0840"/>
          <ellipse cx="56.5" cy="37" rx="1.8" ry="2" fill="#1a0840"/>
          <path d="M46 43 Q50 46.5 54 43" fill="none" stroke="#c07060" stroke-width="1.5" stroke-linecap="round"/>
          <ellipse cx="43" cy="41" rx="2" ry="1" fill="#e09070" opacity="0.5"/>
          <ellipse cx="57" cy="41" rx="2" ry="1" fill="#e09070" opacity="0.5"/>
          <circle cx="50" cy="33" r="2" fill="#ffd700" style="animation:pulse 2s infinite"/>
        </g>
        <path d="M32 62 Q50 56 68 62 L68 85 Q50 92 32 85Z" fill="#5030d0"/>
        <path d="M32 62 L28 80" stroke="#7050e0" stroke-width="3" stroke-linecap="round"/>
        <path d="M68 62 L72 80" stroke="#7050e0" stroke-width="3" stroke-linecap="round"/>`,
        '#4040c0'
      ),
    },
    {
      id: 'f8',
      name: 'Chloe',
      gender: 'female',
      svg: makeSVG(
        `<defs><linearGradient id="bg8" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#a0c840"/><stop offset="100%" stop-color="#507020"/></linearGradient></defs>
        <circle cx="50" cy="50" r="50" fill="url(#bg8)"/>
        <g style="animation:float 3.8s ease-in-out infinite">
          <ellipse cx="50" cy="38" rx="15" ry="18" fill="#ffe8c8"/>
          <ellipse cx="50" cy="26" rx="17" ry="12" fill="#704020"/>
          <ellipse cx="50" cy="22" rx="14" ry="8" fill="#8b5020"/>
          <path d="M35 28 Q38 20 50 18 Q62 20 65 28" fill="none" stroke="#5a2a10" stroke-width="3" stroke-linecap="round"/>
          <ellipse cx="43.5" cy="37" rx="3.2" ry="3.8" fill="#ffe8c8" style="animation:blink 3.8s infinite;transform-origin:43.5px 37px"/>
          <ellipse cx="56.5" cy="37" rx="3.2" ry="3.8" fill="#ffe8c8" style="animation:blink 3.8s infinite;transform-origin:56.5px 37px"/>
          <ellipse cx="43.5" cy="37" rx="2" ry="2" fill="#2a1008"/>
          <ellipse cx="56.5" cy="37" rx="2" ry="2" fill="#2a1008"/>
          <circle cx="44.3" cy="36.3" r="0.7" fill="white"/>
          <circle cx="57.3" cy="36.3" r="0.7" fill="white"/>
          <path d="M46 43 Q50 46.5 54 43" fill="none" stroke="#c08070" stroke-width="1.5" stroke-linecap="round"/>
          <ellipse cx="43" cy="41" rx="2" ry="1" fill="#ffa080" opacity="0.5"/>
          <ellipse cx="57" cy="41" rx="2" ry="1" fill="#ffa080" opacity="0.5"/>
          <path d="M40 35 Q43.5 33.5 47 35" fill="none" stroke="#5a2a10" stroke-width="1.2" stroke-linecap="round"/>
          <path d="M53 35 Q56.5 33.5 60 35" fill="none" stroke="#5a2a10" stroke-width="1.2" stroke-linecap="round"/>
        </g>
        <path d="M33 60 Q50 55 67 60 L69 85 Q50 92 31 85Z" fill="#608030"/>`,
        '#507020'
      ),
    },
    {
      id: 'f9',
      name: 'Eva',
      gender: 'female',
      svg: makeSVG(
        `<defs><linearGradient id="bg9" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#00c8e0"/><stop offset="100%" stop-color="#0060a0"/></linearGradient></defs>
        <circle cx="50" cy="50" r="50" fill="url(#bg9)"/>
        <g style="animation:float 4.5s ease-in-out infinite">
          <ellipse cx="50" cy="38" rx="14" ry="17" fill="#fff0e0"/>
          <ellipse cx="50" cy="25" rx="16" ry="11" fill="#d0e8f8"/>
          <path d="M34 28 Q50 14 66 28 Q58 18 50 16 Q42 18 34 28Z" fill="#a0c8e0"/>
          <ellipse cx="43.5" cy="37" rx="3" ry="3.5" fill="#fff0e0" style="animation:blink 4.5s infinite;transform-origin:43.5px 37px"/>
          <ellipse cx="56.5" cy="37" rx="3" ry="3.5" fill="#fff0e0" style="animation:blink 4.5s infinite;transform-origin:56.5px 37px"/>
          <ellipse cx="43.5" cy="37" rx="1.7" ry="1.9" fill="#003060"/>
          <ellipse cx="56.5" cy="37" rx="1.7" ry="1.9" fill="#003060"/>
          <circle cx="44.2" cy="36.5" r="0.6" fill="white"/>
          <circle cx="57.2" cy="36.5" r="0.6" fill="white"/>
          <path d="M46 43 Q50 46 54 43" fill="none" stroke="#a07080" stroke-width="1.3" stroke-linecap="round"/>
          <ellipse cx="43" cy="41" rx="2" ry="1" fill="#ffb0a0" opacity="0.4"/>
          <ellipse cx="57" cy="41" rx="2" ry="1" fill="#ffb0a0" opacity="0.4"/>
        </g>
        <path d="M33 60 Q50 56 67 60 L69 85 Q50 92 31 85Z" fill="#0070b0"/>
        <path d="M41 60 Q50 54 59 60" fill="none" stroke="#00a8c8" stroke-width="2.5" stroke-linecap="round" style="animation:pulse 2s infinite"/>`,
        '#0060a0'
      ),
    },
    {
      id: 'f10',
      name: 'Yuki',
      gender: 'female',
      svg: makeSVG(
        `<defs><linearGradient id="bg10" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#f8c0e0"/><stop offset="100%" stop-color="#d080b0"/></linearGradient></defs>
        <circle cx="50" cy="50" r="50" fill="url(#bg10)"/>
        <g style="animation:float 3.6s ease-in-out infinite">
          <ellipse cx="50" cy="38" rx="14" ry="17" fill="#fff5f0"/>
          <path d="M34 28 Q50 14 66 28 Q66 16 50 12 Q34 16 34 28Z" fill="#2a1838"/>
          <path d="M34 28 L30 48" stroke="#2a1838" stroke-width="5" stroke-linecap="round"/>
          <path d="M66 28 L70 48" stroke="#2a1838" stroke-width="5" stroke-linecap="round"/>
          <path d="M34 28 L32 38" stroke="#3d2548" stroke-width="4" stroke-linecap="round"/>
          <path d="M66 28 L68 38" stroke="#3d2548" stroke-width="4" stroke-linecap="round"/>
          <ellipse cx="43.5" cy="37" rx="3.2" ry="3.8" fill="#fff5f0" style="animation:blink 3.6s infinite;transform-origin:43.5px 37px"/>
          <ellipse cx="56.5" cy="37" rx="3.2" ry="3.8" fill="#fff5f0" style="animation:blink 3.6s infinite;transform-origin:56.5px 37px"/>
          <ellipse cx="43.5" cy="37" rx="1.8" ry="2" fill="#1a0828"/>
          <ellipse cx="56.5" cy="37" rx="1.8" ry="2" fill="#1a0828"/>
          <circle cx="44.3" cy="36.4" r="0.6" fill="white"/>
          <circle cx="57.3" cy="36.4" r="0.6" fill="white"/>
          <path d="M46 43 Q50 46.5 54 43" fill="none" stroke="#d06090" stroke-width="1.5" stroke-linecap="round"/>
          <ellipse cx="43" cy="41" rx="2.5" ry="1.2" fill="#f090b0" opacity="0.6"/>
          <ellipse cx="57" cy="41" rx="2.5" ry="1.2" fill="#f090b0" opacity="0.6"/>
          <circle cx="50" cy="47.5" r="1.5" fill="#fff5f0"/>
        </g>
        <path d="M33 60 Q50 56 67 60 L69 85 Q50 92 31 85Z" fill="#e080b0"/>
        <circle cx="50" cy="25" r="4" fill="#ff80b0" opacity="0.8" style="animation:pulse 2s infinite"/>`,
        '#d080b0'
      ),
    },
  ];
  
  export const MALE_AVATARS = [
    {
      id: 'm1',
      name: 'Marcus',
      gender: 'male',
      svg: makeSVG(
        `<defs><linearGradient id="mbg1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#1a3a6a"/><stop offset="100%" stop-color="#0a1a40"/></linearGradient></defs>
        <circle cx="50" cy="50" r="50" fill="url(#mbg1)"/>
        <g style="animation:float 3.5s ease-in-out infinite">
          <ellipse cx="50" cy="40" rx="16" ry="19" fill="#e8c8a0"/>
          <path d="M34 28 Q50 12 66 28 Q62 18 50 16 Q38 18 34 28Z" fill="#1a0a04"/>
          <ellipse cx="50" cy="26" rx="17" ry="11" fill="#1a0a04"/>
          <ellipse cx="44" cy="39" rx="3.5" ry="4" fill="#e8c8a0" style="animation:blink 3.5s infinite;transform-origin:44px 39px"/>
          <ellipse cx="56" cy="39" rx="3.5" ry="4" fill="#e8c8a0" style="animation:blink 3.5s infinite;transform-origin:56px 39px"/>
          <ellipse cx="44" cy="39" rx="2.2" ry="2.4" fill="#1a0a04"/>
          <ellipse cx="56" cy="39" rx="2.2" ry="2.4" fill="#1a0a04"/>
          <circle cx="44.8" cy="38.3" r="0.8" fill="white"/>
          <circle cx="56.8" cy="38.3" r="0.8" fill="white"/>
          <path d="M40 35.5 Q44 33.5 48 35.5" fill="none" stroke="#1a0a04" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M52 35.5 Q56 33.5 60 35.5" fill="none" stroke="#1a0a04" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M45 46 Q50 49.5 55 46" fill="none" stroke="#b08060" stroke-width="1.8" stroke-linecap="round"/>
          <rect x="44" y="52" width="12" height="3" rx="1.5" fill="#e8c8a0"/>
        </g>
        <path d="M30 64 Q50 58 70 64 L72 90 Q50 96 28 90Z" fill="#1e2a5a"/>
        <rect x="42" y="62" width="16" height="8" rx="2" fill="#283470"/>`,
        '#0a1a40'
      ),
    },
    {
      id: 'm2',
      name: 'Julian',
      gender: 'male',
      svg: makeSVG(
        `<defs><linearGradient id="mbg2" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#405020"/><stop offset="100%" stop-color="#202808"/></linearGradient></defs>
        <circle cx="50" cy="50" r="50" fill="url(#mbg2)"/>
        <g style="animation:float 4s ease-in-out infinite">
          <ellipse cx="50" cy="40" rx="16" ry="19" fill="#c89868"/>
          <ellipse cx="50" cy="27" rx="18" ry="13" fill="#5a3010"/>
          <path d="M32 30 Q50 12 68 30" fill="none" stroke="#4a2808" stroke-width="5" stroke-linecap="round"/>
          <ellipse cx="44" cy="39" rx="3.5" ry="4" fill="#c89868" style="animation:blink 4s infinite;transform-origin:44px 39px"/>
          <ellipse cx="56" cy="39" rx="3.5" ry="4" fill="#c89868" style="animation:blink 4s infinite;transform-origin:56px 39px"/>
          <ellipse cx="44" cy="39" rx="2.2" ry="2.4" fill="#2a1004"/>
          <ellipse cx="56" cy="39" rx="2.2" ry="2.4" fill="#2a1004"/>
          <circle cx="44.8" cy="38.3" r="0.8" fill="white"/>
          <circle cx="56.8" cy="38.3" r="0.8" fill="white"/>
          <path d="M41 35 Q44 33 47 35" fill="none" stroke="#4a2808" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M53 35 Q56 33 59 35" fill="none" stroke="#4a2808" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M45 46 Q50 50 55 46" fill="none" stroke="#a07050" stroke-width="1.8" stroke-linecap="round"/>
          <path d="M34 50 Q36 56 38 58" stroke="#a07840" stroke-width="3" stroke-linecap="round" fill="none"/>
          <path d="M66 50 Q64 56 62 58" stroke="#a07840" stroke-width="3" stroke-linecap="round" fill="none"/>
        </g>
        <path d="M30 64 Q50 58 70 64 L72 90 Q50 96 28 90Z" fill="#304010"/>
        <path d="M38 64 L35 85" stroke="#405018" stroke-width="4" stroke-linecap="round"/>
        <path d="M62 64 L65 85" stroke="#405018" stroke-width="4" stroke-linecap="round"/>`,
        '#202808'
      ),
    },
    {
      id: 'm3',
      name: 'Ravi',
      gender: 'male',
      svg: makeSVG(
        `<defs><linearGradient id="mbg3" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#c04000"/><stop offset="100%" stop-color="#6a1800"/></linearGradient></defs>
        <circle cx="50" cy="50" r="50" fill="url(#mbg3)"/>
        <g style="animation:float 3.2s ease-in-out infinite">
          <ellipse cx="50" cy="40" rx="15" ry="18" fill="#d4905a"/>
          <path d="M34 28 Q50 14 66 28 Q64 20 50 18 Q36 20 34 28Z" fill="#1a0a04"/>
          <path d="M36 30 Q50 26 64 30" fill="none" stroke="#0a0402" stroke-width="2.5" stroke-linecap="round"/>
          <ellipse cx="44" cy="39" rx="3.2" ry="3.8" fill="#d4905a" style="animation:blink 3.2s infinite;transform-origin:44px 39px"/>
          <ellipse cx="56" cy="39" rx="3.2" ry="3.8" fill="#d4905a" style="animation:blink 3.2s infinite;transform-origin:56px 39px"/>
          <ellipse cx="44" cy="39" rx="2" ry="2.2" fill="#1a0804"/>
          <ellipse cx="56" cy="39" rx="2" ry="2.2" fill="#1a0804"/>
          <circle cx="44.7" cy="38.3" r="0.7" fill="white"/>
          <circle cx="56.7" cy="38.3" r="0.7" fill="white"/>
          <path d="M40 35 Q44 33.5 48 35" fill="none" stroke="#1a0804" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M52 35 Q56 33.5 60 35" fill="none" stroke="#1a0804" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M45 46 Q50 49.5 55 46" fill="none" stroke="#a07050" stroke-width="1.8" stroke-linecap="round"/>
          <path d="M44 49 Q50 52 56 49" fill="none" stroke="#a07050" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
          <ellipse cx="50" cy="28" rx="14" ry="8" fill="#1a0a04"/>
          <path d="M36 24 Q50 16 64 24" fill="none" stroke="#4a1a06" stroke-width="4" stroke-linecap="round"/>
        </g>
        <path d="M31 62 Q50 56 69 62 L71 90 Q50 96 29 90Z" fill="#901800"/>`,
        '#6a1800'
      ),
    },
    {
      id: 'm4',
      name: 'Elias',
      gender: 'male',
      svg: makeSVG(
        `<defs><linearGradient id="mbg4" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#404040"/><stop offset="100%" stop-color="#101010"/></linearGradient></defs>
        <circle cx="50" cy="50" r="50" fill="url(#mbg4)"/>
        <g style="animation:float 4.8s ease-in-out infinite">
          <ellipse cx="50" cy="40" rx="16" ry="19" fill="#f0d8c0"/>
          <ellipse cx="50" cy="26" rx="18" ry="12" fill="#c0c0c0"/>
          <path d="M32 28 Q50 12 68 28 Q64 18 50 16 Q36 18 32 28Z" fill="#c8c8c8"/>
          <ellipse cx="44" cy="39" rx="3.5" ry="4" fill="#f0d8c0" style="animation:blink 4.8s infinite;transform-origin:44px 39px"/>
          <ellipse cx="56" cy="39" rx="3.5" ry="4" fill="#f0d8c0" style="animation:blink 4.8s infinite;transform-origin:56px 39px"/>
          <ellipse cx="44" cy="39" rx="2.2" ry="2.4" fill="#183060"/>
          <ellipse cx="56" cy="39" rx="2.2" ry="2.4" fill="#183060"/>
          <circle cx="44.8" cy="38.3" r="0.8" fill="white"/>
          <circle cx="56.8" cy="38.3" r="0.8" fill="white"/>
          <path d="M40 35 Q44 33 48 35" fill="none" stroke="#183060" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M52 35 Q56 33 60 35" fill="none" stroke="#183060" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M45 47 Q50 50.5 55 47" fill="none" stroke="#b08068" stroke-width="2" stroke-linecap="round"/>
          <path d="M44 52 Q50 55 56 52" fill="none" stroke="#c09080" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M34 44 Q32 48 34 52" stroke="#f0d8c0" stroke-width="3" stroke-linecap="round" fill="none"/>
          <path d="M66 44 Q68 48 66 52" stroke="#f0d8c0" stroke-width="3" stroke-linecap="round" fill="none"/>
        </g>
        <path d="M30 64 Q50 58 70 64 L72 90 Q50 96 28 90Z" fill="#282828"/>`,
        '#101010'
      ),
    },
    {
      id: 'm5',
      name: 'Theo',
      gender: 'male',
      svg: makeSVG(
        `<defs><linearGradient id="mbg5" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#006898"/><stop offset="100%" stop-color="#002848"/></linearGradient></defs>
        <circle cx="50" cy="50" r="50" fill="url(#mbg5)"/>
        <g style="animation:float 3.8s ease-in-out infinite">
          <ellipse cx="50" cy="40" rx="15" ry="18" fill="#e8d0b0"/>
          <path d="M34 26 Q50 10 66 26 Q62 16 50 14 Q38 16 34 26Z" fill="#1a1008"/>
          <path d="M34 26 Q36 20 42 18 Q50 16 58 18 Q64 20 66 26" fill="none" stroke="#0a0804" stroke-width="4" stroke-linecap="round"/>
          <ellipse cx="44" cy="38" rx="3.5" ry="4" fill="#e8d0b0" style="animation:blink 3.8s infinite;transform-origin:44px 38px"/>
          <ellipse cx="56" cy="38" rx="3.5" ry="4" fill="#e8d0b0" style="animation:blink 3.8s infinite;transform-origin:56px 38px"/>
          <ellipse cx="44" cy="38" rx="2.2" ry="2.4" fill="#1a1008"/>
          <ellipse cx="56" cy="38" rx="2.2" ry="2.4" fill="#1a1008"/>
          <circle cx="44.8" cy="37.3" r="0.8" fill="white"/>
          <circle cx="56.8" cy="37.3" r="0.8" fill="white"/>
          <path d="M40 34 Q44 32 48 34" fill="none" stroke="#1a1008" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M52 34 Q56 32 60 34" fill="none" stroke="#1a1008" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M45 46 Q50 49.5 55 46" fill="none" stroke="#906850" stroke-width="1.8" stroke-linecap="round"/>
          <path d="M36 30 L34 42" stroke="#1a1008" stroke-width="4" stroke-linecap="round"/>
          <path d="M64 30 L66 42" stroke="#1a1008" stroke-width="4" stroke-linecap="round"/>
        </g>
        <path d="M30 62 Q50 56 70 62 L72 90 Q50 96 28 90Z" fill="#004870"/>
        <rect x="38" y="62" width="24" height="5" rx="2.5" fill="#0060a0"/>`,
        '#002848'
      ),
    },
    {
      id: 'm6',
      name: 'Omar',
      gender: 'male',
      svg: makeSVG(
        `<defs><linearGradient id="mbg6" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#80a000"/><stop offset="100%" stop-color="#304000"/></linearGradient></defs>
        <circle cx="50" cy="50" r="50" fill="url(#mbg6)"/>
        <g style="animation:float 4.2s ease-in-out infinite">
          <ellipse cx="50" cy="40" rx="15" ry="18" fill="#b88860"/>
          <ellipse cx="50" cy="24" rx="18" ry="14" fill="#1a1804"/>
          <path d="M32 30 Q50 10 68 30 Q64 18 50 16 Q36 18 32 30Z" fill="#0a0e02"/>
          <ellipse cx="44" cy="39" rx="3.5" ry="4" fill="#b88860" style="animation:blink 4.2s infinite;transform-origin:44px 39px"/>
          <ellipse cx="56" cy="39" rx="3.5" ry="4" fill="#b88860" style="animation:blink 4.2s infinite;transform-origin:56px 39px"/>
          <ellipse cx="44" cy="39" rx="2.2" ry="2.4" fill="#2a2810"/>
          <ellipse cx="56" cy="39" rx="2.2" ry="2.4" fill="#2a2810"/>
          <circle cx="44.8" cy="38.3" r="0.8" fill="white"/>
          <circle cx="56.8" cy="38.3" r="0.8" fill="white"/>
          <path d="M41 35 Q44 33 47 35" fill="none" stroke="#1a1804" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M53 35 Q56 33 59 35" fill="none" stroke="#1a1804" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M44 46 Q50 50 56 46" fill="none" stroke="#906040" stroke-width="1.8" stroke-linecap="round"/>
          <path d="M42 50 Q50 54 58 50" fill="none" stroke="#906040" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
        </g>
        <path d="M30 62 Q50 56 70 62 L72 90 Q50 96 28 90Z" fill="#406000"/>
        <ellipse cx="50" cy="63" rx="18" ry="4" fill="#608000" style="animation:pulse 2.5s infinite"/>`,
        '#304000'
      ),
    },
    {
      id: 'm7',
      name: 'Finn',
      gender: 'male',
      svg: makeSVG(
        `<defs><linearGradient id="mbg7" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#a03020"/><stop offset="100%" stop-color="#501008"/></linearGradient></defs>
        <circle cx="50" cy="50" r="50" fill="url(#mbg7)"/>
        <g style="animation:float 3s ease-in-out infinite">
          <ellipse cx="50" cy="40" rx="16" ry="19" fill="#ffe0c8"/>
          <ellipse cx="50" cy="26" rx="18" ry="13" fill="#c04010"/>
          <path d="M32 28 Q50 10 68 28 Q64 18 50 16 Q36 18 32 28Z" fill="#d05020"/>
          <ellipse cx="44" cy="39" rx="3.5" ry="4" fill="#ffe0c8" style="animation:blink 3s infinite;transform-origin:44px 39px"/>
          <ellipse cx="56" cy="39" rx="3.5" ry="4" fill="#ffe0c8" style="animation:blink 3s infinite;transform-origin:56px 39px"/>
          <ellipse cx="44" cy="39" rx="2.2" ry="2.4" fill="#3a2010"/>
          <ellipse cx="56" cy="39" rx="2.2" ry="2.4" fill="#3a2010"/>
          <circle cx="44.8" cy="38.3" r="0.8" fill="white"/>
          <circle cx="56.8" cy="38.3" r="0.8" fill="white"/>
          <path d="M40 35 Q44 33 48 35" fill="none" stroke="#3a2010" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M52 35 Q56 33 60 35" fill="none" stroke="#3a2010" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M45 46 Q50 50 55 46" fill="none" stroke="#b07060" stroke-width="2" stroke-linecap="round"/>
          <path d="M34 44 Q31 50 34 56" stroke="#ffe0c8" stroke-width="3.5" stroke-linecap="round" fill="none"/>
          <path d="M66 44 Q69 50 66 56" stroke="#ffe0c8" stroke-width="3.5" stroke-linecap="round" fill="none"/>
        </g>
        <path d="M30 64 Q50 58 70 64 L72 90 Q50 96 28 90Z" fill="#701808"/>`,
        '#501008'
      ),
    },
    {
      id: 'm8',
      name: 'Luca',
      gender: 'male',
      svg: makeSVG(
        `<defs><linearGradient id="mbg8" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#3060a0"/><stop offset="100%" stop-color="#102040"/></linearGradient></defs>
        <circle cx="50" cy="50" r="50" fill="url(#mbg8)"/>
        <g style="animation:float 4.6s ease-in-out infinite">
          <ellipse cx="50" cy="40" rx="15" ry="18" fill="#e8c898"/>
          <path d="M34 28 Q50 12 66 28 Q62 18 50 16 Q38 18 34 28Z" fill="#3a2010"/>
          <path d="M34 28 Q50 24 66 28" fill="none" stroke="#2a1808" stroke-width="3" stroke-linecap="round"/>
          <ellipse cx="44" cy="39" rx="3.2" ry="3.8" fill="#e8c898" style="animation:blink 4.6s infinite;transform-origin:44px 39px"/>
          <ellipse cx="56" cy="39" rx="3.2" ry="3.8" fill="#e8c898" style="animation:blink 4.6s infinite;transform-origin:56px 39px"/>
          <ellipse cx="44" cy="39" rx="2" ry="2.2" fill="#2a1808"/>
          <ellipse cx="56" cy="39" rx="2" ry="2.2" fill="#2a1808"/>
          <circle cx="44.7" cy="38.3" r="0.7" fill="white"/>
          <circle cx="56.7" cy="38.3" r="0.7" fill="white"/>
          <path d="M40 35 Q44 33 48 35" fill="none" stroke="#2a1808" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M52 35 Q56 33 60 35" fill="none" stroke="#2a1808" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M45 46 Q50 49.5 55 46" fill="none" stroke="#906848" stroke-width="1.8" stroke-linecap="round"/>
          <path d="M44 50 Q50 53.5 56 50" fill="none" stroke="#a07858" stroke-width="1.3" stroke-linecap="round"/>
          <path d="M36 30 L32 44" stroke="#3a2010" stroke-width="4.5" stroke-linecap="round"/>
          <path d="M64 30 L68 44" stroke="#3a2010" stroke-width="4.5" stroke-linecap="round"/>
        </g>
        <path d="M30 62 Q50 56 70 62 L72 90 Q50 96 28 90Z" fill="#1a3878"/>
        <rect x="40" y="62" width="20" height="4" rx="2" fill="#2050a0"/>`,
        '#102040'
      ),
    },
    {
      id: 'm9',
      name: 'Cyrus',
      gender: 'male',
      svg: makeSVG(
        `<defs><linearGradient id="mbg9" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#3a0868"/><stop offset="100%" stop-color="#680838"/></linearGradient></defs>
        <circle cx="50" cy="50" r="50" fill="url(#mbg9)"/>
        <g style="animation:float 3.4s ease-in-out infinite">
          <ellipse cx="50" cy="40" rx="15" ry="18" fill="#e0b898"/>
          <path d="M35 28 Q50 12 65 28 Q62 18 50 16 Q38 18 35 28Z" fill="#0a0018"/>
          <path d="M35 28 L32 44" stroke="#0a0018" stroke-width="5" stroke-linecap="round"/>
          <path d="M65 28 L68 44" stroke="#0a0018" stroke-width="5" stroke-linecap="round"/>
          <path d="M35 28 Q50 22 65 28" fill="none" stroke="#160030" stroke-width="3" stroke-linecap="round"/>
          <ellipse cx="44" cy="39" rx="3.5" ry="4" fill="#e0b898" style="animation:blink 3.4s infinite;transform-origin:44px 39px"/>
          <ellipse cx="56" cy="39" rx="3.5" ry="4" fill="#e0b898" style="animation:blink 3.4s infinite;transform-origin:56px 39px"/>
          <ellipse cx="44" cy="39" rx="2.2" ry="2.4" fill="#160030"/>
          <ellipse cx="56" cy="39" rx="2.2" ry="2.4" fill="#160030"/>
          <circle cx="44.8" cy="38.3" r="0.8" fill="white"/>
          <circle cx="56.8" cy="38.3" r="0.8" fill="white"/>
          <path d="M40 35 Q44 33 48 35" fill="none" stroke="#0a0018" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M52 35 Q56 33 60 35" fill="none" stroke="#0a0018" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M45 46 Q50 50 55 46" fill="none" stroke="#906858" stroke-width="2" stroke-linecap="round"/>
          <path d="M44 50 Q50 54 56 50" fill="none" stroke="#a07868" stroke-width="1.3" stroke-linecap="round"/>
        </g>
        <path d="M30 62 Q50 56 70 62 L72 90 Q50 96 28 90Z" fill="#480858"/>
        <circle cx="50" cy="64" r="4" fill="#8020a0" style="animation:pulse 2.5s infinite"/>`,
        '#3a0868'
      ),
    },
    {
      id: 'm10',
      name: 'Idris',
      gender: 'male',
      svg: makeSVG(
        `<defs><linearGradient id="mbg10" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#008060"/><stop offset="100%" stop-color="#003020"/></linearGradient></defs>
        <circle cx="50" cy="50" r="50" fill="url(#mbg10)"/>
        <g style="animation:float 5s ease-in-out infinite">
          <ellipse cx="50" cy="40" rx="15" ry="18" fill="#9a6840"/>
          <path d="M34 26 Q50 8 66 26 Q62 16 50 14 Q38 16 34 26Z" fill="#0a0802"/>
          <ellipse cx="50" cy="24" rx="17" ry="11" fill="#0a0802"/>
          <ellipse cx="44" cy="39" rx="3.5" ry="4" fill="#9a6840" style="animation:blink 5s infinite;transform-origin:44px 39px"/>
          <ellipse cx="56" cy="39" rx="3.5" ry="4" fill="#9a6840" style="animation:blink 5s infinite;transform-origin:56px 39px"/>
          <ellipse cx="44" cy="39" rx="2.2" ry="2.4" fill="#0a0802"/>
          <ellipse cx="56" cy="39" rx="2.2" ry="2.4" fill="#0a0802"/>
          <circle cx="44.8" cy="38.3" r="0.8" fill="white"/>
          <circle cx="56.8" cy="38.3" r="0.8" fill="white"/>
          <path d="M40 35 Q44 33 48 35" fill="none" stroke="#0a0802" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M52 35 Q56 33 60 35" fill="none" stroke="#0a0802" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M44 46 Q50 50 56 46" fill="none" stroke="#785030" stroke-width="2" stroke-linecap="round"/>
          <path d="M43 50 Q50 54 57 50" fill="none" stroke="#886040" stroke-width="1.3" stroke-linecap="round"/>
          <path d="M34 44 Q32 50 34 56" stroke="#9a6840" stroke-width="4" stroke-linecap="round" fill="none"/>
          <path d="M66 44 Q68 50 66 56" stroke="#9a6840" stroke-width="4" stroke-linecap="round" fill="none"/>
        </g>
        <path d="M30 62 Q50 56 70 62 L72 90 Q50 96 28 90Z" fill="#004830"/>
        <ellipse cx="50" cy="63" rx="16" ry="4" fill="#006040"/>`,
        '#003020'
      ),
    },
  ];
  
  export const ALL_AVATARS = [...FEMALE_AVATARS, ...MALE_AVATARS];
  
  export function getAvatarById(id) {
    return ALL_AVATARS.find(a => a.id === id) ?? null;
  }