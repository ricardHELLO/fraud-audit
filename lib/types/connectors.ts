// Source-of-truth arrays (usados tanto para tipos como para validación runtime).
// Si añades un connector nuevo, hazlo aquí y la unión de tipos se actualiza sola.
export const POS_CONNECTOR_IDS = ['lastapp', 'glop', 'agora', 'revo'] as const;
export const INVENTORY_CONNECTOR_IDS = ['tspoonlab', 'prezo', 'gstock'] as const;
export const SOURCE_CATEGORIES = ['pos', 'inventory'] as const;

export type POSConnector = (typeof POS_CONNECTOR_IDS)[number];
export type InventoryConnector = (typeof INVENTORY_CONNECTOR_IDS)[number];
export type ConnectorType = POSConnector | InventoryConnector;
export type SourceCategory = (typeof SOURCE_CATEGORIES)[number];

// Allowlist combinada para endpoints que aceptan cualquier connector (upload, parse).
export const ALL_CONNECTOR_IDS: readonly ConnectorType[] = [
  ...POS_CONNECTOR_IDS,
  ...INVENTORY_CONNECTOR_IDS,
];

// Runtime type guards (los endpoints reciben JSON de terceros; TS no protege ahí).
export function isPOSConnector(value: unknown): value is POSConnector {
  return typeof value === 'string' && (POS_CONNECTOR_IDS as readonly string[]).includes(value);
}

export function isInventoryConnector(value: unknown): value is InventoryConnector {
  return (
    typeof value === 'string' &&
    (INVENTORY_CONNECTOR_IDS as readonly string[]).includes(value)
  );
}

export function isConnectorType(value: unknown): value is ConnectorType {
  return typeof value === 'string' && (ALL_CONNECTOR_IDS as readonly string[]).includes(value);
}

export function isSourceCategory(value: unknown): value is SourceCategory {
  return typeof value === 'string' && (SOURCE_CATEGORIES as readonly string[]).includes(value);
}

export interface ConnectorInfo {
  id: ConnectorType;
  name: string;
  category: SourceCategory;
  logoUrl?: string;
  exportGuide?: string;
  isActive: boolean;
}

export const POS_CONNECTORS: ConnectorInfo[] = [
  { id: 'lastapp', name: 'Last.app', category: 'pos', isActive: true },
  { id: 'glop', name: 'Glop', category: 'pos', isActive: false },
  { id: 'agora', name: 'Agora', category: 'pos', isActive: false },
  { id: 'revo', name: 'Revo', category: 'pos', isActive: false },
];

export const INVENTORY_CONNECTORS: ConnectorInfo[] = [
  { id: 'tspoonlab', name: 'T-Spoon Lab', category: 'inventory', isActive: true },
  { id: 'prezo', name: 'Prezo', category: 'inventory', isActive: false },
  { id: 'gstock', name: 'GStock', category: 'inventory', isActive: false },
];
