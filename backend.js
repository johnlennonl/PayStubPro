// backend.js

const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin'); // Necesario para acceder a Firestore y datos
const PDFDocument = require('pdfkit'); // 👈 ¡NUEVO!
const app = express();
const port = process.env.PORT || 5000; // Usa el puerto de Render o 5000 localmente


// Middleware (Necesario para Render y Express)
// Ajusta 'http://127.0.0.1:5500' a la URL de tu frontend si lo despliegas.
app.use(cors({ origin: '*' })); // '*' permite acceso desde cualquier origen (más fácil para pruebas)
app.use(express.json());

// =========================================================
// ⚠️ ATENCIÓN: CONFIGURACIÓN DE FIREBASE ADMIN (CRUCIAL) ⚠️
// =========================================================

// Usar variables de entorno para Render (la mejor práctica)
let db;

try {
    // La variable de entorno (JSON) viene como una cadena, la parseamos a objeto
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });

    db = admin.firestore();
    console.log("Firebase Admin SDK inicializado con éxito.");

} catch (error) {
    console.error("ERROR CRÍTICO: No se pudo inicializar Firebase Admin SDK.");
    console.error("Asegúrate de que la variable FIREBASE_SERVICE_ACCOUNT_KEY esté configurada y sea JSON válido.");
    // Esto previene que el servidor se caiga localmente si la variable no está
    // pero permite que Render la inyecte. Si falla en Render, el log lo mostrará.
}
// =========================================================

// Ruta de PRUEBA (Para verificar que Render funcione)
app.get('/', (req, res) => {
    res.send('Servidor Backend de PayStub OK. Listo para la descarga. ¡La magia está en /api/download-paystub!');
});

// =========================================================
// RUTA CRUCIAL PARA LA DESCARGA
// =========================================================
app.get('/api/download-paystub', async (req, res) => {
    const { clientId, paystubId } = req.query;

    if (!clientId || !paystubId) {
        return res.status(400).send({ error: 'Faltan parámetros clientId o paystubId.' });
    }
    
    if (!db) {
        return res.status(503).send({ error: 'Servicio de base de datos no disponible.' });
    }

    try {
        // 1. OBTENER DATOS DE FIRESTORE
        const paystubRef = db.collection('clients').doc(clientId).collection('paystubs').doc(paystubId);
        const paystubDoc = await paystubRef.get();

        if (!paystubDoc.exists) {
            return res.status(404).send({ error: `Paystub con ID ${paystubId} no encontrado.` });
        }
        
        const paystubData = paystubDoc.data();
        
        // 2. CONFIGURAR LA RESPUESTA PARA EL PDF
        const doc = new PDFDocument({ size: 'LETTER' });
        const fileName = `paystub_${paystubId}.pdf`;

        res.setHeader('Content-Type', 'application/pdf'); 
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`); 

        // 3. GENERAR EL PDF USANDO PDFKIT
        
        // El documento (doc) se envía (pipe) directamente a la respuesta HTTP (res)
        doc.pipe(res); 

        const dateString = paystubData.date && paystubData.date.toDate ? paystubData.date.toDate().toLocaleDateString('es-ES') : 'N/A';
        const formatCurrency = (amount) => `$${(amount || 0).toFixed(2)}`;
        
        // --- Contenido del PDF ---
        doc.fontSize(20).text('COMPROBANTE DE PAGO (PAYSTUB)', { align: 'center' }).moveDown();
        
        // Información General
        doc.fontSize(12)
           .text(`Cliente ID: ${clientId}`, { continued: true })
           .text(`Paystub ID: ${paystubId}`, { align: 'right' })
           .moveDown(0.5);
           
        doc.text(`Fecha de Pago: ${dateString}`).moveDown(1);
        
        // Resumen Financiero
        doc.fontSize(16).fillColor('green').text('RESUMEN FINANCIERO', { underline: true }).moveDown(0.5);
        
        doc.fontSize(12).fillColor('black')
           .text('Gross Pay (Bruto):', { continued: true })
           .fillColor('green').text(formatCurrency(paystubData.grossPayPeriod), { align: 'right' })
           .moveDown(0.2);

        doc.fillColor('black')
           .text('Total Impuestos:', { continued: true })
           .fillColor('red').text(formatCurrency(paystubData.totalTaxPeriod), { align: 'right' })
           .moveDown(0.2);

        doc.fillColor('black').text('-----------------------------------', { align: 'right' }).moveDown(0.2);
           
        doc.fontSize(14)
           .text('Net Pay (Neto):', { continued: true })
           .fillColor('blue').text(formatCurrency(paystubData.netPayPeriod), { align: 'right' })
           .moveDown(2);
           
        // Nota final
        doc.fontSize(10).fillColor('gray').text(`Documento generado electrónicamente. No requiere firma.`, { align: 'center' });

        // Finalizar el documento
        doc.end(); 
        
    } catch (error) {
        console.error(`Error interno al generar o buscar paystub:`, error);
        res.status(500).send({ error: 'Error interno del servidor al procesar la descarga. Revise los logs.' });
    }
});
// =========================================================



// =========================================================
// GESTIÓN DE ERRORES 404 (AGREGAR AL FINAL DEL ARCHIVO)
// =========================================================
app.use((req, res, next) => {
    // Si ninguna de las rutas anteriores manejó la solicitud,
    // significa que la ruta no existe, devolvemos un 404
    if (req.originalUrl.startsWith('/api/')) {
        res.status(404).json({ error: 'Endpoint de API no encontrado. Revisa la URL.' });
    } else {
        // Podrías devolver aquí tu página 404 estática si tuvieras una
        res.status(404).send('Error 404: Recurso no encontrado.');
    }
});

// Iniciar el servidor
app.listen(port, () => {
    console.log(`Servidor Express escuchando en http://localhost:${port}`);
    console.log(`Frontend URL: http://127.0.0.1:5500`);
});