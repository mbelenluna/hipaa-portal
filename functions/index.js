// functions/index.js
// Node.js 22 + Firebase Functions (Gen 2)

const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onCall } = require("firebase-functions/v2/https"); // ✅ CORRECTED: Added onCall
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const { defineString } = require("firebase-functions/params");

// Define email credentials as parameters
const MAIL_USER = defineString("EMAIL_USER");
const MAIL_PASS = defineString("EMAIL_PASS");
const ADMIN_EMAIL = defineString("ADMIN_EMAIL");

// Initialize Admin SDK
try {
    admin.initializeApp();
} catch (e) {
    console.warn("Admin already initialized (ok).");
}

// Global transporter for sending emails
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: MAIL_USER.value(),
        pass: MAIL_PASS.value(),
    },
});

// Helper function to get language pairs
function getLangPair(data) {
    const sourceLang = data?.sourceLang?.join?.(", ") || data?.sourceLang || "—";
    const targetLang = data?.targetLang?.join?.(", ") || data?.targetLang || "—";
    return `${sourceLang} → ${targetLang}`;
}

// Helper function to format file names
function niceFiles(fileData) {
    if (Array.isArray(fileData)) {
        return fileData.map((f) => f.name || f).join(", ");
    }
    return fileData || "—";
}

// ========== A) On new project: send notification to client and admin ==========
exports.newProject_Notify_v2 = onDocumentCreated("projectRequests/{projectId}", async (event) => {
    try {
        const after = event?.data?.data?.() || {};
        const projectId = after.projectId || event.params.projectId || "—";
        const isRush = after.rush ? "Yes" : "No";

        if (!after.email) {
            console.log("newProject_Notify_v2: no client email, skipping.");
            return;
        }

        const mailToClient = {
            from: `"Rolling Translations" <${MAIL_USER.value()}>`,
            to: after.email,
            subject: `🎉 Your project request has been received! (ID: ${projectId})`,
            text: `
Hello ${after.fullname || "there"},

Thank you for submitting your project request. 

Project details:
- Project ID: ${projectId}
- Languages: ${getLangPair(after)}
- File(s): ${niceFiles(after.files || after.file)}
- Notes: ${after.notes || "—"}
- Rush: ${isRush}

You can view the status of your project in your client dashboard.

Best regards,
Rolling Translations
            `.trim(),
        };

        const mailToAdmin = {
            from: `"Rolling Translations" <${MAIL_USER.value()}>`,
            to: ADMIN_EMAIL.value(),
            subject: `🔔 New project request received! (ID: ${projectId})`,
            text: `
Hello,

A new project request has been submitted to the client portal.

Client: ${after.fullname || "—"}
Email: ${after.email}
Phone: ${after.phone || "—"}

Project details:
- Project ID: ${projectId}
- Languages: ${getLangPair(after)}
- File(s): ${niceFiles(after.files || after.file)}
- Notes: ${after.notes || "—"}
- Rush: ${isRush}

Please log in to your dashboard to review and process this request.
            `.trim(),
        };

        await transporter.sendMail(mailToClient);
        console.log("✅ newProject_Notify_v2: email to client sent.");

        await transporter.sendMail(mailToAdmin);
        console.log("✅ newProject_Notify_v2: email to admin sent.");
    } catch (err) {
        console.error("❌ newProject_Notify_v2 error:", err?.message || err);
    }
});

// ========== B) On project status update: send notification to client ==========
exports.statusChange_Notify_v2 = onDocumentUpdated("projectRequests/{projectId}", async (event) => {
    try {
        const before = event?.data?.before?.data?.() || {};
        const after = event?.data?.after?.data?.() || {};
        const projectId = after.projectId || event.params.projectId || "—";

        if (!after.email) {
            console.log("statusChange_Notify_v2: no client email, skipping.");
            return;
        }
        if (before.status === after.status) {
            console.log("statusChange_Notify_v2: status unchanged, skipping.");
            return;
        }

        const mail = {
            from: `"Rolling Translations" <${MAIL_USER.value()}>`,
            to: after.email,
            subject: `📣 Status update for your project ${projectId}`,
            text: `
Hello ${after.fullname || "there"},

The status of your project has been updated.

Project details:
- Project ID: ${projectId}
- Languages: ${getLangPair(after)}
- File(s): ${niceFiles(after.files || after.file)}
- New status: ${after.status || "—"}

Best regards,
Rolling Translations
            `.trim(),
        };

        await transporter.sendMail(mail);
        console.log("✅ statusChange_Notify_v2: email sent.");
    } catch (err) {
        console.error("❌ statusChange_Notify_v2 error:", err?.message || err);
    }
});


// ✅ NEW: makeUserAdmin function with 2nd Gen syntax
// ✅ NEW: makeUserAdmin function with 2nd Gen syntax
exports.makeUserAdmin = onCall(async (request) => {
    // Check if the user is authenticated and has permission to set the claim
    if (!request.auth) {
        throw new onCall.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    
    // Get the UID of the user to be made an admin
    const uid = request.data.uid;
    if (!uid) {
        throw new onCall.HttpsError('invalid-argument', 'The user ID must be provided.');
    }
    
    try {
        // Set the custom claim
        await admin.auth().setCustomUserClaims(uid, { admin: true });
        
        // Return success message
        return { message: `User ${uid} is now an admin!` };
    } catch (error) {
        throw new onCall.HttpsError('internal', `Unable to make user admin: ${error.message}`);
    }
});