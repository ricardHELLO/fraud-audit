export interface NormalizedDailySales {
  date: string; // YYYY-MM-DD
  location: string;
  gross_sales: number;
  net_sales: number;
  expected_cash: number;
  actual_cash: number;
  cash_discrepancy: number;
}

export interface NormalizedInvoice {
  id: string;
  date: string;
  location: string;
  employee: string;
  amount: number;
  status: 'active' | 'deleted';
  deletion_phase?: 'before_kitchen' | 'after_kitchen' | 'after_billing';
}

export interface NormalizedDeletedProduct {
  id: string;
  date: string;
  location: string;
  employee: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  phase: 'before_kitchen' | 'after_kitchen' | 'after_billing';
}

export interface NormalizedWaste {
  id: string;
  date: string;
  location: string;
  product_name: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  total_cost: number;
}

export interface NormalizedInventoryDeviation {
  month: string; // YYYY-MM
  location: string;
  product_name: string;
  theoretical_consumption: number;
  actual_consumption: number;
  deviation: number;
  unit: string;
}

export interface NormalizedDataset {
  daily_sales: NormalizedDailySales[];
  invoices: NormalizedInvoice[];
  deleted_products: NormalizedDeletedProduct[];
  waste: NormalizedWaste[];
  inventory_deviations: NormalizedInventoryDeviation[];
  metadata: {
    date_from: string;
    date_to: string;
    locations: string[];
    pos_connector: string;
    inventory_connector?: string;
  };
}
