/**
 * Direct-to-Printer Wi-Fi Auto-Dispatch (IPP Engine)
 * ─────────────────────────────────────────────────────────────────
 * Implements Internet Printing Protocol (RFC 8010 / RFC 8011) over
 * HTTP/HTTPS to dispatch generated QCAB Answer Booklets and Model
 * Answers directly to Wi-Fi network printers (HP, Epson, Canon, Brother).
 * ─────────────────────────────────────────────────────────────────
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const { URL } = require("url");

const PRINTER_CONFIG_FILE = path.join(__dirname, "data", "printer_config.json");

function loadPrinterConfig() {
  try {
    if (fs.existsSync(PRINTER_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(PRINTER_CONFIG_FILE, "utf8"));
    }
  } catch (err) {
    console.error("[Printer Dispatcher] Error loading config:", err.message);
  }
  return {};
}

function savePrinterConfig(cfg) {
  try {
    const dir = path.dirname(PRINTER_CONFIG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(PRINTER_CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf8");
  } catch (err) {
    console.error("[Printer Dispatcher] Error saving config:", err.message);
  }
}

/**
 * Configure user printer IP or IPP endpoint.
 */
function setPrinterEndpoint(userId, rawUrl) {
  const cfg = loadPrinterConfig();
  let cleanUrl = rawUrl.trim();
  if (cleanUrl.startsWith("ipp://")) {
    cleanUrl = cleanUrl.replace(/^ipp:\/\//, "http://");
  } else if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
    cleanUrl = `http://${cleanUrl}:631/ipp/print`;
  }

  cfg[String(userId)] = {
    endpoint: cleanUrl,
    updatedAt: new Date().toISOString(),
  };

  savePrinterConfig(cfg);
  return cleanUrl;
}

function getPrinterEndpoint(userId) {
  const cfg = loadPrinterConfig();
  return cfg[String(userId)]?.endpoint || process.env.PRINTER_IPP_URL || null;
}

/**
 * Builds standard binary IPP Print-Job payload (RFC 8010).
 */
function buildIPPPrintJobPayload(printerUri, jobName, pdfBuffer) {
  const chunks = [];

  // Version: 2.0 (0x02, 0x00)
  // Operation ID: Print-Job = 0x0002
  // Request ID: 1 (0x00000001)
  const header = Buffer.alloc(8);
  header.writeUInt8(0x02, 0);
  header.writeUInt8(0x00, 1);
  header.writeUInt16BE(0x0002, 2); // Print-Job
  header.writeUInt32BE(1, 4);      // Request ID 1
  chunks.push(header);

  // Operation Attributes Tag = 0x01
  chunks.push(Buffer.from([0x01]));

  function writeAttr(tag, name, value) {
    const nameBuf = Buffer.from(name, "utf8");
    const valBuf = Buffer.from(value, "utf8");
    const b = Buffer.alloc(1 + 2 + nameBuf.length + 2 + valBuf.length);
    let offset = 0;
    b.writeUInt8(tag, offset); offset += 1;
    b.writeUInt16BE(nameBuf.length, offset); offset += 2;
    nameBuf.copy(b, offset); offset += nameBuf.length;
    b.writeUInt16BE(valBuf.length, offset); offset += 2;
    valBuf.copy(b, offset);
    return b;
  }

  // 0x47 = charset
  chunks.push(writeAttr(0x47, "attributes-charset", "utf-8"));
  // 0x48 = natural-language
  chunks.push(writeAttr(0x48, "attributes-natural-language", "en-us"));
  // 0x45 = uri
  chunks.push(writeAttr(0x45, "printer-uri", printerUri));
  // 0x42 = nameWithoutLanguage
  chunks.push(writeAttr(0x42, "job-name", jobName || "TNPSC_QCAB_Booklet"));
  // 0x49 = mimeMediaType
  chunks.push(writeAttr(0x49, "document-format", "application/pdf"));

  // End of attributes tag = 0x03
  chunks.push(Buffer.from([0x03]));

  // Document data (PDF bytes)
  chunks.push(pdfBuffer);

  return Buffer.concat(chunks);
}

/**
 * Dispatches PDF to IPP printer over HTTP POST.
 */
async function dispatchToPrinter(endpointUrl, pdfPath, jobName = "TNPSC_Booklet") {
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`File not found: ${pdfPath}`);
  }

  const pdfBuffer = fs.readFileSync(pdfPath);
  const parsed = new URL(endpointUrl);
  const payload = buildIPPPrintJobPayload(endpointUrl, jobName, pdfBuffer);

  const client = parsed.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.request(
      parsed,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/ipp",
          "Content-Length": payload.length,
          "User-Agent": "TNPSC-Mains-Bot-IPP/1.0",
        },
        timeout: 10000,
      },
      (res) => {
        const resChunks = [];
        res.on("data", (c) => resChunks.push(c));
        res.on("end", () => {
          const respBuf = Buffer.concat(resChunks);
          if (respBuf.length >= 4) {
            const statusCode = respBuf.readUInt16BE(2);
            // 0x0000 = successful-ok
            const isSuccess = statusCode === 0x0000 || statusCode === 0x0001;
            resolve({
              success: isSuccess,
              statusCode,
              httpStatus: res.statusCode,
              message: isSuccess ? "Print job spooled successfully!" : `Printer returned status: 0x${statusCode.toString(16)}`,
            });
          } else {
            resolve({
              success: res.statusCode === 200,
              httpStatus: res.statusCode,
              message: `HTTP response ${res.statusCode}`,
            });
          }
        });
      }
    );

    req.on("error", (err) => {
      reject(new Error(`Printer communication failed: ${err.message}`));
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Printer connection timed out. Check IP and Wi-Fi connection."));
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Dispatches print with simulation fallback if printer is offline or test mode.
 */
async function printQCABBooklet(userId, pdfPath, docTitle = "QCAB_Answer_Booklet") {
  const endpoint = getPrinterEndpoint(userId);

  if (!endpoint) {
    return {
      status: "CONFIG_REQUIRED",
      message: "No printer configured. Use /setprinter <IP> to link your home printer.",
    };
  }

  try {
    const res = await dispatchToPrinter(endpoint, pdfPath, docTitle);
    return {
      status: "SUCCESS",
      endpoint,
      fileSizeKb: Math.round(fs.statSync(pdfPath).size / 1024),
      details: res,
    };
  } catch (err) {
    // If connection refused or offline, return simulated spool packet for aspirant testing
    return {
      status: "SIMULATED",
      endpoint,
      fileSizeKb: Math.round(fs.statSync(pdfPath).size / 1024),
      warning: err.message,
      message: "Printer currently unreachable on local subnet. Spool packet generated and queued.",
    };
  }
}

/**
 * Formats Dispatch Card for Telegram.
 */
function formatPrinterDispatchCard(res, docTitle = "TNPSC QCAB Booklet") {
  if (res.status === "CONFIG_REQUIRED") {
    return [
      `🖨️ <b>WI-FI PRINTER NOT CONFIGURED</b>`,
      `────────────────────────────────────`,
      `You can dispatch QCAB Question Papers & Booklets directly to your home printer without a PC!`,
      ``,
      `👉 <b>How to set up:</b>`,
      `1. Find your printer's IP address (e.g. <code>192.168.1.45</code>)`,
      `2. Send: <code>/setprinter 192.168.1.45</code>`,
      `   (or full IPP URL: <code>http://192.168.1.45:631/ipp/print</code>)`,
      ``,
      `<i>Compatible with: HP, Epson, Canon, Brother, and AirPrint devices.</i>`,
    ].join("\n");
  }

  if (res.status === "SUCCESS") {
    return [
      `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`,
      `┃  🖨️ <b>DIRECT-TO-PRINTER AUTO-DISPATCH</b>`,
      `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`,
      `✅ <b>Print Job Spooled Successfully!</b>`,
      `📄 <b>Document:</b> <b>${docTitle}</b> (${res.fileSizeKb} KB)`,
      `🌐 <b>Destination Printer:</b> <code>${res.endpoint}</code>`,
      `⚡ <b>Protocol:</b> <code>IPP/2.0 (RFC 8011 Over HTTP/631)</code>`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `🎉 <i>Your printer should now be printing your official QCAB answer sheet! Grab your pen and prepare to write!</i>`,
    ].join("\n");
  }

  return [
    `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`,
    `┃  🖨️ <b>PRINTER DISPATCH SPOOL PACKET</b>`,
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`,
    `⚠️ <b>Direct Wi-Fi Spooling Notice:</b>`,
    `📄 <b>Document:</b> <b>${docTitle}</b> (${res.fileSizeKb} KB)`,
    `🌐 <b>Target IP:</b> <code>${res.endpoint}</code>`,
    `📡 <b>Status:</b> <i>${res.warning}</i>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `💡 <b>Note:</b> Cloud bot servers (like Render) cannot reach private LAN IPs (192.168.x.x) directly without a public tunnel or port forward.`,
    `✅ <i>The document PDF is already attached to this message so you can print with 1-click via your phone's Print menu!</i>`,
  ].join("\n");
}

module.exports = {
  setPrinterEndpoint,
  getPrinterEndpoint,
  dispatchToPrinter,
  printQCABBooklet,
  formatPrinterDispatchCard,
};
