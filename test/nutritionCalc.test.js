const test = require("node:test");
const assert = require("node:assert/strict");
const { computeCalorieGoal, dietMacroRatios, activityMultipliers, mealSlotCalorieShare, inferMealSlot } = require("../nutritionCalc.js");

test("computeCalorieGoal returns null when any required field is missing", () => {
  assert.equal(computeCalorieGoal({}, 65), null);
  assert.equal(computeCalorieGoal({ birthdate: "1990-01-01", sex: "female", activityLevel: "sedentary" }, 65), null);
  assert.equal(computeCalorieGoal({ birthdate: "1990-01-01", sex: "female", activityLevel: "sedentary", heightCm: 165 }, null), null);
  assert.equal(computeCalorieGoal({ birthdate: "1990-01-01", heightCm: 165, activityLevel: "sedentary" }, 65), null);
});

test("computeCalorieGoal follows the Mifflin-St Jeor formula for a female profile", () => {
  const birthdate = "1994-06-15";
  const heightCm = 165;
  const weightKg = 65;
  const profile = { birthdate, sex: "female", activityLevel: "sedentary", heightCm };

  const result = computeCalorieGoal(profile, weightKg);
  assert.ok(result);

  const expectedAge = Math.floor((Date.now() - new Date(`${birthdate}T00:00:00`).getTime()) / (365.25 * 86_400_000));
  assert.equal(result.age, expectedAge);

  const expectedBmr = 10 * weightKg + 6.25 * heightCm - 5 * expectedAge - 161;
  const expectedGoal = Math.round(expectedBmr * activityMultipliers.sedentary);
  assert.equal(result.calorieGoal, expectedGoal);
  assert.equal(result.carbsG, Math.round((expectedGoal * dietMacroRatios.carbs) / 4));
  assert.equal(result.proteinG, Math.round((expectedGoal * dietMacroRatios.protein) / 4));
  assert.equal(result.fatG, Math.round((expectedGoal * dietMacroRatios.fat) / 9));
});

test("computeCalorieGoal applies the male vs female BMR offset (+5 vs -161)", () => {
  const birthdate = "1994-06-15";
  const heightCm = 178;
  const weightKg = 80;

  const female = computeCalorieGoal({ birthdate, sex: "female", activityLevel: "sedentary", heightCm }, weightKg);
  const male = computeCalorieGoal({ birthdate, sex: "male", activityLevel: "sedentary", heightCm }, weightKg);

  const diffBeforeMultiplier = (male.calorieGoal - female.calorieGoal) / activityMultipliers.sedentary;
  assert.ok(Math.abs(diffBeforeMultiplier - 166) < 1, `expected ~166 kcal offset, got ${diffBeforeMultiplier}`);
});

test("computeCalorieGoal scales with every activity level", () => {
  const profile = { birthdate: "1994-06-15", sex: "female", heightCm: 165 };
  const weightKg = 65;
  const levels = ["sedentary", "light", "moderate", "active", "very_active"];
  const goals = levels.map((activityLevel) => computeCalorieGoal({ ...profile, activityLevel }, weightKg).calorieGoal);

  for (let i = 1; i < goals.length; i += 1) {
    assert.ok(goals[i] > goals[i - 1], `goal for ${levels[i]} should exceed ${levels[i - 1]}`);
  }
});

test("mealSlotCalorieShare adds up to exactly 100% of the daily goal", () => {
  const total = Object.values(mealSlotCalorieShare).reduce((sum, share) => sum + share, 0);
  assert.equal(total, 1);
});

test("inferMealSlot buckets every hour of the day into exactly one meal", () => {
  const cases = [
    [7, "breakfast"],
    [10, "breakfast"],
    [11, "lunch"],
    [14, "lunch"],
    [15, "snack"],
    [17, "snack"],
    [18, "dinner"],
    [22, "dinner"],
    [23, "snack"],
    [2, "snack"],
  ];
  for (const [hour, expected] of cases) {
    const date = new Date(2024, 0, 1, hour, 0);
    assert.equal(inferMealSlot(date), expected, `hour ${hour} should map to ${expected}`);
  }
});
