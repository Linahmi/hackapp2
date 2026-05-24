type LocationEntry = {
  aliases?: string[]
  country?: string
  kind: "city" | "country" | "region" | "destination"
  name: string
  region?: string
}

export type ValidatedLocation = {
  confidence: number
  country?: string
  kind: LocationEntry["kind"]
  name: string
  region?: string
  validatedBy: "gazetteer"
}

const locationEntries: LocationEntry[] = [
  { name: "Toronto", country: "Canada", kind: "city", region: "Ontario" },
  { name: "Lausanne", country: "Switzerland", kind: "city", region: "Vaud" },
  { name: "Zurich", country: "Switzerland", kind: "city", aliases: ["Zuerich", "Zürich"], region: "Zurich" },
  { name: "Geneva", country: "Switzerland", kind: "city", region: "Geneva" },
  { name: "Basel", country: "Switzerland", kind: "city", region: "Basel-Stadt" },
  { name: "Bern", country: "Switzerland", kind: "city", region: "Bern" },
  { name: "London", country: "United Kingdom", kind: "city", region: "England" },
  { name: "Paris", country: "France", kind: "city", region: "Île-de-France" },
  { name: "Berlin", country: "Germany", kind: "city", region: "Berlin" },
  { name: "Munich", country: "Germany", kind: "city", region: "Bavaria" },
  { name: "Madrid", country: "Spain", kind: "city" },
  { name: "Milan", country: "Italy", kind: "city" },
  { name: "Rome", country: "Italy", kind: "city" },
  { name: "Amsterdam", country: "Netherlands", kind: "city" },
  { name: "Brussels", country: "Belgium", kind: "city" },
  { name: "Vienna", country: "Austria", kind: "city" },
  { name: "New York", country: "United States", kind: "city", aliases: ["NYC", "New York City"] },
  { name: "Boston", country: "United States", kind: "city" },
  { name: "Chicago", country: "United States", kind: "city" },
  { name: "Seattle", country: "United States", kind: "city" },
  { name: "Austin", country: "United States", kind: "city" },
  { name: "San Francisco", country: "United States", kind: "city", aliases: ["SF"] },
  { name: "Singapore", country: "Singapore", kind: "city" },
  { name: "Tokyo", country: "Japan", kind: "city" },
  { name: "Seoul", country: "South Korea", kind: "city" },
  { name: "Sydney", country: "Australia", kind: "city" },
  { name: "Melbourne", country: "Australia", kind: "city" },
  { name: "Dubai", country: "United Arab Emirates", kind: "city" },
  { name: "Switzerland", kind: "country", aliases: ["Swiss"] },
  { name: "Canada", kind: "country" },
  { name: "United States", kind: "country", aliases: ["USA", "U.S.", "America"] },
  { name: "United Kingdom", kind: "country", aliases: ["UK", "U.K.", "Britain", "Great Britain"] },
  { name: "France", kind: "country" },
  { name: "Germany", kind: "country" },
  { name: "Italy", kind: "country" },
  { name: "Spain", kind: "country" },
  { name: "Netherlands", kind: "country" },
  { name: "Belgium", kind: "country" },
  { name: "Austria", kind: "country" },
  { name: "European Union", kind: "region", aliases: ["EU"] },
  { name: "North America", kind: "region" },
  { name: "EMEA", kind: "region" },
  { name: "APAC", kind: "region" },
]

function normalizeLocationText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  const current = Array.from({ length: b.length + 1 }, () => 0)

  for (let i = 1; i <= a.length; i++) {
    current[0] = i

    for (let j = 1; j <= b.length; j++) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + substitutionCost
      )
    }

    for (let j = 0; j <= b.length; j++) {
      previous[j] = current[j]
    }
  }

  return previous[b.length]
}

function aliasesFor(entry: LocationEntry) {
  return [entry.name, ...(entry.aliases ?? [])]
}

function findBestSingleLocation(normalizedCandidate: string) {
  let best: ValidatedLocation | null = null

  for (const entry of locationEntries) {
    for (const alias of aliasesFor(entry)) {
      const normalizedAlias = normalizeLocationText(alias)
      if (!normalizedAlias) continue

      const distance = levenshtein(normalizedCandidate, normalizedAlias)
      const maxLength = Math.max(normalizedCandidate.length, normalizedAlias.length)
      const similarity = 1 - distance / maxLength
      const exactBoost = normalizedCandidate === normalizedAlias ? 0.08 : 0
      const confidence = Math.min(1, similarity + exactBoost)

      if (confidence >= 0.86 && (!best || confidence > best.confidence)) {
        best = {
          confidence,
          country: entry.country,
          kind: entry.kind,
          name: entry.name,
          region: entry.region,
          validatedBy: "gazetteer",
        }
      }
    }
  }

  return best
}

function containsLocationAlias(normalizedCandidate: string, alias: string) {
  const normalizedAlias = normalizeLocationText(alias)
  if (!normalizedAlias) return false

  return (
    normalizedCandidate === normalizedAlias ||
    normalizedCandidate.startsWith(`${normalizedAlias} `) ||
    normalizedCandidate.endsWith(` ${normalizedAlias}`) ||
    normalizedCandidate.includes(` ${normalizedAlias} `)
  )
}

function exactLocationsInPhrase(normalizedCandidate: string) {
  const matches: ValidatedLocation[] = []

  for (const entry of locationEntries) {
    if (!aliasesFor(entry).some((alias) => containsLocationAlias(normalizedCandidate, alias))) {
      continue
    }

    matches.push({
      confidence: 0.98,
      country: entry.country,
      kind: entry.kind,
      name: entry.name,
      region: entry.region,
      validatedBy: "gazetteer",
    })
  }

  return matches
}

function splitLocationCandidate(candidate: string) {
  return candidate
    .split(/\s+(?:and|or)\s+|[,;/&]+/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 1)
}

function combineLocations(locations: ValidatedLocation[]) {
  const uniqueLocations = locations.filter(
    (location, index) => locations.findIndex((item) => item.name === location.name) === index
  )

  if (uniqueLocations.length === 0) return null
  if (uniqueLocations.length === 1) return uniqueLocations[0]

  const countries = [
    ...new Set(
      uniqueLocations
        .map((location) => location.country ?? (location.kind === "country" ? location.name : null))
        .filter(Boolean) as string[]
    ),
  ]
  const regions = [...new Set(uniqueLocations.map((location) => location.region).filter(Boolean) as string[])]

  return {
    confidence: Math.min(...uniqueLocations.map((location) => location.confidence), 0.96),
    country: countries.length === 1 ? countries[0] : undefined,
    kind: "region" as const,
    name: uniqueLocations.map((location) => location.name).join(", "),
    region: regions.length ? regions.join(", ") : undefined,
    validatedBy: "gazetteer" as const,
  }
}

export function validateLocationCandidate(candidate: string | null | undefined) {
  const rawCandidate = candidate?.trim() ?? ""
  const normalizedCandidate = normalizeLocationText(rawCandidate)
  if (!normalizedCandidate || normalizedCandidate.length < 2) return null

  const directMatch = findBestSingleLocation(normalizedCandidate)
  if (directMatch) return directMatch

  const splitMatches = splitLocationCandidate(rawCandidate)
    .map((part) => findBestSingleLocation(normalizeLocationText(part)))
    .filter(Boolean) as ValidatedLocation[]

  if (splitMatches.length > 0) return combineLocations(splitMatches)

  const phraseMatches = exactLocationsInPhrase(normalizedCandidate)
  if (phraseMatches.length > 0) return combineLocations(phraseMatches)

  return null
}
