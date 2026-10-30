/* Образцы разделов, которые мастерская написала для демонстрации (в самих PDF это подписано).
   Добавляются к архивным работам, чтобы открываться в той же читалке и по ссылкам «Поделиться». */
(function () {
  'use strict';
  var list = window.SalonPortfolio;
  if (!Array.isArray(list)) return;
  [
    { id: 'obrazec-vvedenie-vkr', kind: 'Образец раздела', title: 'Введение ВКР: актуальность, аппарат исследования, методики',
      product: 'custom', discipline: 'Психология', pages: 2, previewPage: 1,
      pdf: 'assets/samples/obrazec-vvedenie-vkr.pdf', cover: 'assets/img/samples-v4/obrazec-vvedenie-vkr.webp', jumps: [] },
    { id: 'obrazec-glava-analiz', kind: 'Образец раздела', title: 'Аналитический параграф: таблица, расчёт и вывод',
      product: 'chapter', discipline: 'Экономика', pages: 1, previewPage: 1,
      pdf: 'assets/samples/obrazec-glava-analiz.pdf', cover: 'assets/img/samples-v4/obrazec-glava-analiz.webp', jumps: [] },
    { id: 'obrazec-spisok-literatury', kind: 'Образец раздела', title: 'Список литературы по ГОСТ Р 7.0.100-2018',
      product: 'custom', discipline: 'Все направления', pages: 1, previewPage: 1,
      pdf: 'assets/samples/obrazec-spisok-literatury.pdf', cover: 'assets/img/samples-v4/obrazec-spisok-literatury.webp', jumps: [] }
  ].forEach(function (d) {
    if (!list.some(function (x) { return x.id === d.id; })) list.push(d);
  });
})();
