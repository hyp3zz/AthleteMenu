# AthleteMenu

Веб-приложение для спортсменов и тренеров: профиль, меню питания, тренировки и отчёты. Интерфейс собран на HTML/CSS/JavaScript; авторизация и основные данные работают через Supabase. На главной есть дневник воды, а в профиле — персональный расчёт ориентиров, прогресс заполнения данных и история веса.

## Запуск локально

Дважды щёлкните `start.bat` в корне папки проекта. Скрипт запускает локальный сервер средствами Windows и открывает <http://localhost:3000>; Node.js и Python не требуются. Оставьте окно сервера открытым, пока пользуетесь сайтом. Чтобы остановить сервер, закройте это окно. Не запускайте страницы напрямую через `file://`: ES-модули браузера требуют HTTP-сервер.

## Подключение Supabase

1. Создайте Supabase-проект.
2. В его **SQL Editor** выполните `supabase/setup.sql`.
3. Для локального запуска укажите Project URL и публичный anon/publishable key из **Project Settings → API** в `assets/js/config.js` (можно начать с `config.example.js`). Файл исключён из Git. Для GitHub Pages добавьте эти значения в настройки репозитория как Actions secrets `SUPABASE_URL` и `SUPABASE_ANON_KEY`; workflow создаёт клиентский `config.js` только в публикуемом артефакте. Используйте только publishable/anon key, никогда не `service_role` или secret key.
4. В **Authentication → URL Configuration** разрешите адрес запуска, например `http://localhost:3000/**`. Для опубликованного сайта добавьте его домен и redirect URL.
5. Зарегистрируйте первый аккаунт администратора и назначьте ему роль в SQL Editor по инструкции в [`supabase/README.md`](supabase/README.md), затем один раз выполните `supabase/roles.sql`. После этого роли зарегистрированных пользователей (спортсмен, тренер, администратор) можно назначать в приложении через раздел «Пользователи». Обычная регистрация автоматически создаёт спортсмена.

В браузере допустим только публичный anon/publishable key: никогда не публикуйте `service_role` или secret key. Если параметры Supabase не указаны, вход и закрытые страницы работать не будут.

## Состав проекта

- `index.html`, `login.html`, `register.html` — главная страница и авторизация.
- `dashboard.html`, `profile.html`, `menu.html`, `training.html`, `reports.html` — кабинет спортсмена.
- `coach-athletes.html` — кабинет тренера; `admin.html` — справочники администратора; `admin-users.html` — управление ролями.
- `coach-requests.html` — отдельный раздел спортсмена для подтверждения или отклонения запросов тренеров.
- `assets/js/` — логика страниц и клиент Supabase; `assets/css/style.css` — стили.
- `server.ps1`, `start.bat` — локальный сервер Windows и запуск сайта двойным щелчком.
- `supabase/setup.sql` — единый SQL-скрипт создания схемы, политик доступа и начальных справочных данных; `supabase/roles.sql` добавляет безопасное управление ролями.

Запрос тренера не отправляется по электронной почте. Тренер вводит точный email аккаунта спортсмена с ролью «Спортсмен». Приложение создаёт в базе запрос со статусом `pending`; спортсмен видит его в боковом меню **«Запросы»**, где может принять или отклонить. Пока запрос не принят, тренер не получает доступ к данным. На странице тренера отображается число запросов, ожидающих ответа, а у спортсмена в меню появляется счётчик.

## Публикация и отправка

Проект состоит из статических файлов и может размещаться на любом хостинге статических сайтов. Для GitHub Pages:

1. Загрузите проект в GitHub-репозиторий в ветку `main`.
2. В **Settings → Secrets and variables → Actions** создайте secrets `SUPABASE_URL` и `SUPABASE_ANON_KEY` из **Project Settings → API** в Supabase.
3. В **Settings → Pages** выберите источником публикации **GitHub Actions**. Workflow `.github/workflows/pages.yml` публикует HTML, CSS, JavaScript и изображения при каждом push в `main`.
4. После первого запуска workflow откройте выданный GitHub Pages URL и добавьте его в Supabase **Authentication → URL Configuration** как Site URL и разрешённый Redirect URL. Для адреса вида `https://USER.github.io/REPOSITORY/` разрешите `https://USER.github.io/**`.

`config.js` остаётся исключённым из Git. Не загружайте в репозиторий `service_role` или secret key. `start.bat` можно оставить для локальной разработки; открывать приложение через него для GitHub Pages не требуется.

## Источники изображений

Фотографии используются по [Unsplash License](https://unsplash.com/license). Фотографии продуктов подбираются по названию и категории: локальные изображения используются для основных продуктов, остальные — с Unsplash CDN. В админке и рационе действует такой же подбор; для нового продукта без указанного фото показывается изображение его категории. Если CDN недоступен, интерфейс показывает встроенную заглушку. Для загрузки CDN-фотографий нужно подключение к интернету. Исходные страницы локальных изображений указаны ниже.

Категорийные фотографии каталога: [мясо](https://unsplash.com/photos/two-pieces-of-raw-meat-next-to-a-knife-and-garlic-b77VHP8osug), [рыба](https://unsplash.com/photos/fresh-raw-fish-fillets-displayed-on-ice-51YShzOZwPg), [крупы](https://unsplash.com/photos/a-close-up-view-of-uncooked-white-rice-grains-D8PSaH0o7kk), [овощи](https://unsplash.com/photos/fresh-vegetables-and-produce-displayed-at-a-market-nwpPqHpFge4), [фрукты](https://unsplash.com/photos/assorted-fruits-in-bowl-AgD6OBNXF0Q), [орехи и семена](https://unsplash.com/photos/brown-nuts-on-white-ceramic-bowls-4N0dLUmdLAY), [масла](https://unsplash.com/photos/clear-glass-cruet-bottle-uOBApnN_K7w), [бобовые](https://unsplash.com/photos/a-person-touching-a-bowl-of-lentils-on-a-table-Vznty-DJTIk), [хлеб](https://unsplash.com/photos/a-close-up-of-sliced-bread-on-a-cutting-board-LJ6cwT1_UVA), [напитки](https://unsplash.com/photos/orange-juice-in-clear-drinking-glass-kkrXVKK-jhg). Для молочных продуктов и яиц используются локальные изображения из `assets/images/`.

| Файл | Автор | Страница фотографии |
|---|---|---|
| `hero-dashboard.jpg` | Spencer Davis | [Unsplash](https://unsplash.com/photos/woman-holding-black-rope-0ShTs8iPY28) |
| `login-athlete.jpg` | Vitaly Gariev | [Unsplash](https://unsplash.com/photos/woman-exercising-with-battle-ropes-in-gym-0dUkfS8KOxg) |
| Аватар по умолчанию (Unsplash CDN) | Vitaly Gariev | [Unsplash](https://unsplash.com/photos/man-using-battle-ropes-during-workout-in-gym-aqclGN8xdPg) |
| `avatar-2.jpg` | 150 Billi | [Unsplash](https://unsplash.com/photos/a-man-with-a-smile-on-his-face-uB0afk31Z3E) |
| `avatar-3.jpg` | Simon Timchenko | [Unsplash](https://unsplash.com/es/fotos/una-mujer-sonriendo-para-la-camara-IppkPrK88QE) |
| `avatar-4.jpg` | Malama Mushitu | [Unsplash](https://unsplash.com/photos/a-woman-with-an-afro-is-smiling-for-the-camera-MfPPSuUXNMo) |
| `avatar-5.jpg` | Vitaly Gariev | [Unsplash](https://unsplash.com/photos/young-woman-with-blonde-hair-in-gym--zLdcQhi4Bc) |
| `food-oatmeal.jpg` | Eiliv Aceron | [Unsplash](https://unsplash.com/photos/a-bowl-of-oatmeal-with-berries-on-top-5gTixp6KwtI) |
| `food-curd.jpg` | Serghey Savchuk | [Unsplash](https://unsplash.com/photos/blueberries-and-cottage-cheese-in-a-stylish-arrangement-T7sYJaBjqSk) |
| `food-chicken-quinoa.jpg` | oh_ja_that_oke | [Unsplash](https://unsplash.com/photos/a-white-plate-topped-with-meat-and-veggies-Lg6dG4Tai4w) |
| `food-protein-shake.jpg` | FitNish Media | [Unsplash](https://unsplash.com/photos/a-bottle-of-keto-vegan-protein-shake-sitting-on-a-table-csOAWLFSnQY) |
| `food-salmon-veg.jpg` | alexanderafan | [Unsplash](https://unsplash.com/photos/delicious-salmon-with-colorful-vegetables-on-a-plate-iPT5kQ_OjDE) |
| `product-chicken.jpg` | Philippe Zuber | [Unsplash](https://unsplash.com/photos/two-raw-chicken-breasts-in-a-black-bowl-9ZrWR8R961U) |
| `product-buckwheat.jpg` | Joanna Stołowicz | [Unsplash](https://unsplash.com/photos/a-white-bowl-filled-with-food-on-top-of-a-wooden-board-bsFzFUmZwwg) |
| `product-oats.jpg` | Lady Bodnar | [Unsplash](https://unsplash.com/photos/a-person-holding-a-bowl-of-popcorn-O_1AfH4zD_A) |
| `product-banana.jpg` | Lotte Löhr | [Unsplash](https://unsplash.com/photos/closeup-photo-of-bunch-of-bananas-FY7wWMvqdQ0) |
| `product-egg.jpg` | Peter Werkman | [Unsplash](https://unsplash.com/photos/a-bunch-of-brown-eggs-in-a-carton-d6oEre5qMkQ) |

The existing SVG files were retained. They remain available for legacy references, and `product-placeholder.svg` is the last-resort product fallback.
