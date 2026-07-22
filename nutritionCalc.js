const dietMacroRatios = { carbs: 0.45, protein: 0.25, fat: 0.30 };

const activityMultipliers = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const mealSlotCalorieShare = { breakfast: 0.25, lunch: 0.35, snack: 0.15, dinner: 0.25 };

function inferMealSlot(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 15) return "lunch";
  if (hour >= 15 && hour < 18) return "snack";
  if (hour >= 18 && hour < 23) return "dinner";
  return "snack";
}

function computeCalorieGoal(profile, weightKg) {
  if (!profile?.birthdate || !profile?.sex || !profile?.activityLevel || !profile?.heightCm || !weightKg) {
    return null;
  }

  const birth = new Date(`${String(profile.birthdate).slice(0, 10)}T00:00:00`);
  const ageMs = Date.now() - birth.getTime();
  const age = Math.floor(ageMs / (365.25 * 86_400_000));
  const heightCm = Number(profile.heightCm);

  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + (profile.sex === "male" ? 5 : -161);
  const multiplier = activityMultipliers[profile.activityLevel] || activityMultipliers.sedentary;
  const calorieGoal = Math.round(bmr * multiplier);

  return {
    age,
    calorieGoal,
    carbsG: Math.round((calorieGoal * dietMacroRatios.carbs) / 4),
    proteinG: Math.round((calorieGoal * dietMacroRatios.protein) / 4),
    fatG: Math.round((calorieGoal * dietMacroRatios.fat) / 9),
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { dietMacroRatios, activityMultipliers, mealSlotCalorieShare, inferMealSlot, computeCalorieGoal };
}
