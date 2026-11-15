# ТехноПодбор

Приложение для поиска и сравнения бытовой техники: каталог, фильтры, сравнение, 3D-осмотр, отзывы.

- Сайт: https://ansergienko120690-rgb.github.io/tehnopodbor/
- Версия на claude.ai: https://claude.ai/artifact/PZsQwXAs4cJ5b3KEKsjZsE

## Как устроено (v7)

```
src/
  index.html            шаблон страницы (метки <!-- @styles --> и <!-- @scripts -->)
  styles.css            стили
  js/icons.js           иконки
  js/data.js            чтение каталога и наложение цен (applyPrices)
  js/api.js             слой API: загрузка свежих data/*.json, таймаут, повтор, проверка версии
  js/app.js             интерфейс: каталог, фильтры, карточка, сравнение, отзывы
  js/illo.js            рисунки товаров
  js/r3d.js             3D-осмотр и размеры (three.js)
  js/importmap.json     откуда грузить three.js
  data/catalog.json     товары: категории, характеристики, модели (одна модель — одна строка)
  data/prices.json      цены магазинов (пишет посредник, руками не править)
  data/prices.csv       ручной прайс: id;price;shop;url
  data/price_map.json   сопоставление товаров фида с каталогом, если названия не совпадают
tools/
  build.mjs             сборка: проверяет данные и собирает dist/index.html одним файлом
  update_prices.mjs     посредник цен: CSV + YML-фиды → prices.json
tests/run.js            37 автотестов в браузере
.github/workflows/ci.yml  цены → сборка → тесты → выкладка
```

Команды (нужен Node 20+):

```
node tools/build.mjs            # собрать dist/index.html
node tools/update_prices.mjs    # обновить цены
npm i --no-save playwright three@0.160.0 && node tests/run.js dist/index.html
```

## Как добавить или поправить товар

Открыть `src/data/catalog.json`, найти категорию, добавить строку в `items`:
`["Бренд", "Модель", цена, рейтинг, …характеристики в порядке specs и commonSpecs]`.
Номер товара (`fridge-0`, `fridge-1` …) — это категория и позиция в списке. Сборка сама проверит,
что число полей верное, и остановится с понятной ошибкой.

## Живые цены

Страница не может сама ходить на сайты магазинов, поэтому цены собирает посредник —
GitHub Actions, раз в день по расписанию (сервер не нужен):

1. `tools/update_prices.mjs` читает `prices.csv` и YML-фиды магазинов из секрета `PRICE_FEEDS`;
2. сопоставляет предложения с каталогом по «бренд + модель», берёт минимальную цену;
3. если цены изменились — коммитит `src/data/prices.json`, пересобирает и выкладывает сайт.

На сайте GitHub Pages приложение при открытии подтягивает свежий `data/prices.json`.
В версии на claude.ai цены встроены на дату публикации.

Где взять фиды: открытого бесплатного API цен у российских магазинов нет. YML-фиды выдают
партнёрские сети (Admitad и аналоги) после регистрации и подключения к программам магазинов.
Ссылки на фиды — по одной в строке — в Settings → Secrets and variables → Actions → `PRICE_FEEDS`.
Без фидов можно вести цены вручную в `prices.csv`.
