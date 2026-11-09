const NUTRIENTS = [
  { key: 'calories', targetKey: 'target_kcal', sourceKey: 'calories_kcal_per_100g' },
  { key: 'protein', targetKey: 'target_protein_g', sourceKey: 'protein_g_per_100g' },
  { key: 'fat', targetKey: 'target_fat_g', sourceKey: 'fat_g_per_100g' },
  { key: 'carbs', targetKey: 'target_carbs_g', sourceKey: 'carbs_g_per_100g' },
];

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

/** Суммирует пищевую ценность порций по сохранённому снимку продукта. */
export function calculateNutritionTotals(items = []) {
  return items.reduce((totals, item) => {
    const portion = numeric(item.quantity_g) / 100;
    totals.calories += numeric(item.calories_kcal_per_100g) * portion;
    totals.protein += numeric(item.protein_g_per_100g) * portion;
    totals.fat += numeric(item.fat_g_per_100g) * portion;
    totals.carbs += numeric(item.carbs_g_per_100g) * portion;
    return totals;
  }, { calories: 0, protein: 0, fat: 0, carbs: 0 });
}

/** Готовит факт, цель и безопасную для полосы ширину прогресса. */
export function calculateMacroProgress(totals, menuDay) {
  return NUTRIENTS.map((nutrient) => {
    const targetValue = menuDay?.[nutrient.targetKey];
    const target = targetValue == null ? null : numeric(targetValue);
    const actual = numeric(totals?.[nutrient.key]);
    const percent = target > 0 ? Math.round((actual / target) * 100) : null;
    return {
      key: nutrient.key,
      actual,
      target,
      percent,
      barPercent: percent == null ? 0 : Math.min(percent, 100),
      over: percent != null && percent > 100,
    };
  });
}

const ACTIVITY_FACTORS = {
  low: 1.2, низкий: 1.2,
  moderate: 1.375, medium: 1.375, средний: 1.375,
  high: 1.55, высокий: 1.55,
  'very high': 1.725, veryhigh: 1.725, 'очень высокий': 1.725,
};

const GOAL_FACTORS = {
  gain: { calories: 1.1, protein: 2, fat: 0.9 },
  maintain: { calories: 1, protein: 1.8, fat: 0.9 },
  lose: { calories: 0.85, protein: 2.1, fat: 0.8 },
  'снижение веса': { calories: 0.85, protein: 2.1, fat: 0.8 },
  'weight loss': { calories: 0.85, protein: 2.1, fat: 0.8 },
  'набор мышечной массы': { calories: 1.1, protein: 2, fat: 0.9 },
  'muscle gain': { calories: 1.1, protein: 2, fat: 0.9 },
  'поддержание': { calories: 1, protein: 1.8, fat: 0.9 },
  maintenance: { calories: 1, protein: 1.8, fat: 0.9 },
};

function normalized(value) {
  return String(value ?? '').trim().toLocaleLowerCase('ru-RU').replace(/[_-]+/g, ' ');
}

export function calculateAge(birthDate, today = new Date()) {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

export function calculateBmi(weightKg, heightCm) {
  const weight = Number(weightKg);
  const height = Number(heightCm) / 100;
  if (!Number.isFinite(weight) || !Number.isFinite(height) || weight <= 0 || height <= 0) return null;
  return weight / (height * height);
}

/** Расчёт по Миффлину—Сан-Жеору; значения являются ориентировочной оценкой. */
export function calculateNutritionPlan(profile = {}) {
  const weight = Number(profile.weight_kg);
  const height = Number(profile.height_cm);
  const age = calculateAge(profile.birth_date);
  const sex = normalized(profile.gender ?? profile.sex);
  const sexOffset = ['male', 'man', 'm', 'мужской', 'мужчина'].includes(sex) ? 5
    : ['female', 'woman', 'f', 'женский', 'женщина'].includes(sex) ? -161 : null;
  const activityKey = normalized(profile.activity_level);
  const goalKey = normalized(profile.goal);
  const activityFactor = ACTIVITY_FACTORS[activityKey];
  const goal = GOAL_FACTORS[goalKey];
  const bmi = calculateBmi(weight, height);

  const validBody = Number.isFinite(weight) && weight > 0 && Number.isFinite(height) && height > 0;
  const bmr = validBody && age != null && sexOffset != null
    ? 10 * weight + 6.25 * height - 5 * age + sexOffset
    : null;
  const tdee = bmr != null && activityFactor ? bmr * activityFactor : null;
  const calories = tdee != null && goal ? tdee * goal.calories : null;
  const protein = Number.isFinite(weight) && weight > 0 && goal ? weight * goal.protein : null;
  const fat = Number.isFinite(weight) && weight > 0 && goal ? weight * goal.fat : null;
  const carbs = calories != null && protein != null && fat != null
    ? Math.max(0, (calories - protein * 4 - fat * 9) / 4)
    : null;

  return {
    age,
    bmi,
    bmiLabel: bmi == null ? null : bmi < 18.5 ? 'Ниже нормы' : bmi < 25 ? 'Норма' : bmi < 30 ? 'Выше нормы' : 'Высокий',
    bmr: bmr == null ? null : Math.round(bmr),
    tdee: tdee == null ? null : Math.round(tdee),
    calories: calories == null ? null : Math.round(calories),
    protein: protein == null ? null : Math.round(protein),
    fat: fat == null ? null : Math.round(fat),
    carbs: carbs == null ? null : Math.round(carbs),
  };
}

export function validateAthleteProfile(profile = {}) {
  const errors = {};
  const height = profile.height_cm === '' || profile.height_cm == null ? null : Number(profile.height_cm);
  const weight = profile.weight_kg === '' || profile.weight_kg == null ? null : Number(profile.weight_kg);
  if (height != null && (!Number.isFinite(height) || height < 100 || height > 250)) errors.height_cm = 'Рост должен быть от 100 до 250 см.';
  if (weight != null && (!Number.isFinite(weight) || weight < 30 || weight > 300)) errors.weight_kg = 'Вес должен быть от 30 до 300 кг.';
  if (profile.birth_date) {
    const birth = new Date(`${profile.birth_date}T00:00:00`);
    if (Number.isNaN(birth.getTime()) || birth > new Date()) errors.birth_date = 'Укажите корректную дату рождения.';
  }
  return errors;
}
