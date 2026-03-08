export type POSConnector = 'lastapp' | 'glop' | 'agora' | 'revo';
export type InventoryConnector = 'tspoonlab' | 'prezo' | 'gstock';
export type ConnectorType = POSConnector | InventoryConnector;

export interface ConnectorInfo {
  id: ConnectorType;
  name: string;
  category: 'pos' | 'inventory';
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
