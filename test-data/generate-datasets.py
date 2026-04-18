#!/usr/bin/env python3
"""
Generate 6 realistic restaurant fraud datasets for FraudAudit testing.
Each dataset tells a different story with distinct anomaly patterns.
"""

import random
import csv
import io
import os
from datetime import datetime, timedelta

random.seed(42)

# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

PRODUCTS = {
    "Cerveza Estrella": 3.50,
    "Cerveza Artesana": 5.00,
    "Copa Vino Tinto": 5.50,
    "Copa Vino Blanco": 5.00,
    "Sangria Jarra": 12.00,
    "Gin Tonic": 9.50,
    "Mojito": 8.50,
    "Agua Mineral": 2.50,
    "Refresco": 3.00,
    "Cafe Solo": 1.80,
    "Cafe con Leche": 2.20,
    "Cortado": 1.90,
    "Tostada": 3.50,
    "Patatas Bravas": 6.50,
    "Croquetas Jamon": 7.00,
    "Tortilla Espanola": 8.00,
    "Jamon Iberico": 16.00,
    "Ensalada Mixta": 9.50,
    "Ensalada Cesar": 11.00,
    "Gazpacho": 7.50,
    "Gambas al Ajillo": 13.50,
    "Pulpo a la Gallega": 15.00,
    "Calamares Fritos": 10.50,
    "Hamburguesa Clasica": 12.50,
    "Hamburguesa Gourmet": 15.00,
    "Paella Valenciana": 14.50,
    "Paella Mixta": 15.50,
    "Arroz Negro": 16.00,
    "Entrecot": 22.00,
    "Solomillo Iberico": 24.00,
    "Lubina a la Plancha": 18.00,
    "Dorada al Horno": 17.50,
    "Tarta Queso": 6.50,
    "Crema Catalana": 5.50,
    "Tiramisu": 6.00,
    "Helado Artesano": 4.50,
}

EMPLOYEES_POOL = [
    "Carlos M.", "Laura F.", "Miguel A.", "Sofia N.", "David L.",
    "Maria G.", "Javier R.", "Ana P.", "Pedro S.", "Elena V.",
    "Roberto T.", "Carmen B.", "Luis H.", "Patricia D.", "Alberto R.",
    "Isabel M.", "Fernando C.", "Marta S.", "Pablo G.", "Lucia F.",
    "Raul N.", "Andrea L.", "Diego P.", "Sara T.", "Victor E.",
]

PHASES = ["Antes de la cocina", "Despues de la cocina", "Despues del cobro"]


def date_range(start_str, end_str):
    """Generate dates between start and end (DD/MM/YYYY format)."""
    start = datetime.strptime(start_str, "%d/%m/%Y")
    end = datetime.strptime(end_str, "%d/%m/%Y")
    dates = []
    current = start
    while current <= end:
        dates.append(current.strftime("%d/%m/%Y"))
        current += timedelta(days=1)
    return dates


def gen_daily_sales(dates, locations, config):
    """
    Generate daily sales rows.
    config per location: {
        "base_sales": (min, max),
        "discrepancy": (min, max),
        "spike_dates": [(date_str, extra_disc)],  # optional
    }
    """
    rows = []
    for date in dates:
        for loc in locations:
            cfg = config.get(loc, config.get("_default", {}))
            base_min, base_max = cfg.get("base_sales", (2000, 4000))
            disc_min, disc_max = cfg.get("discrepancy", (-5, 5))

            gross = round(random.uniform(base_min, base_max), 2)
            net = round(gross * random.uniform(0.85, 0.92), 2)
            expected = round(net * random.uniform(0.35, 0.45), 2)

            disc = round(random.uniform(disc_min, disc_max), 2)

            # Apply spike if date matches
            for spike_date, extra in cfg.get("spike_dates", []):
                if date == spike_date:
                    disc += extra

            actual = round(expected + disc, 2)
            disc = round(actual - expected, 2)

            rows.append([date, loc, f"{gross:.2f}", f"{net:.2f}",
                         f"{expected:.2f}", f"{actual:.2f}", f"{disc:.2f}"])
    return rows


def gen_invoices(dates, locations, employees, config):
    """
    Generate invoice rows (mix of active and deleted).
    config: {
        "total_deleted": int,
        "phase_weights": {"before": w, "after_kitchen": w, "after_billing": w},
        "employee_concentration": {"name": str, "pct": float},  # optional
        "location_concentration": {"name": str, "pct": float},  # optional
        "deleted_products": list of (product, qty, price) or "random",
        "date_concentration": {"start": str, "end": str, "pct": float},  # optional
    }
    """
    invoice_num = 1000
    rows = []

    total_deleted = config.get("total_deleted", 30)
    phase_w = config.get("phase_weights", {"before": 0.5, "after_kitchen": 0.3, "after_billing": 0.2})
    emp_conc = config.get("employee_concentration", None)
    loc_conc = config.get("location_concentration", None)
    date_conc = config.get("date_concentration", None)

    # Generate active invoices (background noise)
    active_count = max(len(dates) * len(locations) * 3, 200)
    for _ in range(active_count):
        date = random.choice(dates)
        loc = random.choice(locations)
        emp = random.choice(employees)
        product = random.choice(list(PRODUCTS.keys()))
        price = PRODUCTS[product]
        qty = random.randint(1, 4)
        amount = round(price * qty, 2)
        invoice_num += 1

        rows.append([date, loc, f"F-{invoice_num}", emp, f"{amount:.2f}",
                      "Activo", "", product, str(qty), f"{price:.2f}"])

    # Generate deleted invoices
    for i in range(total_deleted):
        # Pick date
        if date_conc and random.random() < date_conc["pct"]:
            conc_dates = date_range(date_conc["start"], date_conc["end"])
            date = random.choice([d for d in conc_dates if d in dates] or dates)
        else:
            date = random.choice(dates)

        # Pick location
        if loc_conc and random.random() < loc_conc["pct"]:
            loc = loc_conc["name"]
        else:
            loc = random.choice(locations)

        # Pick employee
        if emp_conc and random.random() < emp_conc["pct"]:
            emp = emp_conc["name"]
        else:
            emp = random.choice(employees)

        # Pick phase
        r = random.random()
        cumulative = 0
        phase = "Antes de la cocina"
        for p_name, p_key, w in [
            ("Antes de la cocina", "before", phase_w.get("before", 0.33)),
            ("Despues de la cocina", "after_kitchen", phase_w.get("after_kitchen", 0.33)),
            ("Despues del cobro", "after_billing", phase_w.get("after_billing", 0.34)),
        ]:
            cumulative += w
            if r <= cumulative:
                phase = p_name
                break

        # Pick product
        expensive = config.get("expensive_products", False)
        if expensive:
            expensive_items = {k: v for k, v in PRODUCTS.items() if v >= 12}
            product = random.choice(list(expensive_items.keys()))
            price = expensive_items[product]
        else:
            product = random.choice(list(PRODUCTS.keys()))
            price = PRODUCTS[product]

        qty = random.randint(1, 3)
        amount = round(price * qty, 2)
        invoice_num += 1

        rows.append([date, loc, f"F-{invoice_num}", emp, f"{amount:.2f}",
                      "Eliminado", phase, product, str(qty), f"{price:.2f}"])

    random.shuffle(rows)
    return rows


def write_csv(filename, daily_rows, invoice_rows):
    """Write a combined CSV with sales and invoice sections."""
    with open(filename, "w", newline="", encoding="utf-8") as f:
        # Section 1: Daily Sales
        f.write("Fecha,Local,Ventas Brutas,Ventas Netas,Efectivo Esperado,Efectivo Real,Descuadre\n")
        for row in daily_rows:
            f.write(",".join(row) + "\n")

        # Blank line separator
        f.write("\n")

        # Section 2: Invoices
        f.write("Fecha,Local,Nº Factura,Empleado,Importe,Estado,Fase Eliminación,Producto,Cantidad,Precio Unitario\n")
        for row in invoice_rows:
            f.write(",".join(row) + "\n")

    print(f"  Created: {filename} ({len(daily_rows)} sales rows, {len(invoice_rows)} invoice rows)")


# ─────────────────────────────────────────────
# Dataset 1: "La Paella Dorada" - Robo sistemático de caja
# ─────────────────────────────────────────────

def dataset_1():
    print("\n📊 Dataset 1: La Paella Dorada - Robo sistemático de caja")
    dates = date_range("01/01/2026", "31/03/2026")
    locations = ["Valencia Centro", "Malvarrosa", "Ruzafa"]
    employees = EMPLOYEES_POOL[:8]

    daily_config = {
        "Valencia Centro": {
            "base_sales": (3500, 5500),
            "discrepancy": (-250, -80),  # SEVERE negative discrepancy
        },
        "Malvarrosa": {
            "base_sales": (2000, 3500),
            "discrepancy": (-8, 12),  # Normal
        },
        "Ruzafa": {
            "base_sales": (2500, 4000),
            "discrepancy": (-10, 8),  # Normal
        },
    }

    invoice_config = {
        "total_deleted": 18,  # Low - cash theft, not invoice fraud
        "phase_weights": {"before": 0.6, "after_kitchen": 0.3, "after_billing": 0.1},
        "location_concentration": {"name": "Valencia Centro", "pct": 0.5},
    }

    daily = gen_daily_sales(dates, locations, daily_config)
    invoices = gen_invoices(dates, locations, employees, invoice_config)
    write_csv("test-data/dataset-1-paella-dorada.csv", daily, invoices)


# ─────────────────────────────────────────────
# Dataset 2: "Tapas & Co" - Empleado fraudulento
# ─────────────────────────────────────────────

def dataset_2():
    print("\n📊 Dataset 2: Tapas & Co - Empleado fraudulento")
    dates = date_range("01/02/2026", "31/03/2026")
    locations = ["Madrid Sol", "Malasaña"]
    employees = EMPLOYEES_POOL[:6]

    daily_config = {
        "Madrid Sol": {
            "base_sales": (4000, 6000),
            "discrepancy": (-45, -10),  # Moderate negative (correlated w/ deletions)
        },
        "Malasaña": {
            "base_sales": (2500, 4000),
            "discrepancy": (-5, 10),  # Normal
        },
    }

    invoice_config = {
        "total_deleted": 65,  # HIGH number of deletions
        "phase_weights": {"before": 0.08, "after_kitchen": 0.15, "after_billing": 0.77},  # 77% post-billing!
        "employee_concentration": {"name": "Javier R.", "pct": 0.72},  # 72% by one person
        "location_concentration": {"name": "Madrid Sol", "pct": 0.80},
        "expensive_products": True,  # Targets expensive items
    }

    daily = gen_daily_sales(dates, locations, daily_config)
    invoices = gen_invoices(dates, locations, employees, invoice_config)
    write_csv("test-data/dataset-2-tapas-co.csv", daily, invoices)


# ─────────────────────────────────────────────
# Dataset 3: "Sushi Zen" - Operación ejemplar
# ─────────────────────────────────────────────

def dataset_3():
    print("\n📊 Dataset 3: Sushi Zen - Operación ejemplar")
    dates = date_range("01/12/2025", "28/02/2026")
    locations = ["Diagonal", "Sarria", "Pedralbes", "Sant Gervasi"]
    employees = EMPLOYEES_POOL[:10]

    daily_config = {
        "_default": {
            "base_sales": (3000, 5000),
            "discrepancy": (-4, 6),  # Tiny discrepancies
        },
    }

    invoice_config = {
        "total_deleted": 12,  # Very few deletions
        "phase_weights": {"before": 0.75, "after_kitchen": 0.20, "after_billing": 0.05},  # Almost all before kitchen
    }

    daily = gen_daily_sales(dates, locations, daily_config)
    invoices = gen_invoices(dates, locations, employees, invoice_config)
    write_csv("test-data/dataset-3-sushi-zen.csv", daily, invoices)


# ─────────────────────────────────────────────
# Dataset 4: "El Asador" - Fraude organizado multi-empleado
# ─────────────────────────────────────────────

def dataset_4():
    print("\n📊 Dataset 4: El Asador - Fraude organizado multi-empleado")
    dates = date_range("01/01/2026", "28/02/2026")
    locations = ["Malaga Centro", "Puerto", "Pedregalejo"]
    employees = EMPLOYEES_POOL[:12]

    # 3 "inside" employees with coordinated patterns
    fraudsters = ["Roberto T.", "Carmen B.", "Luis H."]

    daily_config = {
        "Malaga Centro": {
            "base_sales": (3000, 5000),
            "discrepancy": (-120, -30),  # Bad
        },
        "Puerto": {
            "base_sales": (3500, 5500),
            "discrepancy": (-90, -20),  # Bad
        },
        "Pedregalejo": {
            "base_sales": (2000, 3500),
            "discrepancy": (-60, -10),  # Moderate bad
        },
    }

    # Generate invoices with 3 coordinated employees
    invoice_config = {
        "total_deleted": 85,  # High
        "phase_weights": {"before": 0.12, "after_kitchen": 0.28, "after_billing": 0.60},
        "expensive_products": True,
    }

    daily = gen_daily_sales(dates, locations, daily_config)

    # Custom invoice generation: distribute among 3 fraudsters + noise
    invoice_num = 5000
    invoice_rows = []

    # Active invoices (noise)
    for _ in range(400):
        date = random.choice(dates)
        loc = random.choice(locations)
        emp = random.choice(employees)
        product = random.choice(list(PRODUCTS.keys()))
        price = PRODUCTS[product]
        qty = random.randint(1, 4)
        amount = round(price * qty, 2)
        invoice_num += 1
        invoice_rows.append([date, loc, f"F-{invoice_num}", emp, f"{amount:.2f}",
                             "Activo", "", product, str(qty), f"{price:.2f}"])

    # Deleted by fraudsters (coordinated)
    for i in range(85):
        date = random.choice(dates)

        # Each fraudster works in a specific location
        if random.random() < 0.85:  # 85% by fraudsters
            fraudster_idx = i % 3
            emp = fraudsters[fraudster_idx]
            loc = locations[fraudster_idx]
        else:
            emp = random.choice(employees)
            loc = random.choice(locations)

        # Mostly after billing
        r = random.random()
        if r < 0.12:
            phase = "Antes de la cocina"
        elif r < 0.40:
            phase = "Despues de la cocina"
        else:
            phase = "Despues del cobro"

        # Target expensive items
        expensive = {k: v for k, v in PRODUCTS.items() if v >= 10}
        product = random.choice(list(expensive.keys()))
        price = expensive[product]
        qty = random.randint(1, 3)
        amount = round(price * qty, 2)
        invoice_num += 1

        invoice_rows.append([date, loc, f"F-{invoice_num}", emp, f"{amount:.2f}",
                             "Eliminado", phase, product, str(qty), f"{price:.2f}"])

    random.shuffle(invoice_rows)
    write_csv("test-data/dataset-4-el-asador.csv", daily, invoice_rows)


# ─────────────────────────────────────────────
# Dataset 5: "Café del Puerto" - Pico estacional
# ─────────────────────────────────────────────

def dataset_5():
    print("\n📊 Dataset 5: Café del Puerto - Pico estacional (normal→spike)")
    dates_normal = date_range("01/11/2025", "31/12/2025")
    dates_spike = date_range("01/01/2026", "31/01/2026")
    all_dates = dates_normal + dates_spike
    locations = ["Cadiz Centro", "La Caleta", "Santa Maria"]
    employees = EMPLOYEES_POOL[:7]

    # Generate daily sales: normal first 2 months, spike in January
    daily_rows = []
    for date in all_dates:
        for loc in locations:
            gross = round(random.uniform(2500, 4500), 2)
            net = round(gross * random.uniform(0.86, 0.91), 2)
            expected = round(net * random.uniform(0.36, 0.44), 2)

            if date in dates_spike:
                # January: sudden spike in discrepancies
                if loc == "Cadiz Centro":
                    disc = round(random.uniform(-180, -60), 2)
                elif loc == "La Caleta":
                    disc = round(random.uniform(-100, -25), 2)
                else:
                    disc = round(random.uniform(-50, -5), 2)
            else:
                # Nov-Dec: normal
                disc = round(random.uniform(-8, 8), 2)

            actual = round(expected + disc, 2)
            disc = round(actual - expected, 2)
            daily_rows.append([date, loc, f"{gross:.2f}", f"{net:.2f}",
                               f"{expected:.2f}", f"{actual:.2f}", f"{disc:.2f}"])

    # Invoices: few in Nov-Dec, many deletions in January
    invoice_num = 8000
    invoice_rows = []

    # Active background
    for _ in range(350):
        date = random.choice(all_dates)
        loc = random.choice(locations)
        emp = random.choice(employees)
        product = random.choice(list(PRODUCTS.keys()))
        price = PRODUCTS[product]
        qty = random.randint(1, 3)
        amount = round(price * qty, 2)
        invoice_num += 1
        invoice_rows.append([date, loc, f"F-{invoice_num}", emp, f"{amount:.2f}",
                             "Activo", "", product, str(qty), f"{price:.2f}"])

    # Few deletions in Nov-Dec (normal)
    for _ in range(8):
        date = random.choice(dates_normal)
        loc = random.choice(locations)
        emp = random.choice(employees)
        product = random.choice(list(PRODUCTS.keys()))
        price = PRODUCTS[product]
        qty = random.randint(1, 2)
        amount = round(price * qty, 2)
        invoice_num += 1
        invoice_rows.append([date, loc, f"F-{invoice_num}", emp, f"{amount:.2f}",
                             "Eliminado", "Antes de la cocina", product, str(qty), f"{price:.2f}"])

    # MANY deletions in January (spike)
    for _ in range(55):
        date = random.choice(dates_spike)
        loc = random.choice(locations)
        if random.random() < 0.5:
            loc = "Cadiz Centro"  # Concentrate

        emp = random.choice(employees)
        # Mix of phases, more after_billing in January
        r = random.random()
        if r < 0.15:
            phase = "Antes de la cocina"
        elif r < 0.40:
            phase = "Despues de la cocina"
        else:
            phase = "Despues del cobro"

        product = random.choice(list(PRODUCTS.keys()))
        price = PRODUCTS[product]
        qty = random.randint(1, 3)
        amount = round(price * qty, 2)
        invoice_num += 1
        invoice_rows.append([date, loc, f"F-{invoice_num}", emp, f"{amount:.2f}",
                             "Eliminado", phase, product, str(qty), f"{price:.2f}"])

    random.shuffle(invoice_rows)
    write_csv("test-data/dataset-5-cafe-puerto.csv", daily_rows, invoice_rows)


# ─────────────────────────────────────────────
# Dataset 6: "Restaurante Luna" - Todo mal (worst case)
# ─────────────────────────────────────────────

def dataset_6():
    print("\n📊 Dataset 6: Restaurante Luna - Todo mal (worst case)")
    dates = date_range("01/11/2025", "31/01/2026")
    locations = ["Sevilla Centro", "Triana", "Nervion"]
    employees = EMPLOYEES_POOL[:9]

    daily_config = {
        "Sevilla Centro": {
            "base_sales": (4000, 6500),
            "discrepancy": (-300, -100),  # CATASTROPHIC
        },
        "Triana": {
            "base_sales": (3000, 5000),
            "discrepancy": (-150, -40),  # Very bad
        },
        "Nervion": {
            "base_sales": (2500, 4000),
            "discrepancy": (-80, -15),  # Bad
        },
    }

    invoice_config = {
        "total_deleted": 110,  # MASSIVE
        "phase_weights": {"before": 0.05, "after_kitchen": 0.15, "after_billing": 0.80},  # 80% post-billing!
        "employee_concentration": {"name": "Miguel A.", "pct": 0.55},  # 55% by one person
        "location_concentration": {"name": "Sevilla Centro", "pct": 0.65},
        "expensive_products": True,
    }

    daily = gen_daily_sales(dates, locations, daily_config)
    invoices = gen_invoices(dates, locations, employees, invoice_config)
    write_csv("test-data/dataset-6-restaurante-luna.csv", daily, invoices)


# ─────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────

if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)) or ".")
    os.chdir("..")  # Go to project root

    print("🔧 Generating 6 FraudAudit test datasets...\n")

    dataset_1()
    dataset_2()
    dataset_3()
    dataset_4()
    dataset_5()
    dataset_6()

    print("\n✅ All 6 datasets generated in test-data/")
    print("\nScenario summary:")
    print("  1. La Paella Dorada  → Robo caja sistemático (1 local, 3 meses)")
    print("  2. Tapas & Co        → Empleado fraudulento (post-factura, productos caros)")
    print("  3. Sushi Zen         → Operación ejemplar (low risk, 4 locales)")
    print("  4. El Asador         → Fraude organizado (3 empleados coordinados)")
    print("  5. Café del Puerto   → Pico estacional (normal→spike en enero)")
    print("  6. Restaurante Luna  → Todo mal (descuadres + eliminaciones + empleado)")
