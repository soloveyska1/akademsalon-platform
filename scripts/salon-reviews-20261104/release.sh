#!/usr/bin/env bash
# Релиз «два новых отзыва (58, 59) и счётчик 56» одной командой. Запускать на сервере под root.
#
#   bash release.sh            — собрать релиз от живого current, проверить и переключить сайт
#   bash release.sh --dry-run  — только собрать и проверить, сайт не переключать
#
# Порядок как у прошлых релизов: новый каталог в releases/ копией живого current (cp -a),
# правки только в нём, проверки, атомарная смена симлинка current, smoke по живому домену.
# Файлы берутся с GitHub и сверяются по SHA-256: подменённый или изменённый файл — остановка.
set -euo pipefail

SITE=${SITE:-/var/www/academic_saloon}
RAW=${RAW:-https://raw.githubusercontent.com/soloveyska1/akademsalon-platform/claude/hopeful-archimedes-rpxypc/scripts/salon-reviews-20261104}
DOMAIN=${DOMAIN:-https://akademsalon.ru}
DRY=0; [[ "${1:-}" == "--dry-run" ]] && DRY=1

declare -A SHA=(
  [add_reviews.py]=ec1e03ea20517767ac86377ee5d816a2fd1be0633a0e8b9a486154bcdf893896
  [img/review-58.webp]=f5494f25293d35d534cee56bc23b00c7c5649c2535a139cda7273f74cc0161e5
  [img/review-59.webp]=74701c502b4be4bdc021919a96d7c4d7d86c2ea0cfa6b1df875e1570a7b948f6
  [img/thumbs/review-58.webp]=dbb746995ce911f6be632609bdb61df52b88d0e4bbcccc3fb2f11395479b9684
  [img/thumbs/review-59.webp]=b2c3a78c7206afca84b4038fa9b825378102e20f2920645cd2a6a484946e2f93
)

say() { printf '\n== %s\n' "$*"; }
die() { printf '\nОСТАНОВКА: %s\n' "$*" >&2; exit 1; }

CUR=$(readlink -f "$SITE/current") || die "нет $SITE/current"
[[ -f "$CUR/reviews.html" ]] || die "в $CUR нет reviews.html"
say "Живой релиз: $(basename "$CUR")"
if grep -q 'review-58.webp' "$CUR/reviews.html"; then
  echo "Отзывы 58 и 59 уже на сайте — делать нечего."; exit 0
fi

TMP=$(mktemp -d)
NEW=""
cleanup() {
  rm -rf "$TMP"
  if [[ -n "$NEW" && "${KEEP_NEW:-0}" != 1 ]]; then rm -rf "$NEW"; fi
}
trap cleanup EXIT

say "Скачиваю и сверяю файлы"
for f in "${!SHA[@]}"; do
  mkdir -p "$TMP/$(dirname "$f")"
  curl -fsSL --retry 3 "$RAW/$f" -o "$TMP/$f" || die "не скачался $f"
  got=$(sha256sum "$TMP/$f" | cut -d' ' -f1)
  [[ "$got" == "${SHA[$f]}" ]] || die "SHA-256 не совпал у $f"
  echo "ok  $f"
done

LAST=$(ls -1 "$SITE/releases" | sed -nE 's/^release([0-9]+)-.*/\1/p' | sort -n | tail -1)
NAME="release$((LAST + 1))-reviews-56-$(date +%Y%m%d)"
NEW="$SITE/releases/$NAME"
[[ ! -e "$NEW" ]] || die "$NEW уже существует"

say "Собираю $NAME от $(basename "$CUR")"
cp -a "$CUR" "$NEW"
for d in assets/img/reviews assets/img/reviews/thumbs; do
  [[ -d "$NEW/$d" ]] || die "в релизе нет $d"
done
install -m 0644 -o "$(stat -c %U "$NEW/assets/img/reviews")" -g "$(stat -c %G "$NEW/assets/img/reviews")" \
  "$TMP/img/review-58.webp" "$TMP/img/review-59.webp" "$NEW/assets/img/reviews/"
install -m 0644 -o "$(stat -c %U "$NEW/assets/img/reviews/thumbs")" -g "$(stat -c %G "$NEW/assets/img/reviews/thumbs")" \
  "$TMP/img/thumbs/review-58.webp" "$TMP/img/thumbs/review-59.webp" "$NEW/assets/img/reviews/thumbs/"
PYTHONDONTWRITEBYTECODE=1 python3 "$TMP/add_reviews.py" "$NEW" "$TMP/img"

say "Проверяю релиз"
cards_old=$(grep -o 'class="rv-card"' "$CUR/reviews.html" | wc -l)
cards_new=$(grep -o 'class="rv-card"' "$NEW/reviews.html" | wc -l)
echo "карточек: было $cards_old, стало $cards_new"
[[ "$cards_old" == 54 && "$cards_new" == 56 ]] || die "ожидалось 54 → 56 карточек"
first=$(grep -o 'assets/img/reviews/review-[0-9]*\.webp' "$NEW/reviews.html" | head -2 | tr '\n' ' ')
[[ "$first" == "assets/img/reviews/review-59.webp assets/img/reviews/review-58.webp " ]] || die "новые отзывы не первыми: $first"
grep -q '56 сообщений из переписки с клиентами' "$NEW/index.html" || die "на главной нет «56 сообщений»"
grep -q '<a href="reviews.html">56 отзывов</a>' "$NEW/index.html" || die "на главной нет ссылки «56 отзывов»"
changed=$(diff -rq "$CUR" "$NEW" | sed "s#$SITE/releases/##g" || true)
echo "$changed"
nchanged=$(printf '%s\n' "$changed" | grep -c . || true)
[[ "$nchanged" -le 7 ]] || die "изменилось больше файлов, чем ожидалось ($nchanged)"

ROLLBACK="ln -sfn $CUR $SITE/.cur && mv -T $SITE/.cur $SITE/current"
if [[ "$DRY" == 1 ]]; then
  KEEP_NEW=1
  say "Пробный прогон: релиз собран в $NEW, сайт НЕ переключён"
  echo "Переключить: ln -sfn $NEW $SITE/.cur && mv -T $SITE/.cur $SITE/current"
  exit 0
fi

say "Переключаю сайт"
[[ "$(readlink -f "$SITE/current")" == "$CUR" ]] || die "current сменился во время сборки"
ln -sfn "$NEW" "$SITE/.cur" && mv -T "$SITE/.cur" "$SITE/current"
KEEP_NEW=1
echo "current → $NAME"

say "Smoke по живому домену"
ok=1
n=$(curl -fsS "$DOMAIN/reviews.html?v=$RANDOM" | grep -o 'class="rv-card"' | wc -l) || n=0
echo "reviews.html: $n карточек"; [[ "$n" == 56 ]] || ok=0
home=$(curl -fsS "$DOMAIN/?v=$RANDOM") || home=""
grep -q '56 отзывов' <<<"$home" && echo "главная: «56 отзывов»" || { echo "главная: нет «56 отзывов»"; ok=0; }
for p in assets/img/reviews/review-59.webp assets/img/reviews/thumbs/review-58.webp; do
  t=$(curl -fsS -o /dev/null -w '%{http_code} %{content_type}' "$DOMAIN/$p") || t="ошибка"
  echo "$p: $t"; [[ "$t" == "200 image/webp" ]] || ok=0
done
if [[ "$ok" != 1 ]]; then
  echo; echo "Smoke не прошёл — откатываю на $(basename "$CUR")"
  eval "$ROLLBACK"
  die "релиз откачен, сайт на прежней версии"
fi

say "Готово: $NAME на проде"
echo "Откат: $ROLLBACK"
