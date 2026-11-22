const STATE_NAME_KEYS: Record<string, string> = {
  'Baden-Württemberg': 'badenWuerttemberg',
  Bayern: 'bayern',
  Berlin: 'berlin',
  Brandenburg: 'brandenburg',
  Bremen: 'bremen',
  Hamburg: 'hamburg',
  Hessen: 'hessen',
  'Mecklenburg-Vorpommern': 'mecklenburgVorpommern',
  Niedersachsen: 'niedersachsen',
  'Nordrhein-Westfalen': 'nordrheinWestfalen',
  'Rheinland-Pfalz': 'rheinlandPfalz',
  Saarland: 'saarland',
  Sachsen: 'sachsen',
  'Sachsen-Anhalt': 'sachsenAnhalt',
  'Schleswig-Holstein': 'schleswigHolstein',
  Thüringen: 'thueringen',
}

export function getStateNameMessageKey(name: string) {
  return STATE_NAME_KEYS[name]
}
