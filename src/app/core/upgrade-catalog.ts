import {
  DASH_BASE_CHARGES,
  DASH_RECHARGE,
  DASH_SHIELD_PER_HIT,
  GRENADE_BASE_COOLDOWN,
  GRENADE_BASE_DAMAGE,
  GRENADE_BASE_RADIUS,
  GRENADE_MIN_COOLDOWN,
  HEALTH_REGEN_PER_LEVEL,
  MORTAR_BASE_COOLDOWN,
  MORTAR_BASE_DAMAGE,
  MORTAR_BASE_RADIUS,
  MORTAR_BASE_SLOW_SECONDS,
  MORTAR_MIN_COOLDOWN,
  NULL_CORE_BASE_COOLDOWN,
  NULL_CORE_BASE_DPS,
  NULL_CORE_BASE_RADIUS,
  NULL_CORE_BASE_SECONDS,
  NULL_CORE_MIN_COOLDOWN,
  NULL_CORE_SECONDS_PER_LEVEL,
  NULL_FIELD_BASE_DPS,
  NULL_FIELD_BASE_RADIUS,
  PLAYER_BASE_HEALTH,
  PRECISION_BASE_COOLDOWN,
  PRECISION_BASE_DAMAGE,
  PRECISION_BOSS_HEALTH_DAMAGE_FACTOR,
  PRECISION_HEALTH_DAMAGE_PER_LEVEL,
  PRECISION_MIN_COOLDOWN,
  PRECISION_MINI_HEALTH_DAMAGE_FACTOR,
  PRECISION_PROJECTILE_RADIUS,
  START_MONEY_PER_LEVEL,
  VEHICLE_SPEED_STEP,
  WEAPON_DAMAGE_PER_LEVEL,
  ammoCostReduction,
  armorReduction,
  dashReduction,
  healthRegenPerSecond,
  startingMoney,
  vehicleArmorReduction,
  type PerkKey,
  type UpgradeKey,
} from '../../../shared/game-types';

export type UpgradeCategory =
  | 'player'
  | 'ranged'
  | 'melee'
  | 'grenades'
  | 'mortar'
  | 'precision'
  | 'nullCore'
  | 'barricades'
  | 'turrets'
  | 'vehicles'
  | 'dash';

export interface UpgradeDefinition {
  key: UpgradeKey;
  category: UpgradeCategory;
  label: string;
  icon: string;
}

export interface UpgradeGroupDefinition {
  key: UpgradeCategory;
  label: string;
  description: string;
  icon: string;
}

export interface PerkDefinition {
  key: PerkKey;
  label: string;
  description: string;
  icon: string;
}

export const UPGRADE_GROUPS: UpgradeGroupDefinition[] = [
  {
    key: 'player',
    label: 'Spieler',
    description: 'Überleben, Bewegung und Startkapital',
    icon: '♥',
  },
  {
    key: 'ranged',
    label: 'Fernkampf',
    description: 'Schaden, Nachschub und Munitionspreis aller Schusswaffen',
    icon: '✦',
  },
  {
    key: 'melee',
    label: 'Nahkampf',
    description: 'Eigene Werte für Schaden, Angriffstempo und Reichweite von Nahkampfwaffen',
    icon: '⚔',
  },
  {
    key: 'grenades',
    label: 'Granaten',
    description: 'Stärkere Explosionen und Granaten, die in Mini-Granaten zerfallen',
    icon: '●',
  },
  {
    key: 'mortar',
    label: 'Mörserschlag',
    description: 'Gewaltiger Flächentreffer mit Vorwarnung und bremsender Druckwelle',
    icon: '⌖',
  },
  {
    key: 'precision',
    label: 'Vernichtungsschuss',
    description: 'Ein sichtbares Projektil für maximalen Schaden an genau einem Ziel',
    icon: '➤',
  },
  {
    key: 'nullCore',
    label: 'Nullpunktkern',
    description: 'Stationärer Schadenskern mit getrennt ausbaubarem Kern- und Feldradius',
    icon: '✦',
  },
  {
    key: 'barricades',
    label: 'Barrikaden',
    description: 'Mehr Widerstandskraft für alle gebauten Sperren',
    icon: '▰',
  },
  {
    key: 'turrets',
    label: 'Türme',
    description: 'Schaden und Reichweite automatischer Verteidigung',
    icon: '⌖',
  },
  {
    key: 'vehicles',
    label: 'Fahrzeuge',
    description: 'Hülle, Motor, Ramme und Bordwaffen',
    icon: '🚙',
  },
  {
    key: 'dash',
    label: 'Dash',
    description: 'Ladungen, Schutz und Dash-Fähigkeiten',
    icon: '»',
  },
];

export const UPGRADE_DEFINITIONS: UpgradeDefinition[] = [
  { key: 'healthRegen', category: 'player', label: 'Lebensregeneration', icon: '+' },
  { key: 'startMoney', category: 'player', label: 'Startkapital', icon: '$' },
  { key: 'maxHealth', category: 'player', label: 'Maximales Spielerleben', icon: '♥' },
  { key: 'armor', category: 'player', label: 'Panzerung', icon: '⛨' },
  { key: 'moveSpeed', category: 'player', label: 'Bewegung', icon: '➜' },
  {
    key: 'weaponDamage',
    category: 'ranged',
    label: 'Waffenschaden · Fernkampf',
    icon: '✦',
  },
  { key: 'reloadSpeed', category: 'ranged', label: 'Nachladen', icon: '↻' },
  {
    key: 'magazineSize',
    category: 'ranged',
    label: 'Magazingröße',
    icon: '▥',
  },
  {
    key: 'reserveAmmo',
    category: 'ranged',
    label: 'Munitionsreserve',
    icon: '⛁',
  },
  { key: 'ammoCost', category: 'ranged', label: 'Munitionspreis', icon: '$' },
  { key: 'meleeDamage', category: 'melee', label: 'Waffenschaden · Nahkampf', icon: '✦' },
  { key: 'meleeSpeed', category: 'melee', label: 'Angriffstempo', icon: '⚔' },
  { key: 'meleeRange', category: 'melee', label: 'Schlagreichweite', icon: '◒' },
  { key: 'grenadeDamage', category: 'grenades', label: 'Granatenschaden', icon: '●' },
  { key: 'grenadeCooldown', category: 'grenades', label: 'Granaten-Cooldown', icon: '◷' },
  { key: 'grenadeRadius', category: 'grenades', label: 'Explosionsradius', icon: '◎' },
  { key: 'grenadeSplit', category: 'grenades', label: 'Splittergranate', icon: '✹' },
  { key: 'mortarDamage', category: 'mortar', label: 'Einschlagsschaden', icon: '✹' },
  { key: 'mortarCooldown', category: 'mortar', label: 'Feuerbereitschaft', icon: '◷' },
  { key: 'mortarRadius', category: 'mortar', label: 'Zielgebiet', icon: '◎' },
  { key: 'mortarSlow', category: 'mortar', label: 'Druckwelle', icon: '≈' },
  { key: 'precisionDamage', category: 'precision', label: 'Hochkaliber', icon: '➤' },
  { key: 'precisionCooldown', category: 'precision', label: 'Ladezyklus', icon: '◷' },
  { key: 'precisionWidth', category: 'precision', label: 'Schussbreite', icon: '━' },
  { key: 'precisionExecute', category: 'precision', label: 'Vollstrecker', icon: '†' },
  {
    key: 'precisionHealthDamage',
    category: 'precision',
    label: 'Zielanalyse',
    icon: '%',
  },
  { key: 'nullCoreDamage', category: 'nullCore', label: 'Kernenergie', icon: '✦' },
  { key: 'nullCoreCooldown', category: 'nullCore', label: 'Neukalibrierung', icon: '◷' },
  { key: 'nullCoreDuration', category: 'nullCore', label: 'Stabilität', icon: '◌' },
  { key: 'nullCoreRadius', category: 'nullCore', label: 'Kernreichweite', icon: '◎' },
  { key: 'nullFieldRadius', category: 'nullCore', label: 'Feldreichweite', icon: '◉' },
  { key: 'barricadeHealth', category: 'barricades', label: 'Barrikadenleben', icon: '▰' },
  { key: 'turretDamage', category: 'turrets', label: 'Turmschaden', icon: '⌖' },
  { key: 'turretRange', category: 'turrets', label: 'Turmreichweite', icon: '◈' },
  { key: 'vehicleHealth', category: 'vehicles', label: 'Fahrzeugleben', icon: '🚙' },
  { key: 'vehicleArmor', category: 'vehicles', label: 'Fahrzeugpanzerung', icon: '⛨' },
  { key: 'vehicleSpeed', category: 'vehicles', label: 'Motorleistung', icon: '⚙' },
  { key: 'vehicleRam', category: 'vehicles', label: 'Rammschaden', icon: '✖' },
  { key: 'vehicleGun', category: 'vehicles', label: 'Bordwaffen', icon: '⌗' },
  { key: 'dashCharges', category: 'dash', label: 'Zusätzlicher Dash', icon: '»' },
  { key: 'dashRecharge', category: 'dash', label: 'Dash-Aufladung', icon: '◌' },
  { key: 'dashDamage', category: 'dash', label: 'Dash-Schaden', icon: '✧' },
  { key: 'dashShield', category: 'dash', label: 'Dash-Schild', icon: '⬢' },
  { key: 'dashResist', category: 'dash', label: 'Dash-Schadensreduktion', icon: '◇' },
];

const numberFormat = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function number(value: number) {
  return numberFormat.format(value);
}

function percentMultiplier(
  level: number,
  label: string,
  step = 2,
  maximumBonus = Number.POSITIVE_INFINITY,
) {
  const bonus = Math.min(maximumBonus, Math.max(0, level) * step);
  const maximum = Number.isFinite(maximumBonus) ? `, max. +${number(maximumBonus)} %` : '';
  return `${number(100 + bonus)} % ${label} (+${number(step)} % pro Stufe${maximum})`;
}

/** The exact value a permanent level currently produces, plus its next-step rule. */
export function upgradeCurrentValue(key: UpgradeKey, level: number) {
  const safeLevel = Math.max(0, Math.floor(level));
  switch (key) {
    case 'healthRegen':
      return `${number(healthRegenPerSecond(safeLevel))} Leben pro Sekunde (+${number(HEALTH_REGEN_PER_LEVEL)} pro Stufe)`;
    case 'startMoney':
      return `${number(startingMoney(safeLevel))} $ Startgeld (+${number(START_MONEY_PER_LEVEL)} $ pro Stufe)`;
    case 'maxHealth':
      return `${number(PLAYER_BASE_HEALTH * (1 + safeLevel * 0.02))} maximales Leben (+2 % pro Stufe)`;
    case 'armor':
      return `${number(armorReduction(safeLevel) * 100)} % weniger Schaden (+1 % pro Stufe)`;
    case 'moveSpeed':
      return percentMultiplier(safeLevel, 'Bewegungstempo');
    case 'weaponDamage':
      return percentMultiplier(
        safeLevel,
        'Schaden aller Fernkampfwaffen',
        WEAPON_DAMAGE_PER_LEVEL * 100,
      );
    case 'reloadSpeed':
      return percentMultiplier(safeLevel, 'Nachladetempo');
    case 'magazineSize':
      return percentMultiplier(safeLevel, 'Magazinkapazität');
    case 'reserveAmmo':
      return percentMultiplier(safeLevel, 'Munitionsreserve');
    case 'ammoCost':
      return `${number(ammoCostReduction(safeLevel) * 100)} % günstiger nachfüllen (+1 % pro Stufe, max. 90 %)`;
    case 'meleeDamage':
      return percentMultiplier(
        safeLevel,
        'Schaden aller Nahkampfwaffen',
        WEAPON_DAMAGE_PER_LEVEL * 100,
      );
    case 'meleeSpeed':
      return percentMultiplier(safeLevel, 'Nahkampf-Angriffstempo');
    case 'meleeRange':
      return percentMultiplier(safeLevel, 'Nahkampf-Reichweite', 1);
    case 'grenadeDamage':
      return `${number(GRENADE_BASE_DAMAGE * (1 + safeLevel * 0.02))} Granatenschaden (+2 % pro Stufe)`;
    case 'grenadeCooldown':
      return `${number(Math.max(GRENADE_MIN_COOLDOWN, GRENADE_BASE_COOLDOWN / (1 + safeLevel * 0.02)))} s Cooldown (+2 % Tempo pro Stufe, min. ${number(GRENADE_MIN_COOLDOWN)} s)`;
    case 'grenadeRadius':
      return `${number(GRENADE_BASE_RADIUS * (1 + safeLevel * 0.02))} Explosionsradius (+2 % pro Stufe)`;
    case 'grenadeSplit':
      return `${number(safeLevel)} Mini-Granaten (+1 pro Stufe)`;
    case 'mortarDamage':
      return `${number(MORTAR_BASE_DAMAGE * (1 + safeLevel * 0.03))} Einschlagsschaden (+3 % pro Stufe)`;
    case 'mortarCooldown':
      return `${number(Math.max(MORTAR_MIN_COOLDOWN, MORTAR_BASE_COOLDOWN / (1 + safeLevel * 0.02)))} s Cooldown (+2 % Tempo pro Stufe, min. ${number(MORTAR_MIN_COOLDOWN)} s)`;
    case 'mortarRadius':
      return `${number(MORTAR_BASE_RADIUS * (1 + safeLevel * 0.015))} Zielradius (+1,5 % pro Stufe)`;
    case 'mortarSlow':
      return `${number(MORTAR_BASE_SLOW_SECONDS + safeLevel * 0.25)} s Verlangsamung (+0,25 s pro Stufe)`;
    case 'precisionDamage':
      return `${number(PRECISION_BASE_DAMAGE * (1 + safeLevel * 0.03))} Einzelschaden (+3 % pro Stufe)`;
    case 'precisionCooldown':
      return `${number(Math.max(PRECISION_MIN_COOLDOWN, PRECISION_BASE_COOLDOWN / (1 + safeLevel * 0.02)))} s Cooldown (+2 % Tempo pro Stufe, min. ${number(PRECISION_MIN_COOLDOWN)} s)`;
    case 'precisionWidth':
      return `${number(PRECISION_PROJECTILE_RADIUS * 2 + safeLevel * 2)} Projektilbreite (+2 pro Stufe)`;
    case 'precisionExecute':
      return `Bis zu +${number(safeLevel * 5)} % Schaden gegen verwundete Ziele (+5 % pro Stufe)`;
    case 'precisionHealthDamage':
      return `${number(safeLevel * PRECISION_HEALTH_DAMAGE_PER_LEVEL * 100)} % maximales Gegnerleben als Bonusschaden · Mini-Bosse ${number(safeLevel * PRECISION_HEALTH_DAMAGE_PER_LEVEL * PRECISION_MINI_HEALTH_DAMAGE_FACTOR * 100)} % · Bosse ${number(safeLevel * PRECISION_HEALTH_DAMAGE_PER_LEVEL * PRECISION_BOSS_HEALTH_DAMAGE_FACTOR * 100)} % (+1 % pro Stufe)`;
    case 'nullCoreDamage':
      return `${number(NULL_CORE_BASE_DPS * (1 + safeLevel * 0.03))} Kernschaden/s · ${number(NULL_FIELD_BASE_DPS * (1 + safeLevel * 0.03))} Feldschaden/s (+3 % pro Stufe)`;
    case 'nullCoreCooldown':
      return `${number(Math.max(NULL_CORE_MIN_COOLDOWN, NULL_CORE_BASE_COOLDOWN / (1 + safeLevel * 0.02)))} s Cooldown (+2 % Tempo pro Stufe, min. ${number(NULL_CORE_MIN_COOLDOWN)} s)`;
    case 'nullCoreDuration':
      return `${number(NULL_CORE_BASE_SECONDS + safeLevel * NULL_CORE_SECONDS_PER_LEVEL)} s Standzeit (+${number(NULL_CORE_SECONDS_PER_LEVEL)} s pro Stufe)`;
    case 'nullCoreRadius':
      return `${number(NULL_CORE_BASE_RADIUS * (1 + safeLevel * 0.015))} Kernreichweite (+1,5 % pro Stufe)`;
    case 'nullFieldRadius':
      return `${number(NULL_FIELD_BASE_RADIUS * (1 + safeLevel * 0.015))} Feldreichweite (+1,5 % pro Stufe)`;
    case 'barricadeHealth':
      return percentMultiplier(safeLevel, 'Barrikadenleben');
    case 'turretDamage':
      return percentMultiplier(safeLevel, 'Turmschaden');
    case 'turretRange':
      return percentMultiplier(safeLevel, 'Turmreichweite', 1);
    case 'vehicleHealth':
      return percentMultiplier(safeLevel, 'Fahrzeugleben');
    case 'vehicleArmor':
      return `${number(vehicleArmorReduction(safeLevel) * 100)} % weniger Schaden (+1 % pro Stufe)`;
    case 'vehicleSpeed':
      return percentMultiplier(safeLevel, 'Fahrzeugtempo', VEHICLE_SPEED_STEP * 100);
    case 'vehicleRam':
      return percentMultiplier(safeLevel, 'Rammschaden');
    case 'vehicleGun':
      return percentMultiplier(safeLevel, 'Bordwaffenschaden');
    case 'dashCharges':
      return `${number(DASH_BASE_CHARGES + safeLevel)} Dash-Ladungen (+1 pro Stufe)`;
    case 'dashRecharge':
      return `${number(Math.max(1.2, DASH_RECHARGE / (1 + safeLevel * 0.02)))} s pro Ladung (+2 % Tempo pro Stufe, min. 1,2 s)`;
    case 'dashDamage':
      return percentMultiplier(safeLevel, 'Dash-Schaden');
    case 'dashShield':
      return `${number(DASH_SHIELD_PER_HIT * (1 + safeLevel * 0.02))} Schild pro Gegner (+2 % pro Stufe)`;
    case 'dashResist':
      return `${number(dashReduction(safeLevel) * 100)} % weniger Schaden im Dash (+10 % pro Stufe, max. 100 %)`;
  }
}

/** Special buys that change a rule instead of a number, each bought once. */
export const PERK_DEFINITIONS: PerkDefinition[] = [
  {
    key: 'starterWeapon',
    label: 'Waffenhändler',
    description: 'Die erste gekaufte Waffe eines Runs kostet 20 % weniger.',
    icon: '⚒',
  },
  {
    key: 'starterBarricade',
    label: 'Bausatz',
    description: 'Die ersten zwei Barrikaden eines Runs kosten 20 % weniger.',
    icon: '▰',
  },
  {
    key: 'starterTurret',
    label: 'Erstausstattung',
    description: 'Der erste Turm eines Runs kostet 20 % weniger.',
    icon: '⌖',
  },
  {
    key: 'motorPool',
    label: 'Fuhrpark',
    description: 'Das erste Fahrzeug eines Runs kostet 20 % weniger.',
    icon: '🚙',
  },
  {
    key: 'dashShock',
    label: 'Stoßdash',
    description: 'Der ganze Dash schleudert getroffene Zombies weit weg und verletzt sie.',
    icon: '✺',
  },
  {
    key: 'dashBlades',
    label: 'Klingendash',
    description:
      'Jeder Gegner, durch den du dashst, nimmt Schaden und lädt dein Schild. ' +
      'Das Schild schluckt Treffer und schmilzt langsam wieder weg.',
    icon: '⚔',
  },
  {
    key: 'fieldMedic',
    label: 'Sanitäter',
    description: 'Wiederbeleben geht doppelt so schnell, der Trupp steht mit 70 % Leben auf.',
    icon: '✚',
  },
  {
    key: 'engineer',
    label: 'Techniker',
    description: 'Reparaturen kosten 40 % weniger.',
    icon: '⚙',
  },
  {
    key: 'extraGrenade',
    label: 'Zweiter Gürtel',
    description: 'Eine Granate mehr im Gürtel.',
    icon: '●',
  },
  {
    key: 'mortarNapalm',
    label: 'Phosphorkern',
    description:
      'Der Mörserschlag hinterlässt 6 Sekunden lang ein brennendes Feld, das Gegnern fortlaufend Schaden zufügt.',
    icon: '♨',
  },
  {
    key: 'extraMortar',
    label: 'Doppelrohr-Freigabe',
    description: 'Du kannst eine zweite Ladung Mörserschlag bereithalten.',
    icon: '2×',
  },
  {
    key: 'precisionReload',
    label: 'Todesurteil',
    description:
      'Tötet der Vernichtungsschuss sein Ziel, verkürzt sich seine verbleibende Abklingzeit um 90 %.',
    icon: '‡',
  },
  {
    key: 'extraPrecision',
    label: 'Doppelmagazin',
    description: 'Du kannst eine zweite Ladung Vernichtungsschuss bereithalten.',
    icon: '2×',
  },
  {
    key: 'nullCoreGravity',
    label: 'Gravitationsanker',
    description:
      'Das äußere Feld verlangsamt Gegner um 40 % und zieht sie fortlaufend in den tödlichen Kern.',
    icon: '⊙',
  },
  {
    key: 'extraNullCore',
    label: 'Zwillingssingularität',
    description: 'Du kannst eine zweite Ladung Nullpunktkern bereithalten.',
    icon: '2×',
  },
  {
    key: 'lastStand',
    label: 'Letztes Aufbäumen',
    description: 'Einmal pro Welle überlebst du einen tödlichen Treffer mit 1 Leben.',
    icon: '⛨',
  },
  {
    key: 'emergencyExit',
    label: 'Notausstieg',
    description:
      'Wird dein Fahrzeug zerstört, bist du nach dem Herausspringen 1 Sekunde lang unverwundbar.',
    icon: '⬡',
  },
  {
    key: 'upgradeAmplifier',
    label: 'Stufenverstärker · Stufen-Upgrades',
    description:
      'Erhöht die kaufbaren Maximalstufen aller Stufen-Upgrades außer Fähigkeiten um 50 % (aufgerundet). Jede zusätzliche Stufe muss weiterhin mit Gold gekauft werden.',
    icon: '1,5×',
  },
  {
    key: 'abilityUpgradeAmplifier',
    label: 'Stufenverstärker · Fähigkeiten',
    description:
      'Erhöht die kaufbaren Maximalstufen aller Fähigkeits-Upgrades um 50 % (aufgerundet). Jede zusätzliche Stufe muss weiterhin mit Gold gekauft werden.',
    icon: 'G 1,5×',
  },
  {
    key: 'upgradeAmplifier2',
    label: 'Stufenverstärker II · Stufen-Upgrades',
    description:
      'Erhöht die bereits verstärkten Maximalstufen der normalen Stufen-Upgrades erneut um 50 % (aufgerundet).',
    icon: '2,25×',
  },
  {
    key: 'abilityUpgradeAmplifier2',
    label: 'Stufenverstärker II · Fähigkeiten',
    description:
      'Erhöht die bereits verstärkten Maximalstufen der Fähigkeits-Upgrades erneut um 50 % (aufgerundet).',
    icon: 'G 2,25×',
  },
];
