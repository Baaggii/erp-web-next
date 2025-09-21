const englishStopWords = new Set([
  "a",
  "about",
  "above",
  "across",
  "after",
  "again",
  "against",
  "all",
  "almost",
  "along",
  "already",
  "also",
  "although",
  "always",
  "among",
  "an",
  "and",
  "another",
  "any",
  "anyone",
  "anything",
  "are",
  "around",
  "as",
  "at",
  "away",
  "back",
  "because",
  "been",
  "before",
  "being",
  "below",
  "between",
  "both",
  "but",
  "by",
  "can",
  "cannot",
  "come",
  "could",
  "day",
  "did",
  "do",
  "does",
  "done",
  "down",
  "during",
  "each",
  "either",
  "else",
  "even",
  "ever",
  "every",
  "few",
  "first",
  "for",
  "from",
  "get",
  "give",
  "go",
  "good",
  "had",
  "has",
  "have",
  "having",
  "he",
  "her",
  "here",
  "hers",
  "herself",
  "him",
  "himself",
  "his",
  "how",
  "however",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "itself",
  "just",
  "keep",
  "know",
  "last",
  "less",
  "let",
  "like",
  "long",
  "look",
  "made",
  "make",
  "many",
  "may",
  "me",
  "might",
  "more",
  "most",
  "much",
  "must",
  "my",
  "myself",
  "near",
  "need",
  "never",
  "new",
  "no",
  "not",
  "now",
  "of",
  "off",
  "often",
  "on",
  "once",
  "one",
  "only",
  "onto",
  "or",
  "other",
  "our",
  "ours",
  "ourselves",
  "out",
  "over",
  "own",
  "people",
  "perhaps",
  "put",
  "really",
  "right",
  "said",
  "same",
  "see",
  "should",
  "since",
  "so",
  "some",
  "someone",
  "something",
  "still",
  "such",
  "sure",
  "take",
  "than",
  "that",
  "the",
  "their",
  "theirs",
  "them",
  "themselves",
  "then",
  "there",
  "therefore",
  "these",
  "they",
  "thing",
  "think",
  "this",
  "those",
  "though",
  "through",
  "thus",
  "to",
  "too",
  "under",
  "until",
  "up",
  "upon",
  "us",
  "use",
  "very",
  "was",
  "we",
  "well",
  "were",
  "what",
  "when",
  "where",
  "whether",
  "which",
  "while",
  "who",
  "whom",
  "whose",
  "why",
  "will",
  "with",
  "within",
  "without",
  "would",
  "yes",
  "yet",
  "you",
  "your",
  "yours",
  "yourself",
  "yourselves",
]);

const accentRegex = /[áéíóúüñçàèìòùâêîôûäëïöüãõåæœßÿčšžğışășț]/i;
const placeholderRegex = /{{\s*[^}]+\s*}}|%[-+]?\d*(?:\.\d+)?[sdif]|\{\d+\}|\$\{[^}]+\}|:[a-zA-Z_][\w-]*|<[^>]+>/g;
const asciiWordRegex = /^[a-z]+$/;
const nonAsciiRegex = /[^\u0000-\u007F]/;

export function normalizeText(text) {
  if (typeof text !== "string") return String(text ?? "").trim();
  return text.replace(/\s+/g, " ").trim();
}

function extractPlaceholders(text) {
  if (!text) return [];
  const matches = text.match(placeholderRegex) || [];
  return matches.map((m) => m.trim()).sort();
}

function tokenizeWords(text) {
  if (!text) return [];
  return (
    text
      .toLowerCase()
      .match(/[a-záéíóúüñçàèìòùâêîôûäëïöüãõåæœßÿčšžğışășț]+/g) || []
  );
}

function englishCoverage(words) {
  if (!words.length) return { asciiCount: 0, englishMatches: 0, ratio: 0 };
  let asciiCount = 0;
  let englishMatches = 0;
  for (const word of words) {
    if (asciiWordRegex.test(word)) {
      asciiCount += 1;
      if (englishStopWords.has(word)) englishMatches += 1;
    }
  }
  const ratio = asciiCount === 0 ? 0 : englishMatches / asciiCount;
  return { asciiCount, englishMatches, ratio };
}

function collectMetadataTokens(metadata) {
  if (!metadata || typeof metadata !== "object") return [];
  const tokens = new Set();
  for (const raw of [metadata?.module, metadata?.context, metadata?.key]) {
    if (!raw || typeof raw !== "string") continue;
    const pieces = raw
      .toLowerCase()
      .split(/[^a-z0-9áéíóúüñçàèìòùâêîôûäëïöüãõåæœßÿčšžğışășț]+/i)
      .filter(Boolean);
    pieces.forEach((piece) => tokens.add(piece));
  }
  return Array.from(tokens);
}

export function evaluateTranslationCandidate({
  candidate,
  base,
  lang,
  metadata,
}) {
  const normalizedCandidate = normalizeText(candidate);
  const normalizedBase = normalizeText(base);
  const result = {
    normalizedCandidate,
    normalizedBase,
    placeholders: { missing: [], extra: [] },
    english: { asciiCount: 0, englishMatches: 0, ratio: 0 },
    metadataTokens: collectMetadataTokens(metadata),
    status: "pass",
    reasons: [],
  };

  if (!normalizedCandidate) {
    result.status = "fail";
    result.reasons.push("empty");
    return result;
  }

  if (
    normalizedBase &&
    normalizedCandidate.toLowerCase() === normalizedBase.toLowerCase()
  ) {
    result.status = "fail";
    result.reasons.push("identical_to_base");
    return result;
  }

  const basePlaceholders = extractPlaceholders(normalizedBase);
  const candidatePlaceholders = extractPlaceholders(normalizedCandidate);
  if (basePlaceholders.length) {
    const missing = basePlaceholders.filter(
      (ph) => !candidatePlaceholders.includes(ph),
    );
    if (missing.length) {
      result.placeholders.missing = missing;
      result.status = "fail";
      result.reasons.push(`missing_placeholders:${missing.join(',')}`);
      return result;
    }
  }
  if (candidatePlaceholders.length) {
    const extras = candidatePlaceholders.filter(
      (ph) => !basePlaceholders.includes(ph),
    );
    if (extras.length) {
      result.placeholders.extra = extras;
      result.reasons.push(`extra_placeholders:${extras.join(',')}`);
      if (result.status !== "fail") result.status = "retry";
    }
  }

  const words = tokenizeWords(normalizedCandidate);
  result.english = englishCoverage(words);

  if (normalizedBase.split(" ").length > 3 && words.length <= 1) {
    result.status = "fail";
    result.reasons.push("too_short_for_context");
    return result;
  }

  if (lang && lang !== "en") {
    if (result.english.ratio >= 0.75 && result.english.asciiCount > 0) {
      result.status = "fail";
      result.reasons.push("appears_english");
      return result;
    }
    if (
      result.status !== "fail" &&
      result.english.ratio >= 0.4 &&
      result.english.asciiCount > 2
    ) {
      result.status = "retry";
      result.reasons.push("possibly_english");
    }
    const hasNonAscii = nonAsciiRegex.test(normalizedCandidate);
    if (
      result.status !== "fail" &&
      !hasNonAscii &&
      !accentRegex.test(normalizedCandidate) &&
      result.english.asciiCount === 0
    ) {
      result.status = "retry";
      result.reasons.push("no_language_signal");
    }
  }

  if (result.status !== "fail" && result.metadataTokens.length) {
    const lowerCandidate = normalizedCandidate.toLowerCase();
    const hits = result.metadataTokens.filter((token) =>
      lowerCandidate.includes(token),
    );
    if (!hits.length) {
      result.status = result.status === "pass" ? "retry" : result.status;
      result.reasons.push("metadata_not_reflected");
    }
  }

  return result;
}

export function buildValidationPrompt({ candidate, base, lang, metadata }) {
  const metaParts = [];
  if (metadata && typeof metadata === "object") {
    if (metadata.module) metaParts.push(`module: ${metadata.module}`);
    if (metadata.context) metaParts.push(`context: ${metadata.context}`);
    if (metadata.key) metaParts.push(`key: ${metadata.key}`);
  }
  const metaLine = metaParts.length ? metaParts.join(', ') : 'none provided';
  return [
    'You are a meticulous translation validator. Determine whether the proposed translation is a faithful rendering of the base text, uses the requested target language, respects placeholders, and fits the supplied module/context metadata.',
    'Respond ONLY with JSON using the shape {"valid":boolean,"reason":string,"languageConfidence":number}. If invalid, explain why in "reason" in English. If valid, set reason to an empty string.',
    `Base text: """${base ?? ''}"""`,
    `Proposed translation: """${candidate ?? ''}"""`,
    `Target language code: ${lang || 'unknown'}`,
    `Metadata: ${metaLine}`,
  ].join('\n');
}

export function summarizeHeuristic(result) {
  if (!result) return '';
  const parts = [];
  if (result.reasons.length) parts.push(result.reasons.join('; '));
  if (result.placeholders?.missing?.length) {
    parts.push(`missing placeholders: ${result.placeholders.missing.join(', ')}`);
  }
  if (result.english) {
    parts.push(
      `englishRatio=${result.english.ratio.toFixed(2)} (ascii=${result.english.asciiCount})`,
    );
  }
  return parts.join(' | ');
}

export default {
  evaluateTranslationCandidate,
  buildValidationPrompt,
  summarizeHeuristic,
};
