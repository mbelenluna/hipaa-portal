// functions/index.js
// Node.js 22 + Firebase Functions (Gen 2)

const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

// Inicializa Admin SDK (evita error en entornos que recargan)
try {
    admin.initializeApp();
} catch (e) {
    console.warn("Admin already initialized (ok).");
}

/**
 * Config segura: no crashea si falta functions:config
 * - Usa functions:config (email.user / email.pass) si existe
 * - O variables de entorno EMAIL_USER / EMAIL_PASS como fallback
 */
const cfg = {};
const gmailUser = cfg.email?.user || process.env.EMAIL_USER || "";
const gmailPass = cfg.email?.pass || process.env.EMAIL_PASS || "";

if (!gmailUser || !gmailPass) {
    console.warn(
        "WARNING: Email credentials not set. " +
        'Run: firebase functions:config:set email.user="..." email.pass="..." ' +
        "or provide EMAIL_USER / EMAIL_PASS env vars."
    );
}

// Transporter global: si faltan credenciales, fallará al enviar, no al bootear
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailPass },
});

// Helpers
const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const niceFiles = (files) => {
    const arr = asList(files).map((f) => (typeof f === "string" ? f : f?.name || f?.fileName || ""));
    return arr.filter(Boolean).join(", ") || "—";
};
const getLangPair = (obj) => {
    const src = obj?.sourceLang || obj?.sourceLanguage || "—";
    const trg = obj?.targetLang || obj?.targetLanguage || "—";
    return `${src} → ${trg}`;
};

// ========== A) Al CREAR proyecto: notificación interna + confirmación al cliente ==========
exports.newProject_Notify_v2 = onDocumentCreated("projectRequests/{projectId}", async (event) => {
    try {
        const snap = event.data;
        if (!snap || !snap.data) {
            console.warn("newProject_Notify_v2: no snapshot data");
            return;
        }
        const data = snap.data() || {};
        const projectId = data.projectId || event.params.projectId || "—";

        // Email interno
        const internalMail = {
            from: `"Rolling Translations" <${gmailUser || "no-reply@rolling-translations.com"}>`,
            to: "info@rolling-translations.com",
            subject: "🚀 New Translation Project Received",
            text: `
A new translation request has been submitted:

- Client Name: ${data.fullname || "—"}
- Client Email: ${data.email || "—"}
- Phone: ${data.phone || "—"}
- Languages: ${getLangPair(data)}
- Notes: ${data.notes || "—"}
- File Name(s): ${niceFiles(data.files || data.file)}
- Project ID: ${projectId}
- Rush: ${data.rush ? "YES" : "No"}

(Automated message)
`.trim(),
        };

        // Email al cliente (si hay email)
        const clientMail = data.email
            ? {
                from: `"Rolling Translations" <${gmailUser || "no-reply@rolling-translations.com"}>`,
                to: data.email,
                subject: "✅ Your translation request was received",
                text: `
Hello ${data.fullname || ""},

Your project has been successfully received and entered into our system. We're on it!

Details:
- Project ID: ${projectId}
- Languages: ${getLangPair(data)}
- File(s): ${niceFiles(data.files || data.file)}
- Rush: ${data.rush ? "YES (RUSH)" : "No"}

You'll receive status updates by email.

Best regards,
Rolling Translations
`.trim(),
            }
            : null;

        // Envíos
        await transporter.sendMail(internalMail);
        if (clientMail) await transporter.sendMail(clientMail);

        console.log("✅ newProject_Notify_v2: emails sent");
    } catch (err) {
        // No throw para no reintentar (retryPolicy es DO_NOT_RETRY)
        console.error("❌ newProject_Notify_v2 error:", err?.message || err);
    }
});

// ========== B) Al ACTUALIZAR proyecto: notificación de cambio de estado al cliente ==========
exports.statusChange_Notify_v2 = onDocumentUpdated("projectRequests/{projectId}", async (event) => {
    try {
        const before = event?.data?.before?.data?.() || {};
        const after = event?.data?.after?.data?.() || {};
        const projectId = after.projectId || event.params.projectId || "—";

        // Reglas de salida temprana
        if (!after.email) {
            console.log("statusChange_Notify_v2: no client email, skipping");
            return;
        }
        if (before.status === after.status) {
            console.log("statusChange_Notify_v2: status unchanged, skipping");
            return;
        }

        const mail = {
            from: `"Rolling Translations" <${gmailUser || "no-reply@rolling-translations.com"}>`,
            to: after.email,
            subject: `📣 Status update for your project ${projectId}`,
            text: `
Hello ${after.fullname || ""},

The status of your project has been updated.

Details:
- Project ID: ${projectId}
- Languages: ${getLangPair(after)}
- File(s): ${niceFiles(after.files || after.file)}
- New status: ${after.status || "—"}

Best regards,
Rolling Translations
`.trim(),
        };

        await transporter.sendMail(mail);
        console.log("✅ statusChange_Notify_v2: email sent");
    } catch (err) {
        console.error("❌ statusChange_Notify_v2 error:", err?.message || err);
    }
});
