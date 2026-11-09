const localImage = (name) => `assets/images/${name}`;
const defaultAthleteAvatar = 'https://images.unsplash.com/photo-1758875569136-9936939e6179?auto=format&fit=crop&crop=faces&w=512&h=512&q=85';

export const PHOTOS = {
  dashboardHero: localImage('hero-dashboard.jpg'),
  landingHero: localImage('login-athlete.jpg'),
  avatar1: defaultAthleteAvatar,
  avatar2: localImage('avatar-2.jpg'),
  avatar3: localImage('avatar-3.jpg'),
  avatar4: localImage('avatar-4.jpg'),
  avatar5: localImage('avatar-5.jpg'),
};

const ASSET_PHOTOS = {
  'hero-dashboard.jpg': PHOTOS.dashboardHero,
  'login-athlete.jpg': PHOTOS.landingHero,
  'avatar-1.jpg': PHOTOS.avatar1,
  'avatar-2.jpg': PHOTOS.avatar2,
  'avatar-3.jpg': PHOTOS.avatar3,
  'avatar-4.jpg': PHOTOS.avatar4,
  'avatar-5.jpg': PHOTOS.avatar5,
  'food-oatmeal.jpg': localImage('food-oatmeal.jpg'),
  'food-curd.jpg': localImage('food-curd.jpg'),
  'food-chicken-quinoa.jpg': localImage('food-chicken-quinoa.jpg'),
  'food-protein-shake.jpg': localImage('food-protein-shake.jpg'),
  'food-salmon-veg.jpg': localImage('food-salmon-veg.jpg'),
  'product-chicken.jpg': localImage('product-chicken.jpg'),
  'product-buckwheat.jpg': localImage('product-buckwheat.jpg'),
  'product-oats.jpg': localImage('product-oats.jpg'),
  'product-banana.jpg': localImage('product-banana.jpg'),
  'product-egg.jpg': localImage('product-egg.jpg'),
  'product-placeholder.svg': localImage('product-placeholder.svg'),
};

const unsplash = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&h=800&q=82`;

// Общие фотографии категорий дополняют локальные изображения. Они используются
// для всех продуктов каталога и для новых продуктов без собственной фотографии.
const CATEGORY_PHOTOS = {
  meat: unsplash('photo-1690983330548-e34b52aa8cb2'),
  fish: unsplash('photo-1772285253181-b1257afb3698'),
  dairy: ASSET_PHOTOS['food-curd.jpg'],
  grains: unsplash('photo-1770617474928-3c7554a51941'),
  vegetables: unsplash('photo-1771659753573-e8498a262168'),
  fruits: unsplash('photo-1506395308321-904a71783d60'),
  nuts: unsplash('photo-1626697556426-8a55a8af4999'),
  oils: unsplash('photo-1474979266404-7eaacbcd87c5'),
  legumes: unsplash('photo-1708436477916-f97964f3ccf1'),
  bread: unsplash('photo-1579385935211-45b8cfdda570'),
  drinks: unsplash('photo-1600271886742-f049cd451bba'),
  eggs: ASSET_PHOTOS['product-egg.jpg'],
};

const KEYWORD_PHOTOS = [
  [/курин|chicken|птиц/i, ASSET_PHOTOS['product-chicken.jpg']],
  [/индей|говя|свин|теля|beef|pork|turkey|veal|мяс/i, CATEGORY_PHOTOS.meat],
  [/лосос|salmon/i, ASSET_PHOTOS['food-salmon-veg.jpg']],
  [/рыб|треск|форел|скумбр|тунец|кревет|fish|cod|trout|tuna|shrimp/i, CATEGORY_PHOTOS.fish],
  [/греч|buckwheat/i, ASSET_PHOTOS['product-buckwheat.jpg']],
  [/овся|oat/i, ASSET_PHOTOS['product-oats.jpg']],
  [/рис|киноа|пшен|перлов|кускус|паст|rice|quinoa|millet|barley|couscous|pasta/i, CATEGORY_PHOTOS.grains],
  [/банан|banana/i, ASSET_PHOTOS['product-banana.jpg']],
  [/яйц|egg/i, CATEGORY_PHOTOS.eggs],
  [/творог|сыр|йогурт|молок|кефир|сметан|curd|cottage|cheese|yogurt|milk/i, CATEGORY_PHOTOS.dairy],
  [/овощ|брокк|шпинат|томат|помидор|огур|перец|морков|картоф|цветн|кабач|vegetable|broccoli|spinach|tomato|cucumber|carrot|potato/i, CATEGORY_PHOTOS.vegetables],
  [/яблок|апельс|ягод|клубник|черник|авокад|груш|фрукт|apple|orange|berry|strawberry|blueberry|avocado|pear|fruit/i, CATEGORY_PHOTOS.fruits],
  [/орех|миндал|грецк|семен|чиа|фисташ|nut|almond|walnut|seed|chia/i, CATEGORY_PHOTOS.nuts],
  [/масл|oil/i, CATEGORY_PHOTOS.oils],
  [/чечев|нут|фасол|горох|тофу|боб|lentil|chickpea|bean|pea|tofu/i, CATEGORY_PHOTOS.legumes],
  [/хлеб|лаваш|выпеч|bread|lavash/i, CATEGORY_PHOTOS.bread],
  [/сок|напит|вода|какао|juice|drink|water|cocoa/i, CATEGORY_PHOTOS.drinks],
  [/коктейл|протеин|shake|smoothie/i, ASSET_PHOTOS['food-protein-shake.jpg']],
];

/** Возвращает интернет-фото для демо-ассетов, сохраняет пользовательские локальные файлы. */
export function resolvePhoto(source, fallback = 'product-placeholder.svg') {
  const value = String(source || '').trim();
  if (/^https:\/\/images\.unsplash\.com\//i.test(value)) return value;
  if (/^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\/athletemenu-avatars\//i.test(value)) return value;
  if (/^https?:\/\//i.test(value)) return ASSET_PHOTOS[fallback] || ASSET_PHOTOS['product-placeholder.svg'];

  const file = value.split(/[\\/]/).at(-1);
  if (ASSET_PHOTOS[file]) return ASSET_PHOTOS[file];
  const stem = file?.replace(/\.(?:svg|jpe?g|png|webp)$/i, '');
  const mappedAsset = Object.keys(ASSET_PHOTOS).find((asset) => asset.replace(/\.(?:svg|jpe?g|png|webp)$/i, '') === stem);
  if (mappedAsset) return ASSET_PHOTOS[mappedAsset];
  if (file && /^[A-Za-z0-9._-]+$/.test(file)) return `assets/images/${encodeURIComponent(file)}`;
  return ASSET_PHOTOS[fallback] || ASSET_PHOTOS['product-placeholder.svg'];
}

export function productPhoto(name, source, groupName = '') {
  if (source) return resolvePhoto(source);
  const label = String(name || '');
  const match = KEYWORD_PHOTOS.find(([pattern]) => pattern.test(label));
  if (match) return match[1];
  const group = String(groupName || '').toLowerCase();
  if (/мяс|meat/.test(group)) return CATEGORY_PHOTOS.meat;
  if (/рыб|fish/.test(group)) return CATEGORY_PHOTOS.fish;
  if (/молоч|dairy/.test(group)) return CATEGORY_PHOTOS.dairy;
  if (/круп|grain|cereal/.test(group)) return CATEGORY_PHOTOS.grains;
  if (/овощ|vegetable/.test(group)) return CATEGORY_PHOTOS.vegetables;
  if (/фрукт|fruit/.test(group)) return CATEGORY_PHOTOS.fruits;
  if (/орех|семен|nut|seed/.test(group)) return CATEGORY_PHOTOS.nuts;
  if (/масл|oil/.test(group)) return CATEGORY_PHOTOS.oils;
  if (/боб|legume/.test(group)) return CATEGORY_PHOTOS.legumes;
  if (/хлеб|выпеч|bread/.test(group)) return CATEGORY_PHOTOS.bread;
  if (/напит|drink/.test(group)) return CATEGORY_PHOTOS.drinks;
  if (/яйц|egg/.test(group)) return CATEGORY_PHOTOS.eggs;
  return ASSET_PHOTOS['food-chicken-quinoa.jpg'];
}
