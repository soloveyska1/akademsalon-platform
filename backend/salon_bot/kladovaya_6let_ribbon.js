/* «Кладовой 6 лет» на akademsalon.ru: праздничная лента над шапкой (11–17.10.2026).
   Подключается nginx-вставкой перед </body> (install_kladovaya_6let_ribbon.sh), файлы сайта не меняются.
   Лента статичная: шапка Салона липкая, лента уезжает при прокрутке и ничего не перекрывает.
   Закрыл крестиком — не показываем до конца праздника (localStorage, ошибки молча). */
(() => {
  "use strict";
  const MSK = (y, mo, d, h, mi) => Date.UTC(y, mo - 1, d, h - 3, mi);
  const now = Date.now();
  const FROM = MSK(2026, 10, 11, 12, 0);
  const ORDERS_TO = MSK(2026, 10, 16, 0, 0);
  const DRAW_TO = MSK(2026, 10, 16, 20, 0);
  const TO = MSK(2026, 10, 18, 0, 0);
  const preview = /[?&]festive=6let\b/.test(location.search);
  if (!preview && (now < FROM || now >= TO)) return;
  const KEY = "kladovaya-6let-ribbon-closed";
  try { if (!preview && localStorage.getItem(KEY) === "1") return; } catch (_) { /* приватный режим */ }
  const utm = "utm_source=akademsalon&utm_medium=ribbon&utm_campaign=6let_2026";
  const text = now < ORDERS_TO
    ? ["Кладовой 6 лет 🎂", "Заказ от 5 000 ₽ до 15.10 — «Про» в подарок и шанс на ВКР за 10 %", "Как участвовать"]
    : now < DRAW_TO
      ? ["Кладовой 6 лет 🎂", "Розыгрыш ВКР за 10 % — 16.10 в 19:00, в прямом эфире", "Смотреть"]
      : ["Кладовой 6 лет 🎂", "Итоги розыгрыша и подарки — на странице праздника", "Итоги"];
  const style = document.createElement("style");
  style.textContent = `
.k6-ribbon{position:relative;z-index:71;display:flex;align-items:center;justify-content:center;gap:14px;min-height:44px;padding:8px 48px 8px 16px;
  background:linear-gradient(90deg,#30216e 0%,#4934ad 55%,#3b3bff 100%);color:#fff;font:600 14px/1.3 inherit;letter-spacing:.005em;overflow:hidden}
.k6-ribbon::before{content:"";position:absolute;inset:0;pointer-events:none;opacity:.55;background-image:
  radial-gradient(circle at 8% 30%,#d9ff3d 0 2px,transparent 3px),radial-gradient(circle at 22% 75%,#ff4d3d 0 2px,transparent 3px),
  radial-gradient(circle at 41% 20%,#fff 0 1.5px,transparent 2.5px),radial-gradient(circle at 63% 80%,#d9f5bb 0 2px,transparent 3px),
  radial-gradient(circle at 79% 25%,#d9ff3d 0 2px,transparent 3px),radial-gradient(circle at 93% 70%,#b9b8ff 0 2px,transparent 3px)}
.k6-ribbon b{flex:none;font-weight:800;color:#d9ff3d}
.k6-ribbon span{min-width:0}
.k6-ribbon a{flex:none;display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:999px;background:#d9ff3d;color:#0f0e0c;font-weight:800;text-decoration:none}
.k6-ribbon a:focus-visible,.k6-ribbon button:focus-visible{outline:2px solid #fff;outline-offset:2px}
.k6-ribbon button{position:absolute;right:10px;top:50%;transform:translateY(-50%);width:30px;height:30px;border:0;border-radius:50%;background:rgba(255,255,255,.14);color:#fff;font:700 16px/1 inherit;cursor:pointer}
@media (max-width:640px){.k6-ribbon{flex-wrap:wrap;justify-content:flex-start;gap:6px 10px;font-size:13px}.k6-ribbon span{flex-basis:100%}}
@media (prefers-reduced-motion:no-preference){.k6-ribbon a{transition:transform .2s}.k6-ribbon a:hover{transform:translateY(-1px)}}`;
  const bar = document.createElement("aside");
  bar.className = "k6-ribbon";
  bar.setAttribute("aria-label", "Кладовой 6 лет — праздник");
  const head = document.createElement("b");
  head.textContent = text[0];
  const body = document.createElement("span");
  body.textContent = text[1];
  const link = document.createElement("a");
  link.href = `https://studkladovaya.ru/6let?${utm}`;
  link.rel = "noopener";
  link.textContent = `${text[2]} →`;
  const close = document.createElement("button");
  close.type = "button";
  close.setAttribute("aria-label", "Скрыть");
  close.textContent = "×";
  close.addEventListener("click", () => {
    bar.remove();
    try { localStorage.setItem(KEY, "1"); } catch (_) { /* не запомним — не страшно */ }
  });
  bar.append(head, body, link, close);
  const mount = () => {
    document.head.appendChild(style);
    document.body.insertBefore(bar, document.body.firstChild);
  };
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount, { once: true });
})();
