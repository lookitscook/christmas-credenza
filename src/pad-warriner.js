// Warriner, Kuperman & Brysbaert (2013), aggregate word ratings.
// DOI: https://doi.org/10.3758/s13428-012-0314-x
// Publisher supplement: BRM-emot-submit.csv inside
// https://media.springernature.com/original/springer-static/esm/art%3A10.3758%2Fs13428-012-0314-x/MediaObjects/13428_2012_314_MOESM1_ESM.zip
// Reviewed subset of emotion/mood terms; sexual terms are not included.
// Each row: [original word, CSV ID, V.Mean.Sum, A.Mean.Sum, D.Mean.Sum].
// These are affective ratings of words, not additional rows from the 1977 paper.
export const WARRINER_RATINGS = Object.freeze([
  ['love', 7246, 8.00, 5.36, 5.92],
  ['calm', 1702, 6.89, 1.67, 7.44],
  ['content', 2642, 6.70, 3.17, 5.92],
  ['confident', 2533, 7.56, 4.62, 7.04],
  ['optimistic', 8460, 7.45, 4.19, 7.00],
  ['patient', 8787, 6.71, 2.77, 4.83],
  ['ecstatic', 3937, 6.45, 6.95, 5.63],
  ['successful', 12025, 7.76, 5.08, 7.71],
  ['nostalgic', 8255, 6.68, 4.37, 5.05],
  ['playful', 9140, 7.63, 5.89, 6.81],
  ['compassionate', 2423, 7.95, 4.73, 6.86],
  ['brave', 1444, 7.38, 4.95, 6.84],
  ['attentive', 719, 6.43, 4.37, 6.62],
  ['mellow', 7595, 6.68, 2.81, 7.00],
  ['reflective', 10043, 5.57, 3.38, 6.84],
  ['indifferent', 6286, 4.28, 3.19, 4.85],
  ['sleepy', 11295, 4.36, 3.04, 4.56],
  ['drowsy', 3828, 4.25, 2.83, 3.47],
  ['stoic', 11859, 4.47, 3.29, 6.04],
  ['anticipation', 472, 5.26, 5.39, 5.53],
  ['indulgent', 6307, 4.86, 4.68, 5.85],
  ['bewildered', 1094, 4.32, 4.57, 4.42],
  ['regret', 10076, 3.41, 4.90, 5.63],
  ['hesitant', 5767, 3.48, 2.83, 5.28],
  ['anxiety', 484, 2.38, 4.78, 3.39],
  ['emotional', 4053, 5.11, 5.32, 4.50],
  ['relief', 10124, 6.63, 4.42, 5.64],
  ['resolute', 10261, 5.95, 2.86, 5.92],
  ['resilient', 10256, 5.71, 4.65, 5.52],
  ['empathy', 4055, 7.29, 3.62, 5.90],
  ['assertive', 658, 5.37, 5.55, 6.04],
  ['receptive', 9947, 6.32, 3.90, 5.46],
  ['humorous', 6001, 7.81, 5.33, 6.80],
  ['sensitive', 10922, 6.33, 3.68, 5.00],
  ['understanding', 13041, 7.14, 3.09, 7.31],
].map(Object.freeze));

// Map 1–9 to -1–+1, with valence as pleasure. Retain all source precision;
// rounding only removes floating-point noise from the decimal mean conversion.
export const PAD_WARRINER_LANDMARKS = Object.freeze(WARRINER_RATINGS.map(([word, , ...means]) =>
  Object.freeze([word[0].toUpperCase() + word.slice(1), ...means.map(mean => Number(((mean - 5) / 4).toFixed(4)))])));
