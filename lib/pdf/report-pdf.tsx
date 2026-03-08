import React from 'react'
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from '@react-pdf/renderer'
import type { ReportData } from '@/lib/types/report'

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

const RISK_LABELS: Record<string, string> = {
  critical: 'CRITICO',
  high: 'ALTO',
  medium: 'MEDIO',
  low: 'BAJO',
}

const RISK_COLORS: Record<string, string> = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#d97706',
  low: '#16a34a',
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#d97706',
  low: '#16a34a',
}

/* ------------------------------------------------------------------ */
/*  Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#1c1917',
  },
  // Cover page
  coverPage: {
    padding: 60,
    fontFamily: 'Helvetica',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverLogo: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#2563eb',
    marginBottom: 8,
  },
  coverSubtitle: {
    fontSize: 12,
    color: '#78716c',
    marginBottom: 60,
  },
  coverOrgName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1c1917',
    marginBottom: 16,
    textAlign: 'center',
  },
  coverPeriod: {
    fontSize: 14,
    color: '#57534e',
    marginBottom: 8,
  },
  coverLocations: {
    fontSize: 12,
    color: '#78716c',
    marginBottom: 40,
  },
  coverRisk: {
    fontSize: 16,
    fontWeight: 'bold',
    padding: '8 20',
    borderRadius: 6,
  },
  // Section headers
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1c1917',
    marginBottom: 12,
    paddingBottom: 6,
    borderBottomWidth: 2,
    borderBottomColor: '#2563eb',
  },
  subTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#44403c',
    marginBottom: 8,
    marginTop: 16,
  },
  // Text
  bodyText: {
    fontSize: 10,
    color: '#57534e',
    lineHeight: 1.6,
    marginBottom: 6,
  },
  alertText: {
    fontSize: 10,
    color: '#dc2626',
    fontWeight: 'bold',
    marginBottom: 8,
    padding: 8,
    backgroundColor: '#fef2f2',
    borderRadius: 4,
  },
  // Tables
  table: {
    marginBottom: 16,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f4',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#d6d3d1',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e7e5e4',
  },
  tableHeaderCell: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#78716c',
    textTransform: 'uppercase',
  },
  tableCell: {
    fontSize: 9,
    color: '#44403c',
  },
  tableCellRight: {
    fontSize: 9,
    color: '#44403c',
    textAlign: 'right',
  },
  // Lists
  listItem: {
    flexDirection: 'row',
    marginBottom: 4,
    paddingLeft: 8,
  },
  listBullet: {
    fontSize: 10,
    color: '#2563eb',
    marginRight: 8,
    width: 12,
  },
  listText: {
    fontSize: 10,
    color: '#57534e',
    flex: 1,
    lineHeight: 1.5,
  },
  // Conclusion item
  conclusionItem: {
    marginBottom: 12,
    padding: 10,
    backgroundColor: '#fafaf9',
    borderRadius: 4,
    borderLeftWidth: 3,
  },
  conclusionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#1c1917',
    marginBottom: 4,
  },
  conclusionDesc: {
    fontSize: 9,
    color: '#57534e',
    lineHeight: 1.5,
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: '#a8a29e',
  },
})

/* ------------------------------------------------------------------ */
/*  PDF Document                                                        */
/* ------------------------------------------------------------------ */

interface ReportPDFProps {
  data: ReportData
}

export function ReportPDF({ data }: ReportPDFProps) {
  const riskLevel = data.summary.overall_risk_level
  const riskColor = RISK_COLORS[riskLevel] || '#78716c'

  return (
    <Document>
      {/* Cover Page */}
      <Page size="A4" style={styles.coverPage}>
        <Text style={styles.coverLogo}>FraudAudit</Text>
        <Text style={styles.coverSubtitle}>Informe de Fraude Operativo</Text>

        <Text style={styles.coverOrgName}>
          {data.summary.organization_name}
        </Text>
        <Text style={styles.coverPeriod}>
          Periodo: {data.summary.analysis_period}
        </Text>
        <Text style={styles.coverLocations}>
          {data.summary.locations_count} locales analizados
        </Text>

        <View
          style={{
            ...styles.coverRisk,
            backgroundColor: riskColor + '15',
            color: riskColor,
          }}
        >
          <Text>Riesgo {RISK_LABELS[riskLevel] || riskLevel}</Text>
        </View>
      </Page>

      {/* Summary Page */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>Resumen Ejecutivo</Text>

        {/* Key findings */}
        <Text style={styles.subTitle}>Hallazgos clave</Text>
        {data.summary.key_findings.map((finding, i) => (
          <View key={i} style={styles.listItem}>
            <Text style={styles.listBullet}>•</Text>
            <Text style={styles.listText}>{finding}</Text>
          </View>
        ))}

        {/* Quick metrics */}
        <Text style={styles.subTitle}>Metricas principales</Text>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={{ ...styles.tableHeaderCell, flex: 2 }}>Metrica</Text>
            <Text style={{ ...styles.tableHeaderCell, flex: 1, textAlign: 'right' }}>Valor</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={{ ...styles.tableCell, flex: 2 }}>Descuadre de caja total</Text>
            <Text style={{ ...styles.tableCellRight, flex: 1 }}>
              {formatCurrency(
                data.cash_discrepancy.locals.reduce((s, l) => s + l.total_discrepancy, 0)
              )}
            </Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={{ ...styles.tableCell, flex: 2 }}>Facturas eliminadas</Text>
            <Text style={{ ...styles.tableCellRight, flex: 1 }}>
              {data.deleted_invoices.total_count} ({formatCurrency(data.deleted_invoices.total_amount)})
            </Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={{ ...styles.tableCell, flex: 2 }}>Productos eliminados</Text>
            <Text style={{ ...styles.tableCellRight, flex: 1 }}>
              {data.deleted_products.total_eliminated}
            </Text>
          </View>
          {data.waste_analysis.total_waste > 0 && (
            <View style={styles.tableRow}>
              <Text style={{ ...styles.tableCell, flex: 2 }}>Mermas</Text>
              <Text style={{ ...styles.tableCellRight, flex: 1 }}>
                {formatPercent(data.waste_analysis.waste_percentage)}
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.footer}>
          <Text>FraudAudit - Informe generado automaticamente</Text>
        </Text>
      </Page>

      {/* Cash Discrepancy Page */}
      {data.cash_discrepancy.locals.length > 0 && (
        <Page size="A4" style={styles.page}>
          <Text style={styles.sectionTitle}>Descuadres de Caja</Text>

          {data.cash_discrepancy.alert_message && (
            <Text style={styles.alertText}>
              {data.cash_discrepancy.alert_message}
            </Text>
          )}

          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={{ ...styles.tableHeaderCell, flex: 2 }}>Local</Text>
              <Text style={{ ...styles.tableHeaderCell, flex: 1, textAlign: 'right' }}>Descuadre</Text>
              <Text style={{ ...styles.tableHeaderCell, flex: 1, textAlign: 'right' }}>Dias deficit</Text>
              <Text style={{ ...styles.tableHeaderCell, flex: 1, textAlign: 'right' }}>Total dias</Text>
            </View>
            {data.cash_discrepancy.locals.map((local, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={{ ...styles.tableCell, flex: 2 }}>{local.name}</Text>
                <Text style={{ ...styles.tableCellRight, flex: 1, color: local.total_discrepancy < 0 ? '#dc2626' : '#44403c' }}>
                  {formatCurrency(local.total_discrepancy)}
                </Text>
                <Text style={{ ...styles.tableCellRight, flex: 1 }}>{local.days_with_shortage}</Text>
                <Text style={{ ...styles.tableCellRight, flex: 1 }}>{local.total_days}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.footer}>
            <Text>FraudAudit - Informe generado automaticamente</Text>
          </Text>
        </Page>
      )}

      {/* Deleted Invoices Page */}
      {data.deleted_invoices.total_count > 0 && (
        <Page size="A4" style={styles.page}>
          <Text style={styles.sectionTitle}>Facturas Eliminadas</Text>

          {data.deleted_invoices.concentration_alert && (
            <Text style={styles.alertText}>
              {data.deleted_invoices.concentration_alert}
            </Text>
          )}

          <Text style={styles.subTitle}>Por local</Text>
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={{ ...styles.tableHeaderCell, flex: 2 }}>Local</Text>
              <Text style={{ ...styles.tableHeaderCell, flex: 1, textAlign: 'right' }}>Cantidad</Text>
              <Text style={{ ...styles.tableHeaderCell, flex: 1, textAlign: 'right' }}>Importe</Text>
            </View>
            {data.deleted_invoices.by_local.map((local, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={{ ...styles.tableCell, flex: 2 }}>{local.location}</Text>
                <Text style={{ ...styles.tableCellRight, flex: 1 }}>{local.count}</Text>
                <Text style={{ ...styles.tableCellRight, flex: 1 }}>{formatCurrency(local.amount)}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.subTitle}>Por empleado</Text>
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={{ ...styles.tableHeaderCell, flex: 2 }}>Empleado</Text>
              <Text style={{ ...styles.tableHeaderCell, flex: 1 }}>Local</Text>
              <Text style={{ ...styles.tableHeaderCell, flex: 1, textAlign: 'right' }}>Cantidad</Text>
              <Text style={{ ...styles.tableHeaderCell, flex: 1, textAlign: 'right' }}>Importe</Text>
            </View>
            {data.deleted_invoices.by_employee.slice(0, 15).map((emp, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={{ ...styles.tableCell, flex: 2 }}>{emp.employee}</Text>
                <Text style={{ ...styles.tableCell, flex: 1 }}>{emp.location}</Text>
                <Text style={{ ...styles.tableCellRight, flex: 1 }}>{emp.count}</Text>
                <Text style={{ ...styles.tableCellRight, flex: 1 }}>{formatCurrency(emp.amount)}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.footer}>
            <Text>FraudAudit - Informe generado automaticamente</Text>
          </Text>
        </Page>
      )}

      {/* Conclusions Page */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>Conclusiones y Acciones</Text>

        {data.conclusions.conclusions.map((conclusion, i) => (
          <View
            key={i}
            style={{
              ...styles.conclusionItem,
              borderLeftColor: SEVERITY_COLORS[conclusion.severity] || '#78716c',
            }}
          >
            <Text style={styles.conclusionTitle}>
              {conclusion.title}
            </Text>
            <Text style={styles.conclusionDesc}>
              {conclusion.description}
            </Text>
          </View>
        ))}

        {data.conclusions.immediate_actions.length > 0 && (
          <>
            <Text style={styles.subTitle}>Acciones inmediatas</Text>
            {data.conclusions.immediate_actions.map((action, i) => (
              <View key={i} style={styles.listItem}>
                <Text style={styles.listBullet}>•</Text>
                <Text style={styles.listText}>{action}</Text>
              </View>
            ))}
          </>
        )}

        {data.conclusions.structural_actions.length > 0 && (
          <>
            <Text style={styles.subTitle}>Acciones estructurales</Text>
            {data.conclusions.structural_actions.map((action, i) => (
              <View key={i} style={styles.listItem}>
                <Text style={styles.listBullet}>•</Text>
                <Text style={styles.listText}>{action}</Text>
              </View>
            ))}
          </>
        )}

        <Text style={styles.footer}>
          <Text>FraudAudit - Informe generado automaticamente</Text>
        </Text>
      </Page>
    </Document>
  )
}
