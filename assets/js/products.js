import { calculateNutritionTotals } from './nutrition.js';
import { getProducts } from './mock-data.js';

function number(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (value != null && Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function normalizeProduct(product = {}) {
  return {
    ...product,
    name: product.name || product.product_name || 'Продукт без названия',
    image: product.image || product.image_path || product.image_url || null,
    calories_kcal_per_100g: number(product.calories_kcal_per_100g, product.calories_per_100g, product.calories_kcal, product.calories),
    protein_g_per_100g: number(product.protein_g_per_100g, product.protein_per_100g, product.protein_g, product.protein),
    fat_g_per_100g: number(product.fat_g_per_100g, product.fat_per_100g, product.fat_g, product.fat),
    carbs_g_per_100g: number(product.carbs_g_per_100g, product.carbs_per_100g, product.carbs_g, product.carbs),
  };
}

export function calculatePortion(product, grams) {
  const quantity_g = Number(grams);
  const nutrients = calculateNutritionTotals([{
    quantity_g,
    calories_kcal_per_100g: product.calories_kcal_per_100g,
    protein_g_per_100g: product.protein_g_per_100g,
    fat_g_per_100g: product.fat_g_per_100g,
    carbs_g_per_100g: product.carbs_g_per_100g,
  }]);
  return nutrients;
}

export async function loadProducts() {
  return (await getProducts()).map(normalizeProduct);
}
