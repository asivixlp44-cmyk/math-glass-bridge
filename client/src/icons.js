// Chunky outlined HUD icons drawn as inline SVG (trophy, rainbow spring, planet, gift...).
// Elements with data-icon="name" get the matching SVG when the page loads.
const K = '#16121f';
const RAINBOW = ['#ff3a3a', '#ff9a1e', '#ffe14a', '#46ec50', '#28c8ff', '#8a5cff'];
const WHEEL_COLS = ['#ff3a5a', '#ffd028', '#46ec50', '#28c8ff', '#c46bff', '#ff8a1e'];
export const ICONS = {
    cash: `<svg viewBox="0 0 64 64" aria-hidden="true">
        <rect x="6" y="20" width="48" height="28" rx="4" fill="#2fae36" stroke="${K}" stroke-width="3.5" transform="rotate(-8 30 34)"/>
        <rect x="10" y="16" width="48" height="28" rx="4" fill="#5ee86a" stroke="${K}" stroke-width="3.5"/>
        <circle cx="34" cy="30" r="8" fill="#2fae36" stroke="${K}" stroke-width="3"/>
        <text x="34" y="35.5" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="15" fill="#eaffea">$</text>
        <path d="M15 21h6M47 39h6" stroke="#eaffea" stroke-width="3" stroke-linecap="round"/></svg>`,
    calc: `<svg viewBox="0 0 64 64" aria-hidden="true">
        <rect x="12" y="5" width="40" height="54" rx="6" fill="#5a6480" stroke="${K}" stroke-width="3.5"/>
        <rect x="17" y="10" width="30" height="12" rx="2" fill="#b8ffb0" stroke="${K}" stroke-width="2.5"/>
        ${[0, 1, 2].map((r) => [0, 1, 2].map((c) => `<rect x="${17 + c * 11}" y="${27 + r * 10}" width="8" height="7" rx="1.5" fill="${c === 2 ? '#ff9a1e' : '#ffffff'}" stroke="${K}" stroke-width="2"/>`).join('')).join('')}</svg>`,
    crate: `<svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M8 22l24-12 24 12-24 12z" fill="#ff8fd0" stroke="${K}" stroke-width="3.5" stroke-linejoin="round"/>
        <path d="M8 22v22l24 12V34z" fill="#e8409a" stroke="${K}" stroke-width="3.5" stroke-linejoin="round"/>
        <path d="M56 22v22L32 56V34z" fill="#c428ff" stroke="${K}" stroke-width="3.5" stroke-linejoin="round"/>
        <text x="21" y="47" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="16" fill="#ffffff">?</text></svg>`,
    wheel: `<svg viewBox="0 0 64 64" aria-hidden="true">
        ${WHEEL_COLS.map((c, i) => { const a0 = i / 6 * Math.PI * 2, a1 = (i + 1) / 6 * Math.PI * 2; return `<path d="M32 34L${(32 + Math.cos(a0) * 26).toFixed(1)} ${(34 + Math.sin(a0) * 26).toFixed(1)}A26 26 0 0 1 ${(32 + Math.cos(a1) * 26).toFixed(1)} ${(34 + Math.sin(a1) * 26).toFixed(1)}z" fill="${c}"/>`; }).join('')}
        <circle cx="32" cy="34" r="26" fill="none" stroke="${K}" stroke-width="4"/>
        <circle cx="32" cy="34" r="6" fill="#ffffff" stroke="${K}" stroke-width="3"/>
        <path d="M26 2h12l-6 12z" fill="#ff3a5a" stroke="${K}" stroke-width="3" stroke-linejoin="round"/></svg>`,
    path: `<svg viewBox="0 0 64 64" aria-hidden="true">
        <ellipse cx="22" cy="40" rx="9" ry="13" fill="#ffd028" stroke="${K}" stroke-width="3.5" transform="rotate(-12 22 40)"/>
        <ellipse cx="42" cy="20" rx="9" ry="13" fill="#ffd028" stroke="${K}" stroke-width="3.5" transform="rotate(12 42 20)"/>
        <circle cx="19" cy="58" r="4" fill="#ffd028" stroke="${K}" stroke-width="3"/><circle cx="45" cy="38" r="4" fill="#ffd028" stroke="${K}" stroke-width="3"/></svg>`,
    skull: `<svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M32 6C18 6 9 16 9 29c0 8 4 13 9 16v9h28v-9c5-3 9-8 9-16C55 16 46 6 32 6z" fill="#ffffff" stroke="${K}" stroke-width="3.5" stroke-linejoin="round"/>
        <circle cx="22" cy="30" r="7" fill="${K}"/><circle cx="42" cy="30" r="7" fill="${K}"/>
        <path d="M32 38l-4 7h8z" fill="${K}"/><path d="M26 54v-6M32 54v-6M38 54v-6" stroke="${K}" stroke-width="3"/></svg>`,
    skip: `<svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M5 12l23 20L5 52z" fill="#ffffff" stroke="${K}" stroke-width="3.5" stroke-linejoin="round"/>
        <path d="M27 12l23 20-23 20z" fill="#ffffff" stroke="${K}" stroke-width="3.5" stroke-linejoin="round"/>
        <rect x="51" y="12" width="7" height="40" rx="2" fill="#ffffff" stroke="${K}" stroke-width="3.5"/></svg>`,
    heart: `<svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M32 56S6 40 6 22C6 13 13 7 21 7c5 0 9 3 11 7 2-4 6-7 11-7 8 0 15 6 15 15 0 18-26 34-26 34z" fill="#ff3a5a" stroke="${K}" stroke-width="3.5" stroke-linejoin="round"/>
        <path d="M18 16c-4 1-6 5-5 9" stroke="#ffb0b8" stroke-width="4" stroke-linecap="round" fill="none"/></svg>`,
    bolt: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M36 4L12 36h16l-6 24 28-34H34z" fill="#ffd028" stroke="${K}" stroke-width="3.5" stroke-linejoin="round"/></svg>`,
    crown: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M6 20l14 12 12-22 12 22 14-12-6 32H12z" fill="#ffd028" stroke="${K}" stroke-width="3.5" stroke-linejoin="round"/>
        <circle cx="32" cy="38" r="5" fill="#ff3a5a" stroke="${K}" stroke-width="2.5"/></svg>`,
    coil: `<svg viewBox="0 0 64 64" aria-hidden="true">
        ${[0, 1, 2, 3, 4].map((i) => `<ellipse cx="32" cy="${14 + i * 9}" rx="18" ry="6" fill="none" stroke="${K}" stroke-width="7"/><ellipse cx="32" cy="${14 + i * 9}" rx="18" ry="6" fill="none" stroke="${i % 2 ? '#6fe0ff' : '#ffd028'}" stroke-width="3.5"/>`).join('')}</svg>`,
    trophy: `<svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M17 13H7c0 11 6 16 13 16M47 13h10c0 11-6 16-13 16" fill="none" stroke="${K}" stroke-width="8" stroke-linecap="round"/>
        <path d="M17 13H7c0 11 6 16 13 16M47 13h10c0 11-6 16-13 16" fill="none" stroke="#ffb51c" stroke-width="3.5" stroke-linecap="round"/>
        <path d="M16 6h32v16c0 11-7 18-16 18S16 33 16 22z" fill="#ffc72a" stroke="${K}" stroke-width="3.5"/>
        <path d="M22 11v10c0 6 4 11 8 12" fill="none" stroke="#fff1a8" stroke-width="3.5" stroke-linecap="round"/>
        <path d="M27 39h10v8H27z" fill="#e3940c" stroke="${K}" stroke-width="3.5"/>
        <rect x="16" y="46" width="32" height="11" rx="3" fill="#ffc72a" stroke="${K}" stroke-width="3.5"/></svg>`,
    rebirth: `<svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r="26" fill="#ffffff" stroke="${K}" stroke-width="4"/>
        <path d="M6 32a26 26 0 0 1 52 0z" fill="#e82434" stroke="${K}" stroke-width="4"/>
        <path d="M6 32h52" stroke="${K}" stroke-width="5"/>
        <circle cx="32" cy="32" r="8" fill="#ffffff" stroke="${K}" stroke-width="4"/>
        <path d="M17 18a18 18 0 0 1 8-5" stroke="#ff9aa2" stroke-width="4" stroke-linecap="round" fill="none"/></svg>`,
    gift: `<svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M32 20c-4-10-16-12-16-5s10 6 16 5zm0 0c4-10 16-12 16-5s-10 6-16 5z" fill="#ffc72a" stroke="${K}" stroke-width="3.5" stroke-linejoin="round"/>
        <rect x="8" y="20" width="48" height="12" rx="2" fill="#ff4a5a" stroke="${K}" stroke-width="3.5"/>
        <rect x="12" y="31" width="40" height="27" rx="2" fill="#e82434" stroke="${K}" stroke-width="3.5"/>
        <path d="M27 20h10v38H27z" fill="#ffc72a" stroke="${K}" stroke-width="3.5"/>
        <path d="M15 35v18" stroke="#ff8a96" stroke-width="3" stroke-linecap="round"/></svg>`,
    // Rainbow coil spring: the jump icon
    spring: `<svg viewBox="0 0 64 64" aria-hidden="true">
        ${RAINBOW.map((c, i) => `<rect x="9" y="${6 + i * 9}" width="46" height="8" rx="4" fill="${c}" stroke="${K}" stroke-width="3"/>`).join('')}
        <path d="M14 9h14" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" opacity="0.7"/></svg>`,
    sparkle: `<svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M30 4l6 18 18 6-18 6-6 18-6-18-18-6 18-6z" fill="#ffe14a" stroke="${K}" stroke-width="3.5" stroke-linejoin="round"/>
        <path d="M50 38l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="#c28cff" stroke="${K}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M12 42l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#6fe0ff" stroke="${K}" stroke-width="2.5" stroke-linejoin="round"/></svg>`,
    calendar: `<svg viewBox="0 0 64 64" aria-hidden="true">
        <rect x="8" y="12" width="48" height="46" rx="5" fill="#ffffff" stroke="${K}" stroke-width="3.5"/>
        <path d="M8 17a5 5 0 0 1 5-5h38a5 5 0 0 1 5 5v9H8z" fill="#e82434" stroke="${K}" stroke-width="3.5"/>
        <path d="M20 6v12M44 6v12" stroke="${K}" stroke-width="5" stroke-linecap="round"/>
        <text x="32" y="51" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="22" fill="${K}">21</text></svg>`,
    scroll: `<svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M14 8h34a6 6 0 0 1 6 6v40a4 4 0 0 1-4 4H18a6 6 0 0 1-6-6V12" fill="#ffe7a8" stroke="${K}" stroke-width="3.5" stroke-linejoin="round"/>
        <path d="M12 12a4 4 0 0 1 8 0v6h-8z" fill="#ffc72a" stroke="${K}" stroke-width="3"/>
        <path d="M24 22h20M24 31h20M24 40h14" stroke="#b07a2a" stroke-width="3.5" stroke-linecap="round"/></svg>`,
    ticket: `<svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M6 20l38-12 4 10a6 6 0 0 0 8 4l4 10-38 12-4-10a6 6 0 0 0-8-4z" fill="#ff4a5a" stroke="${K}" stroke-width="3.5" stroke-linejoin="round"/>
        <path d="M26 16l7 22" stroke="#ffffff" stroke-width="3" stroke-dasharray="4 4"/>
        <circle cx="41" cy="26" r="4" fill="#ffd028" stroke="${K}" stroke-width="2.5"/></svg>`,
    gear: `<svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M28 4h8l2 8 6 3 7-4 6 6-4 7 3 6 8 2v8l-8 2-3 6 4 7-6 6-7-4-6 3-2 8h-8l-2-8-6-3-7 4-6-6 4-7-3-6-8-2v-8l8-2 3-6-4-7 6-6 7 4 6-3z" fill="#a9b2c8" stroke="${K}" stroke-width="3.5" stroke-linejoin="round"/>
        <circle cx="32" cy="32" r="9" fill="#5d6680" stroke="${K}" stroke-width="3.5"/></svg>`,
    cart: `<svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M4 10h9l7 30h30l6-22H17" fill="none" stroke="${K}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M17 18h39l-6 22H20z" fill="#ffc72a" stroke="${K}" stroke-width="3.5" stroke-linejoin="round"/>
        <path d="M4 10h9l7 30h30" fill="none" stroke="#e3940c" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="24" cy="52" r="5" fill="#ffffff" stroke="${K}" stroke-width="3.5"/><circle cx="46" cy="52" r="5" fill="#ffffff" stroke="${K}" stroke-width="3.5"/></svg>`,
    planet: `<svg viewBox="0 0 64 64" aria-hidden="true">
        <g transform="rotate(-18 32 34)"><ellipse cx="32" cy="34" rx="29" ry="9" fill="none" stroke="${K}" stroke-width="8"/><ellipse cx="32" cy="34" rx="29" ry="9" fill="none" stroke="#ff6bd5" stroke-width="4"/></g>
        <circle cx="32" cy="32" r="18" fill="#8a3cff" stroke="${K}" stroke-width="3.5"/>
        <path d="M22 24a12 12 0 0 1 10-6" stroke="#d8b8ff" stroke-width="4" stroke-linecap="round" fill="none"/>
        <g transform="rotate(-18 32 34)"><path d="M3 34a29 9 0 0 0 58 0" fill="none" stroke="${K}" stroke-width="8"/><path d="M3 34a29 9 0 0 0 58 0" fill="none" stroke="#ff6bd5" stroke-width="4"/></g></svg>`,
    star: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 4l8 18 20 2-15 13 5 20-18-11-18 11 5-20L4 24l20-2z" fill="#ffd028" stroke="${K}" stroke-width="3.5" stroke-linejoin="round"/></svg>`,
    up: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6l22 26H42v26H22V32H10z" fill="#ffffff" stroke="${K}" stroke-width="4" stroke-linejoin="round"/></svg>`,
    friends: `<svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="22" cy="22" r="10" fill="#f5d29a" stroke="${K}" stroke-width="3.5"/><circle cx="44" cy="24" r="9" fill="#f5d29a" stroke="${K}" stroke-width="3.5"/>
        <path d="M4 56c0-12 8-20 18-20s18 8 18 20z" fill="#28c8ff" stroke="${K}" stroke-width="3.5"/>
        <path d="M34 56c0-10 4-17 10-17s16 7 16 17z" fill="#46ec50" stroke="${K}" stroke-width="3.5"/></svg>`,
    // Sneaker with a pink stripe: the "+1 Jump" step icon
    shoe: `<svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M6 40c0-8 4-18 10-22l10 6c4 3 10 4 16 4 8 0 16 4 16 10v6H6z" fill="#ffffff" stroke="${K}" stroke-width="3.5" stroke-linejoin="round"/>
        <path d="M18 22l9 6c3 2 8 3 13 3" fill="none" stroke="#ff3fa0" stroke-width="5" stroke-linecap="round"/>
        <rect x="5" y="44" width="54" height="9" rx="4" fill="#ff4a6a" stroke="${K}" stroke-width="3.5"/></svg>`,
    paw: `<svg viewBox="0 0 64 64" aria-hidden="true">
        <ellipse cx="32" cy="42" rx="15" ry="13" fill="#ffffff" stroke="${K}" stroke-width="3.5"/>
        <circle cx="14" cy="26" r="6.5" fill="#ffffff" stroke="${K}" stroke-width="3.5"/><circle cx="25" cy="15" r="6.5" fill="#ffffff" stroke="${K}" stroke-width="3.5"/>
        <circle cx="39" cy="15" r="6.5" fill="#ffffff" stroke="${K}" stroke-width="3.5"/><circle cx="50" cy="26" r="6.5" fill="#ffffff" stroke="${K}" stroke-width="3.5"/>
        <ellipse cx="32" cy="44" rx="8" ry="6" fill="#ff8fb0"/></svg>`,
    aura: `<svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M32 4c6 10 18 14 18 30a18 18 0 0 1-36 0C14 18 26 14 32 4z" fill="#c46bff" stroke="${K}" stroke-width="3.5" stroke-linejoin="round"/>
        <path d="M32 22c4 6 10 9 10 18a10 10 0 0 1-20 0c0-9 6-12 10-18z" fill="#ff8fd0" stroke="${K}" stroke-width="3"/>
        <circle cx="27" cy="38" r="3" fill="#ffffff"/></svg>`,
    portal: `<svg viewBox="0 0 64 64" aria-hidden="true">
        <ellipse cx="32" cy="32" rx="22" ry="27" fill="#8a3cff" stroke="${K}" stroke-width="3.5"/>
        <ellipse cx="32" cy="32" rx="14" ry="19" fill="#c46bff" stroke="${K}" stroke-width="3"/>
        <path d="M32 18c-6 4-6 12 0 14s6 10 0 14" fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round"/></svg>`,
    bag: `<svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M22 16a10 10 0 0 1 20 0" fill="none" stroke="${K}" stroke-width="7"/><path d="M22 16a10 10 0 0 1 20 0" fill="none" stroke="#8a5a32" stroke-width="3"/>
        <path d="M10 22h44l-3 34H13z" fill="#c8823a" stroke="${K}" stroke-width="3.5" stroke-linejoin="round"/>
        <rect x="20" y="32" width="24" height="12" rx="3" fill="#e8a050" stroke="${K}" stroke-width="3"/></svg>`,
};
export function fillIcons(root) {
    (root || document).querySelectorAll('[data-icon]').forEach((el) => {
        const svg = ICONS[el.dataset.icon];
        if (svg && !el.firstElementChild) el.innerHTML = svg;
    });
}
