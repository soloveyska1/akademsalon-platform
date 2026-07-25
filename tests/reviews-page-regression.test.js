const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const reviews = fs.readFileSync(path.join(root, 'reviews.html'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const behavior = fs.readFileSync(path.join(root, 'assets/js/polish15-supporting.js'), 'utf8');

test('весь архив присутствует, но точный счётчик нигде не показывается', () => {
  const images = [...reviews.matchAll(/<img src="(assets\/img\/reviews\/review-[^"]+\.webp)"/g)]
    .map((match) => match[1]);
  assert.equal(images.length, 48);
  assert.equal(new Set(images).size, images.length);
  assert.doesNotMatch(reviews, /\b\d+\s*(?:отзыв|отзыва|отзывов)\b/i);
  assert.doesNotMatch(index, /\b\d+\s*(?:отзыв|отзыва|отзывов)\b/i);
});

test('книга благодарностей повторяет финальную сетку без старых фильтров', () => {
  assert.match(reviews, /class="[^"]*\brv-grid\b[^"]*"/);
  assert.equal((reviews.match(/class="rv-shot"/g) || []).length, 48);
  assert.doesNotMatch(reviews, /data-filter=|Следующие записи|rv-filter|rv-live/);
  assert.match(reviews, /assets\/css\/polish15-supporting\.css/);
  assert.match(reviews, /assets\/js\/polish15-supporting\.js/);
});

test('каждый скриншот имеет полный просмотр с клавиатурным управлением', () => {
  assert.equal((reviews.match(/class="rv-shot"/g) || []).length, 48);
  assert.match(reviews, /role="dialog"/);
  assert.match(reviews, /aria-modal="true"/);
  assert.match(behavior, /event\.key === 'Escape'/);
  assert.match(behavior, /event\.key === 'ArrowLeft'/);
  assert.match(behavior, /event\.key === 'ArrowRight'/);
  assert.match(behavior, /event\.key === 'Tab'/);
  assert.match(behavior, /el\.inert = true/);
  assert.match(behavior, /el\.inert = false/);
});

test('страница не имитирует общий рейтинг в schema', () => {
  assert.doesNotMatch(reviews, /AggregateRating|reviewCount|ratingValue/);
  assert.doesNotMatch(reviews, /"@type"\s*:\s*"Review"/);
  assert.match(reviews, /"@type":"CollectionPage"/);
});

test('интерактивный слой и короткий bootstrap темы синтаксически валидны', () => {
  const scripts = [...reviews.matchAll(/<script(?![^>]*type="application\/ld\+json")[^>]*>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1])
    .filter((source) => source.trim());
  assert.ok(scripts.length >= 1);
  scripts.forEach((source) => new vm.Script(source));
  new vm.Script(behavior);
});

test('метаданные компактны, а CollectionPage JSON-LD валиден', () => {
  const title = reviews.match(/<title>([^<]+)<\/title>/)[1];
  const description = reviews.match(/<meta name="description" content="([^"]+)"/)[1];
  assert.ok(title.length <= 80, `title too long: ${title.length}`);
  assert.ok(description.length <= 160, `description too long: ${description.length}`);
  assert.match(reviews, /<meta name="theme-color" content="#F6F1E7"/);
  const jsonLd = reviews.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
  assert.equal(JSON.parse(jsonLd)['@type'], 'CollectionPage');
});
