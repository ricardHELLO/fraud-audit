import { ConnectorType } from '@/lib/types/connectors';
import { NormalizedDataset } from '@/lib/types/normalized';
import { parseLastApp } from './lastapp';
import { parseTSpoonLab } from './tspoonlab';
import { parseGlop } from './glop';
import { parseAgora } from './agora';
import { parseRevo } from './revo';
import { parsePrezo } from './prezo';
import { parseGStock } from './gstock';

export type ParserFunction = (csvContent: string) => Partial<NormalizedDataset>;

const parsers: Record<ConnectorType, ParserFunction> = {
  lastapp: parseLastApp,
  glop: parseGlop,
  agora: parseAgora,
  revo: parseRevo,
  tspoonlab: parseTSpoonLab,
  prezo: parsePrezo,
  gstock: parseGStock,
};

export function getParser(connectorType: ConnectorType): ParserFunction {
  const parser = parsers[connectorType];
  if (!parser) throw new Error(`No parser found for connector: ${connectorType}`);
  return parser;
}

export function mergeDatasets(
  posData: Partial<NormalizedDataset>,
  inventoryData?: Partial<NormalizedDataset>,
): NormalizedDataset {
  return {
    daily_sales: posData.daily_sales || [],
    invoices: posData.invoices || [],
    deleted_products: posData.deleted_products || [],
    waste: posData.waste || inventoryData?.waste || [],
    inventory_deviations:
      posData.inventory_deviations || inventoryData?.inventory_deviations || [],
    metadata: {
      date_from: posData.metadata?.date_from || '',
      date_to: posData.metadata?.date_to || '',
      locations: [
        ...new Set([
          ...(posData.metadata?.locations || []),
          ...(inventoryData?.metadata?.locations || []),
        ]),
      ],
      pos_connector: posData.metadata?.pos_connector || '',
      inventory_connector: inventoryData?.metadata?.inventory_connector,
    },
  };
}
