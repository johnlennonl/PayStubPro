// taxes.js

// Objeto de configuración que define las tasas de impuestos federales, 
// estatales y locales para diferentes estados de EE. UU.
const TAX_RATES = {
  CO: {
    // Tasas federales (simuladas con tasas fijas)
    FIT_RATE: 0.09, // Federal Income Tax (Impuesto sobre la Renta Federal) - Tasa de simulación
    SS_RATE: 0.062, // Social Security Tax (Seguro Social) - Tasa real 6.2%
    MEDICARE_RATE: 0.0145, // Medicare Tax - Tasa real 1.45%
    
    // Impuestos Estatales y Locales de Colorado
    STATE_TAXES: [
      { name: "CO Income Tax", rate: 0.044 }, // Impuesto Estatal sobre la Renta de CO
      { name: "CO PFML", rate: 0.0045 }, // Paid Family and Medical Leave (Permiso Familiar Pagado)
      { name: "DENVER, CO O/P T", rate: 0.012 } // Impuesto O/P de la Ciudad de Denver
    ]
  },
  TX: {
    // Tasas federales (simuladas con tasas fijas)
    FIT_RATE: 0.09,
    SS_RATE: 0.062,
    MEDICARE_RATE: 0.0145,
    
    // Texas no tiene impuesto estatal sobre la renta
    STATE_TAXES: [] 
  },
  // 🌟🌟 NUEVO ESTADO AGREGADO: ILLINOIS (CHICAGO) 🌟🌟
  IL: {
    // Tasas federales
    FIT_RATE: 0.09,
    SS_RATE: 0.062,
    MEDICARE_RATE: 0.0145,
    
    // Impuestos Estatales y Locales de Illinois / Chicago
    STATE_TAXES: [
      { name: "IL Income Tax", rate: 0.0495 }, // Impuesto sobre la Renta Estatal de Illinois (tasa fija)
      // Nota: Chicago no tiene impuesto sobre la renta municipal general, pero sí tiene
      // un impuesto sobre salarios y ganancias para ciertas empresas (Employee Expense Tax).
      // Usaremos una tasa de simulación simple para representar los impuestos locales.
      { name: "CHICAGO Local Tax", rate: 0.005 } 
    ]
  }
  // Agrega más estados si necesitas
};