const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();

// 🔐 Read credentials from Firebase config
const gmailUser = functions.config().email.user;
const gmailPass = functions.config().email.pass;

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: gmailUser,
        pass: gmailPass,
    },
});

exports.sendNewProjectEmail = onDocumentCreated("projectRequests/{projectId}", async (event) => {
    const data = event.data.data();

    const mailOptions = {
        from: `"Rolling Translations" <${gmailUser}>`,
        to: "info@rolling-translations.com",
        subject: "🚀 New Translation Project Received",
        text: `
A new translation request has been submitted:

- Client Name: ${data.fullname}
- Client Email: ${data.email}
- Phone: ${data.phone}
- Source Language(s): ${data.sourceLang}
- Target Language(s): ${data.targetLang}
- Notes: ${data.notes}
- File Name: ${data.file}

Please log into the admin portal (Firebase Console) to review and process.

(This is an automated message - no PHI is transmitted in this email)
    `,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log("✅ Notification sent to Rolling Translations");
    } catch (error) {
        console.error("❌ Error sending email:", error);
    }
});
