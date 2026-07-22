const currencyFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount);
}

// Convierte dígitos crudos de un input de monto (centavos) a texto formateado: "150" -> "$1,50".
export function formatCurrencyInput(digits: string): string {
  const cents = Number(digits || '0');
  return currencyFormatter.format(cents / 100);
}

// Forma compacta para espacios chicos (burbujas, chips): $1.5K / $2M; montos < 1000 usan la forma completa.
export function formatCompactCurrency(amount: number): string {
  if (amount >= 1_000_000) {
    const val = amount / 1_000_000;
    return `$${val.toFixed(val % 1 === 0 ? 0 : 1)}M`;
  }
  if (amount >= 1_000) {
    const val = amount / 1_000;
    return `$${val.toFixed(val % 1 === 0 ? 0 : 1)}K`;
  }
  return formatCurrency(amount);
}
