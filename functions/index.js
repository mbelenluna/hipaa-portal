// functions/index.js
// Node.js 22 + Firebase Functions (Gen 2)

const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

// ====== Opciones de despliegue (coinciden con tus logs) ======
const RUNTIME_OPTS = {
    region: "us-central1",        // Cloud Functions region
    eventarcRegion: "nam5",       // Firestore (default database) usa nam5
    retry: false,                 // No reintentar (evita email duplicados)
};

// ====== Inicializar Admin SDK ======
try {
    admin.initializeApp();
} catch (e) {
    console.warn("Admin already initialized (ok).");
}

// ====== Utilidades ======
function safe(obj, path, fallback = "") {
    return path.split(".").reduce((acc, k) => (acc && acc[k] !== undefined ? acc[k] : undefined), obj) ?? fallback;
}

function loadEmailCreds() {
    // 1) Firebase Functions config
    let cfg = {};
    try {
        cfg = functions.config();
    } catch {
        cfg = {};
    }

    // Tomamos en este orden: ENV → email.* → gmail.*
    const user =
        process.env.EMAIL_USER ||
        safe(cfg, "email.user") ||
        safe(cfg, "gmail.email") ||
        "";

    const pass =
        process.env.EMAIL_PASS ||
        safe(cfg, "email.pass") ||
        safe(cfg, "gmail.password") ||
        "";

    if (!user || !pass) {
        console.warn(
            'WARNING: Email credentials not set. ' +
            'Set with: firebase functions:config:set email.user="..." email.pass="..." ' +
            'or provide EMAIL_USER / EMAIL_PASS env vars. ' +
            '(Also supported: gmail.email / gmail.password)'
        );
    } else {
        console.log(`Mail config loaded for user: ${user}`);
    }

    return { user, pass };
}

const { user: MAIL_USER, pass: MAIL_PASS } = loadEmailCreds();

// Crear el transporter una vez (evita overhead)
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: MAIL_USER,
        pass: MAIL_PASS,
    },
});

// Formatea nombres de archivos sin URL (solo nombres)
function niceFiles(filesMaybe) {
    if (!filesMaybe) return "—";
    const files = Array.isArray(filesMaybe) ? filesMaybe : [filesMaybe];
    return files
        .map((f) => {
            if (!f) return "";
            if (typeof f === "string") {
                // extraer nombre (último segmento)
                try {
                    const url = new URL(f);
                    const pathname = url.pathname || f;
                    const last = pathname.split("/").pop();
                    return last || f;
                } catch {
                    // no es URL, devolver tal cual
                    return f.split("/").pop();
                }
            }
            // objetos {name, url} o similar
            return f.name || f.fileName || f.path?.split("/").pop() || "file";
        })
        .filter(Boolean)
        .join(", ");
}

function yesNo(v) {
    return v ? "YES" : "NO";
}

// ====== A) Al CREAR proyecto: notificación interna + cliente ======
exports.newProject_Notify_v2 = onDocumentCreated(
    { ...RUNTIME_OPTS, document: "projectRequests/{projectId}" },
    async (event) => {
        try {
            const snap = event.data; // QueryDocumentSnapshot
            if (!snap) {
                console.warn("newProject_Notify_v2: no snapshot");
                return;
            }
            const data = snap.data() || {};
            const docId = snap.id;

            const projectId = data.projectId || docId;
            const fullname = data.fullname || "";
            const email = data.email || "";
            const sourceLang = data.sourceLang || "";
            const targetLang = data.targetLang || "";
            const rush = !!data.rush;
            const notes = data.notes || "";
            const filesList = niceFiles(data.files || data.file);

            // ---- Email interno (sin adjuntos) ----
            const internalMail = {
                from: `Rolling Translations <${MAIL_USER || "no-reply@rolling-translations.com"}>`,
                to: "info@rolling-translations.com",
                subject: `[New Request] ${projectId} ${rush ? " (RUSH)" : ""}`,
                text: `
New translation request received.

Project ID: ${projectId}
Client: ${fullname} <${email}>
Source → Target: ${sourceLang} → ${targetLang}
Rush: ${yesNo(rush)}
Files: ${filesList}
Notes: ${notes || "—"}

Open Admin to review and assign.
`.trim(),
            };

            // ---- Email de confirmación al cliente ----
            let clientMail = null;
            if (email) {
                clientMail = {
                    from: `Rolling Translations <${MAIL_USER || "no-reply@rolling-translations.com"}>`,
                    to: email,
                    subject: "We received your translation request",
                    text: `
Hi ${fullname || "there"},

We successfully received your project.

Project ID: ${projectId}
Languages: ${sourceLang} → ${targetLang}
Rush: ${yesNo(rush)}
File(s): ${filesList}

You'll receive an email each time the project status changes.
For more details, you can visit your dashboard.

Best regards,
Rolling Translations
`.trim(),
                };
            }

            // Enviar
            await transporter.sendMail(internalMail);
            if (clientMail) await transporter.sendMail(clientMail);

            console.log("✅ newProject_Notify_v2: emails sent");
        } catch (err) {
            // No throw para no reintentar (retry: false)
            console.error("❌ newProject_Notify_v2 error:", err?.message || err);
        }
    }
);

// ====== B) Al ACTUALIZAR proyecto: notificación de cambio de estado ======
exports.statusChange_Notify_v2 = onDocumentUpdated(
    { ...RUNTIME_OPTS, document: "projectRequests/{projectId}" },
    async (event) => {
        try {
            const before = event.data?.before?.data() || {};
            const after = event.data?.after?.data() || {};

            // Enviar solo si el status cambió
            const prevStatus = before.status || "";
            const nextStatus = after.status || "";
            if (prevStatus === nextStatus) {
                console.log("statusChange_Notify_v2: status did not change, skipping.");
                return;
            }

            const email = after.email || "";
            if (!email) {
                console.warn("statusChange_Notify_v2: missing client email, skipping.");
                return;
            }

            const docId = event.data?.after?.id || "";
            const projectId = after.projectId || docId;
            const fullname = after.fullname || "";
            const sourceLang = after.sourceLang || "";
            const targetLang = after.targetLang || "";
            const filesList = niceFiles(after.files || after.file);

            const mail = {
                from: `Rolling Translations <${MAIL_USER || "no-reply@rolling-translations.com"}>`,
                to: email,
                subject: "Your project status has changed",
                text: `
Hello ${fullname || "there"},

The status of your project has changed.

Project ID: ${projectId}
Languages: ${sourceLang} → ${targetLang}
File(s): ${filesList}
New status: ${nextStatus || "—"}

For more information, please visit your dashboard.

Best regards,
Rolling Translations
`.trim(),
            };

            await transporter.sendMail(mail);
            console.log("✅ statusChange_Notify_v2: email sent");
        } catch (err) {
            console.error("❌ statusChange_Notify_v2 error:", err?.message || err);
        }
    }
);
