'use strict';

function deriveRating(ing) {
  if (ing.ratingOverride) return ing.ratingOverride;
  const map = { 1: 'hero', 2: 'solid', 3: 'caution' };
  return map[ing.evidenceTier] ?? 'mid';
}

function enrichIngredient(ing, { concerns, conflicts, products, functionTags }) {
  const rating = deriveRating(ing);

  const relatedConcerns = Object.entries(concerns || {})
    .filter(([, v]) => Array.isArray(v.targetIngredients) && v.targetIngredients.includes(ing.id))
    .map(([key, v]) => ({ key, name: v.name || key, rationale: v.rationale || '' }));

  const relatedConflicts = (conflicts || []).filter(c => c.a === ing.id || c.b === ing.id);

  const relatedProducts = (products || []).filter(p => p.primaryIngredientId === ing.id);

  const functionMeta = (ing.functions || []).map(slug => ({
    slug,
    ...(functionTags && functionTags[slug]
      ? functionTags[slug]
      : { label: slug, definition: '', accent: '#888888' })
  }));

  return { ...ing, rating, relatedConcerns, relatedConflicts, relatedProducts, functionMeta };
}

function getBySlug(slug, ingredients) {
  return (ingredients || []).find(i => i.id === slug) || null;
}

module.exports = { deriveRating, enrichIngredient, getBySlug };
